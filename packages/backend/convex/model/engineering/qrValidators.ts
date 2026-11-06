import { v } from "convex/values";
import { equipKindValidator, equipmentStatusValidator } from "../../schema/engineering";

// Validadores de retorno das funções públicas de QR codes (qrCodes.ts).

export const qrCodeStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive")
);

const qrCodeFields = {
  _id: v.id("qrCodes"),
  _creationTime: v.number(),
  token: v.string(),
  equipmentId: v.optional(v.id("equipment")),
  status: qrCodeStatusValidator,
  batchId: v.optional(v.string()),
  batchName: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  createdAt: v.number(),
};

const equipmentFields = {
  _id: v.id("equipment"),
  _creationTime: v.number(),
  description: v.optional(v.string()),
  labelPhotoIds: v.optional(v.array(v.id("_storage"))),
  status: equipmentStatusValidator,
  createdAt: v.number(),
  // Vínculo reverso com o item planejado da obra (relatórios).
  projectEquipmentId: v.optional(v.id("projectEquipment")),
  // Campos legados (dados antigos em produção antes da simplificação do schema).
  projectId: v.optional(v.id("projects")),
  floor: v.optional(v.number()),
  position: v.optional(v.number()),
  location: v.optional(v.string()),
  tag: v.optional(v.string()),
  type: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const qrCodeValidator = v.object(qrCodeFields);
export const qrEquipmentValidator = v.object(equipmentFields);
export const qrCodeWithEquipmentValidator = v.object({
  ...qrCodeFields,
  equipment: v.union(qrEquipmentValidator, v.null()),
});

export const qrBatchSummaryValidator = v.object({
  batchId: v.string(),
  batchName: v.optional(v.string()),
  createdAt: v.number(),
  count: v.number(),
  // Obra de destino do lote (qrBatches), quando definida na criação.
  projectId: v.optional(v.id("projects")),
  projectName: v.optional(v.string()),
});

const qrProjectRefFields = {
  projectId: v.id("projects"),
  projectName: v.string(),
  projectSlug: v.union(v.string(), v.null()),
  archived: v.boolean(),
};

export const qrBatchProjectValidator = v.union(
  v.object(qrProjectRefFields),
  v.null()
);

export const qrCodeLookupValidator = v.object({
  qrCode: qrCodeValidator,
  equipment: v.union(qrEquipmentValidator, v.null()),
  // Obra de destino herdada do lote (qrBatches), se definida.
  batchProject: qrBatchProjectValidator,
  // Obra à qual a etiqueta já pertence (qrCodes.projectId), se houver.
  project: v.union(v.object(qrProjectRefFields), v.null()),
});

export const qrSearchResultValidator = v.object({
  batches: v.array(qrBatchSummaryValidator),
  qrCodes: v.array(qrCodeWithEquipmentValidator),
});

export const qrBatchCreateResultValidator = v.object({
  ids: v.array(v.id("qrCodes")),
  batchId: v.string(),
  batchName: v.optional(v.string()),
  created: v.array(
    v.object({
      id: v.id("qrCodes"),
      token: v.string(),
    })
  ),
});

export const availableQrBatchValidator = v.object({
  batchId: v.string(),
  batchName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  total: v.number(),
  availableTokens: v.array(v.string()),
  // Obra de destino do lote, quando definida na criação.
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
});

export const qrBatchWithoutProjectValidator = v.object({
  batchId: v.string(),
  batchName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  total: v.number(),
  registered: v.number(),
  sampleTokens: v.array(v.string()),
});

export const qrFullContextValidator = v.object({
  token: v.string(),
  qrStatus: qrCodeStatusValidator,
  equipment: v.union(qrEquipmentValidator, v.null()),
  plannedEquipment: v.union(
    v.object({
      _id: v.id("projectEquipment"),
      system: v.string(),
      ambiente: v.string(),
      kind: equipKindValidator,
      modelo: v.string(),
      capacidade: v.string(),
      status: equipmentStatusValidator,
      serialNumber: v.union(v.string(), v.null()),
      scheduledDate: v.union(v.number(), v.null()),
      installationDate: v.union(v.number(), v.null()),
      testDate: v.union(v.number(), v.null()),
    }),
    v.null()
  ),
  location: v.union(
    v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      towerName: v.union(v.string(), v.null()),
      floorLabel: v.union(v.string(), v.null()),
      environmentName: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  checklist: v.array(
    v.object({
      _id: v.id("checklistItems"),
      label: v.string(),
      required: v.boolean(),
      completed: v.boolean(),
    })
  ),
  // Obra de destino herdada do lote (qrBatches), se definida.
  batchProject: qrBatchProjectValidator,
});

export const registeredQrEquipmentValidator = v.object({
  qrId: v.id("qrCodes"),
  token: v.string(),
  equipmentId: v.id("equipment"),
  description: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  batchName: v.union(v.string(), v.null()),
  registeredAt: v.number(),
});

export const projectQrRowValidator = v.object({
  _id: v.id("qrCodes"),
  token: v.string(),
  qrStatus: qrCodeStatusValidator,
  batchId: v.union(v.string(), v.null()),
  batchName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  equipmentId: v.union(v.id("equipment"), v.null()),
  plannedItemId: v.union(v.id("projectEquipment"), v.null()),
  // Texto livre informado pelo técnico no cadastro em campo; é o único nome
  // de muitas etiquetas sem item planejado.
  description: v.union(v.string(), v.null()),
  system: v.union(v.string(), v.null()),
  ambiente: v.union(v.string(), v.null()),
  kind: v.union(
    v.literal("condensadora"),
    v.literal("evaporadora"),
    v.null()
  ),
  modelo: v.union(v.string(), v.null()),
  capacidade: v.union(v.string(), v.null()),
  status: v.union(equipmentStatusValidator, v.null()),
  towerName: v.union(v.string(), v.null()),
  floorLabel: v.union(v.string(), v.null()),
  environmentName: v.union(v.string(), v.null()),
  installedAt: v.union(v.number(), v.null()),
});
