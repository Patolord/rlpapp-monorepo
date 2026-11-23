import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { normalizeBarcode } from "../procurement/catalog";
import { createMaterialInternal } from "../procurement/materials";
import {
  findExactMatch,
  findSimilarMaterials,
  resolveLiveMaterial,
  type CaptureItemInput,
  type ExactMatchReason,
} from "./captureMatching";
import { createInventoryDocument } from "./documents";
import {
  findInventoryLocation,
  getOrCreateCentralLocation,
  getOrCreateProjectLocation,
} from "./locations";
import { postInventoryDocument } from "./posting";
import { canViewCentralInventory } from "./stockPolicy";

/**
 * Cadastro em campo pelo celular: a pessoa lê o código ou digita o item, vê
 * se ele já existe e lança a contagem no local onde está (central ou obra).
 *
 * - Já existe (código, identidade ou apelido): a contagem soma (ou corrige o
 *   saldo) no material existente; nunca cria outro.
 * - Novo e sem parecidos, ou confirmado como novo por quem viu os parecidos:
 *   cria o material ativo.
 * - Novo com parecidos não vistos (ex.: capturado sem sinal): cria em
 *   rascunho, com a lista de parecidos, para Compras manter ou mesclar.
 *
 * Idempotente pelo `clientId` gerado no aparelho (fila offline).
 */

export type CaptureMaterialInput = {
  clientId: string;
  projectId?: Id<"projects">;
  materialId?: Id<"materials">;
  item?: CaptureItemInput;
  confirmedNew?: boolean;
  quantityMode?: "add" | "set";
  quantity: number;
  physicalAddress?: string;
  notes?: string;
  photoId?: Id<"_storage">;
  offline?: boolean;
  capturedAt: number;
};

type Outcome = Doc<"materialCaptures">["outcome"];
type MatchReason = Doc<"materialCaptures">["matchReason"];

export type CaptureResult = {
  captureId: Id<"materialCaptures">;
  replayed: boolean;
  outcome: Outcome;
  matchReason: MatchReason;
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  unit: string | null;
  quantityDelta: number;
  quantityHere: number;
  similarCount: number;
};

export type CaptureCandidate = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  unit: string | null;
  category: string | null;
  barcode: string | null;
  status: "draft" | "active" | "archived";
  reason: ExactMatchReason | "similar";
  quantityHere: number | null;
  physicalAddress: string | null;
  imageUrl: string | null;
};

const MAX_TEXT = 200;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_TEXT) {
    throw new Error(`Texto muito longo (máximo ${MAX_TEXT} caracteres)`);
  }
  return trimmed;
}

function cleanItem(item: CaptureItemInput): CaptureItemInput {
  return {
    name: clean(item.name) ?? "",
    variantLabel: clean(item.variantLabel),
    unit: clean(item.unit),
    category: clean(item.category),
    barcode: clean(item.barcode),
    manufacturer: clean(item.manufacturer),
    manufacturerPartNumber: clean(item.manufacturerPartNumber),
    spec: clean(item.spec),
  };
}

function assertCanUseLocation(
  user: Doc<"users">,
  projectId: Id<"projects"> | undefined
): void {
  if (!projectId && !canViewCentralInventory(user)) {
    throw new Error("Seu usuário não pode contar o estoque central");
  }
}

async function balanceAt(
  ctx: QueryCtx | MutationCtx,
  locationId: Id<"inventoryLocations"> | undefined,
  materialId: Id<"materials">
): Promise<Doc<"inventoryBalances"> | null> {
  if (!locationId) return null;
  return await ctx.db
    .query("inventoryBalances")
    .withIndex("by_location_material", (q) =>
      q.eq("locationId", locationId).eq("materialId", materialId)
    )
    .unique();
}

async function toCandidate(
  ctx: QueryCtx,
  material: Doc<"materials">,
  reason: CaptureCandidate["reason"],
  locationId: Id<"inventoryLocations"> | undefined
): Promise<CaptureCandidate> {
  const balance = await balanceAt(ctx, locationId, material._id);
  return {
    materialId: material._id,
    name: material.name,
    variantLabel: material.variantLabel ?? null,
    sku: material.sku ?? null,
    unit: material.unit ?? null,
    category: material.category ?? null,
    barcode: material.barcode ?? null,
    status: material.status ?? (material.active ? "active" : "archived"),
    reason,
    quantityHere: balance ? balance.quantity : null,
    physicalAddress: balance?.physicalAddress ?? null,
    imageUrl: material.imageId ? await ctx.storage.getUrl(material.imageId) : null,
  };
}

/**
 * Consulta ao vivo enquanto a pessoa digita ou logo após ler o código: o
 * material certo (se houver) e os parecidos, com o saldo no local escolhido.
 */
export async function lookupCapture(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: {
    projectId?: Id<"projects">;
    code?: string;
    item?: CaptureItemInput;
  }
): Promise<{ exact: CaptureCandidate | null; similar: CaptureCandidate[] }> {
  assertCanUseLocation(user, input.projectId);
  const location = await findInventoryLocation(ctx, input.projectId);
  const item = cleanItem({
    ...(input.item ?? { name: "" }),
    barcode: input.code ?? input.item?.barcode,
  });
  const exact = await findExactMatch(ctx, item);
  const similar = item.name
    ? await findSimilarMaterials(ctx, item, {
        excludeMaterialId: exact?.material._id,
      })
    : [];
  return {
    exact: exact
      ? await toCandidate(ctx, exact.material, exact.reason, location?._id)
      : null,
    similar: await Promise.all(
      similar.map((material) =>
        toCandidate(ctx, material, "similar", location?._id)
      )
    ),
  };
}

/** Completa o material existente com o que veio do campo (sem sobrescrever). */
async function enrichExisting(
  ctx: MutationCtx,
  material: Doc<"materials">,
  item: CaptureItemInput | undefined,
  photoId: Id<"_storage"> | undefined
): Promise<void> {
  const patch: Partial<Doc<"materials">> = {};
  const barcode = item?.barcode ? normalizeBarcode(item.barcode) : undefined;
  if (barcode && !material.barcode) {
    const taken = await ctx.db
      .query("materials")
      .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
      .first();
    if (!taken) {
      patch.barcode = barcode;
      patch.searchText = [material.searchText, barcode.toLowerCase()]
        .filter(Boolean)
        .join(" ");
    }
  }
  if (photoId && !material.imageId) patch.imageId = photoId;
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch("materials", material._id, {
      ...patch,
      updatedAt: Date.now(),
    });
  }
}

async function resolveMaterial(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CaptureMaterialInput,
  item: CaptureItemInput | undefined
): Promise<{
  material: Doc<"materials">;
  outcome: Outcome;
  matchReason: MatchReason;
  similarIds: Id<"materials">[];
}> {
  if (input.materialId) {
    const material = await resolveLiveMaterial(
      ctx,
      await ctx.db.get("materials", input.materialId)
    );
    if (!material) throw new Error("Material não encontrado ou arquivado");
    await enrichExisting(ctx, material, item, input.photoId);
    return { material, outcome: "matched", matchReason: "chosen", similarIds: [] };
  }

  if (!item?.name && !item?.barcode) {
    throw new Error("Informe o nome do material ou leia o código");
  }
  const exact = item ? await findExactMatch(ctx, item) : null;
  if (exact) {
    await enrichExisting(ctx, exact.material, item, input.photoId);
    return {
      material: exact.material,
      outcome: "matched",
      matchReason: exact.reason,
      similarIds: [],
    };
  }
  if (!item?.name) {
    throw new Error("Código não cadastrado: informe o nome do material");
  }

  const similar = await findSimilarMaterials(ctx, item);
  const needsReview = similar.length > 0 && !input.confirmedNew;
  const created = await createMaterialInternal(ctx, user, {
    name: item.name,
    variantLabel: item.variantLabel,
    unit: item.unit,
    category: item.category,
    barcode: item.barcode,
    manufacturer: item.manufacturer,
    manufacturerPartNumber: item.manufacturerPartNumber,
    spec: item.spec,
    imageId: input.photoId,
    status: needsReview ? "draft" : "active",
  });
  const material = await ctx.db.get("materials", created.materialId);
  if (!material) throw new Error("Falha ao cadastrar o material");
  return {
    material,
    outcome: needsReview ? "review" : "created",
    matchReason: "new",
    similarIds: similar.map((m) => m._id),
  };
}

/** Lança a contagem: entrada no central, ajuste na obra; "set" corrige o total. */
async function postCount(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    projectId?: Id<"projects">;
    locationId: Id<"inventoryLocations">;
    materialId: Id<"materials">;
    quantityMode: "add" | "set";
    quantity: number;
    notes?: string;
  }
): Promise<{ delta: number; documentId?: Id<"inventoryDocuments"> }> {
  const current = (await balanceAt(ctx, input.locationId, input.materialId))?.quantity ?? 0;
  const delta = input.quantityMode === "set" ? input.quantity - current : input.quantity;
  if (Math.abs(delta) < 0.0000001) return { delta: 0 };
  const type = !input.projectId && delta > 0 ? "entry" : "adjustment";
  const authorization = { capture: true };
  const created = await createInventoryDocument(
    ctx,
    user,
    {
      type,
      projectId: input.projectId,
      reference: "Cadastro em campo",
      notes:
        input.notes ??
        (input.quantityMode === "set" ? "Contagem: saldo corrigido para o contado" : undefined),
      lines: [{ materialId: input.materialId, quantity: delta }],
    },
    authorization
  );
  await postInventoryDocument(ctx, user, created.documentId, authorization);
  return { delta, documentId: created.documentId };
}

async function saveAddress(
  ctx: MutationCtx,
  location: Doc<"inventoryLocations">,
  materialId: Id<"materials">,
  physicalAddress: string | undefined
): Promise<void> {
  // Endereço físico só existe no estoque central (como no web).
  if (!physicalAddress || location.type !== "central") return;
  const balance = await balanceAt(ctx, location._id, materialId);
  const now = Date.now();
  if (balance) {
    await ctx.db.patch("inventoryBalances", balance._id, { physicalAddress, updatedAt: now });
  } else {
    await ctx.db.insert("inventoryBalances", {
      locationId: location._id,
      materialId,
      quantity: 0,
      physicalAddress,
      updatedAt: now,
    });
  }
}

async function toResult(
  ctx: MutationCtx,
  capture: Doc<"materialCaptures">,
  replayed: boolean
): Promise<CaptureResult> {
  const material = await ctx.db.get("materials", capture.materialId);
  const balance = await balanceAt(ctx, capture.locationId, capture.materialId);
  return {
    captureId: capture._id,
    replayed,
    outcome: capture.outcome,
    matchReason: capture.matchReason,
    materialId: capture.materialId,
    name: material?.name ?? capture.input.name ?? "Material",
    variantLabel: material?.variantLabel ?? null,
    sku: material?.sku ?? null,
    unit: material?.unit ?? null,
    quantityDelta: capture.quantityDelta,
    quantityHere: balance?.quantity ?? 0,
    similarCount: capture.similarMaterialIds.length,
  };
}

export async function captureMaterial(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CaptureMaterialInput
): Promise<CaptureResult> {
  const clientId = input.clientId.trim();
  if (!clientId || clientId.length > 80) throw new Error("Identificador do cadastro inválido");
  const previous = await ctx.db
    .query("materialCaptures")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique();
  if (previous) {
    if (previous.capturedByUserId !== user._id) {
      throw new Error("Identificador do cadastro inválido");
    }
    return await toResult(ctx, previous, true);
  }

  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new Error("A quantidade deve ser zero ou maior");
  }
  assertCanUseLocation(user, input.projectId);
  const location = input.projectId
    ? await getOrCreateProjectLocation(ctx, input.projectId)
    : await getOrCreateCentralLocation(ctx);
  const item = input.item ? cleanItem(input.item) : undefined;
  const quantityMode = input.quantityMode ?? "add";

  const { material, outcome, matchReason, similarIds } = await resolveMaterial(
    ctx,
    user,
    input,
    item
  );
  const notes = clean(input.notes);
  const count = await postCount(ctx, user, {
    projectId: input.projectId,
    locationId: location._id,
    materialId: material._id,
    quantityMode,
    quantity: input.quantity,
    notes,
  });
  const physicalAddress = clean(input.physicalAddress);
  await saveAddress(ctx, location, material._id, physicalAddress);

  const now = Date.now();
  const captureId = await ctx.db.insert("materialCaptures", {
    clientId,
    locationId: location._id,
    projectId: input.projectId,
    materialId: material._id,
    outcome,
    matchReason,
    similarMaterialIds: similarIds,
    input: item ?? {},
    quantityMode,
    countedQuantity: input.quantity,
    quantityDelta: count.delta,
    physicalAddress: location.type === "central" ? physicalAddress : undefined,
    notes,
    photoId: input.photoId,
    documentId: count.documentId,
    offline: Boolean(input.offline),
    capturedAt: input.capturedAt,
    capturedByUserId: user._id,
    createdAt: now,
  });
  if (outcome === "matched") {
    await logAudit(ctx, user, {
      action: "capture",
      tableName: "materialCaptures",
      recordId: captureId,
      details: `${material.sku ?? material.name}: contagem ${input.quantity} (${quantityMode})`,
    });
  }
  const capture = await ctx.db.get("materialCaptures", captureId);
  if (!capture) throw new Error("Falha ao registrar o cadastro");
  return await toResult(ctx, capture, false);
}

/** Últimos cadastros da pessoa (lista "Feitos" no celular). */
export async function listMyCaptures(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { limit?: number }
) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const captures = await ctx.db
    .query("materialCaptures")
    .withIndex("by_captured_by", (q) => q.eq("capturedByUserId", user._id))
    .order("desc")
    .take(limit);
  return await Promise.all(
    captures.map(async (capture) => {
      const [material, location] = await Promise.all([
        ctx.db.get("materials", capture.materialId),
        ctx.db.get("inventoryLocations", capture.locationId),
      ]);
      return {
        _id: capture._id,
        clientId: capture.clientId,
        outcome: capture.outcome,
        matchReason: capture.matchReason,
        materialId: capture.materialId,
        name: material?.name ?? capture.input.name ?? "Material",
        variantLabel: material?.variantLabel ?? null,
        sku: material?.sku ?? null,
        unit: material?.unit ?? null,
        materialStatus: material?.status ?? (material?.active ? "active" : "archived"),
        locationName: location?.name ?? "Estoque",
        quantityMode: capture.quantityMode,
        countedQuantity: capture.countedQuantity,
        physicalAddress: capture.physicalAddress ?? null,
        offline: capture.offline,
        capturedAt: capture.capturedAt,
      };
    })
  );
}

/**
 * Catálogo enxuto para o celular guardar e conferir duplicatas sem sinal.
 * Paginado: o app baixa as páginas em sequência e guarda no aparelho.
 */
export async function captureCatalogPage(
  ctx: QueryCtx,
  input: { cursor: string | null; numItems: number }
) {
  const numItems = Math.min(Math.max(input.numItems, 1), 500);
  const page = await ctx.db
    .query("materials")
    .withIndex("by_active", (q) => q.eq("active", true))
    .paginate({ cursor: input.cursor, numItems });
  return {
    isDone: page.isDone,
    continueCursor: page.continueCursor,
    page: page.page
      .filter((material) => material.status !== "archived")
      .map((material) => ({
        _id: material._id,
        name: material.name,
        variantLabel: material.variantLabel ?? null,
        sku: material.sku ?? null,
        barcode: material.barcode ?? null,
        unit: material.unit ?? null,
        category: material.category ?? null,
      })),
  };
}

/**
 * Revisão de rascunhos em Compras: de onde veio o material (cadastros em
 * campo, se houver) e os parecidos que ele pode duplicar (recalculados agora,
 * sem os arquivados).
 */
export async function getCaptureReview(
  ctx: QueryCtx,
  materialId: Id<"materials">
) {
  const material = await ctx.db.get("materials", materialId);
  if (!material) return null;
  const captures = await ctx.db
    .query("materialCaptures")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .order("desc")
    .take(20);
  const similar = await findSimilarMaterials(
    ctx,
    { name: material.name, variantLabel: material.variantLabel },
    { excludeMaterialId: materialId }
  );
  return {
    captures: await Promise.all(
      captures.map(async (capture) => {
        const [user, location] = await Promise.all([
          ctx.db.get("users", capture.capturedByUserId),
          ctx.db.get("inventoryLocations", capture.locationId),
        ]);
        return {
          _id: capture._id,
          outcome: capture.outcome,
          capturedAt: capture.capturedAt,
          capturedByName: user?.name ?? "Usuário",
          locationName: location?.name ?? "Estoque",
          countedQuantity: capture.countedQuantity,
          offline: capture.offline,
          photoUrl: capture.photoId ? await ctx.storage.getUrl(capture.photoId) : null,
        };
      })
    ),
    similar: similar.map((m) => ({
      materialId: m._id,
      name: m.name,
      variantLabel: m.variantLabel ?? null,
      sku: m.sku ?? null,
      unit: m.unit ?? null,
      status: m.status ?? "active",
    })),
  };
}
