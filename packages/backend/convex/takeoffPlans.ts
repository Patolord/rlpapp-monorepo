import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { json, takeoffTokenError } from "./lib/takeoffHttp";
import {
  PLAN_CONTENT_TYPE,
  PLAN_UPLOAD_HEADERS,
  PLAN_UPLOAD_URL_TTL_SECONDS,
  PLAN_URL_TTL_SECONDS,
  parsePlanUploadRequest,
  parsePlanUploadedRequest,
  planHashFromPath,
  planKey,
} from "./model/procurement/takeoffPlans";

// ---------------------------------------------------------------------------
// Plantas (PDF) do RLP Takeoff: rotas HTTP sobre o bucket R2
// ---------------------------------------------------------------------------
//
// Fluxo do app desktop ao salvar um takeoff, para cada planta ainda não enviada:
//   1. POST /takeoff/plans/upload-url {hash, size, name}
//        → {exists: true}                   a planta já está no bucket, nada a fazer
//        → {exists: false, url, headers}    PUT dos bytes direto nessa URL assinada,
//                                           com exatamente esses cabeçalhos (412 =
//                                           outra máquina chegou antes; tudo bem)
//   2. POST /takeoff/plans/uploaded {hash, size}
//        → confere o objeto no bucket e registra os metadados
//
// A chave é o SHA-256 do conteúdo e o PUT é "só cria" (ver PLAN_UPLOAD_HEADERS),
// então uma planta no bucket nunca é substituída, e nenhuma rota apaga objetos:
// quem tem o token compartilhado pode acrescentar plantas, não trocar nem
// remover as dos outros. O servidor não lê os bytes (seria pagar o tráfego duas vezes);
// quem confere o conteúdo é o app ao baixar, comparando o SHA-256 do arquivo
// com a chave antes de abrir a planta.
// E ao abrir um takeoff cuja planta não está na máquina:
//   3. GET /takeoff/plans/<hash>/url → {url, expiresAt, size}
//
// Veja `model/procurement/takeoffPlans.ts` para a chave e as validações.

/** Cliente do bucket, ou null enquanto as variáveis R2_* não estão no deployment. */
function planStorage(): R2 | null {
  const bucket = env.R2_BUCKET;
  const endpoint = env.R2_ENDPOINT;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return new R2(components.r2, { bucket, endpoint, accessKeyId, secretAccessKey });
}

const storageNotConfigured = () =>
  json({ error: "Plan storage is not configured" }, 503);

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /NotFound|NoSuchKey|404/.test(message);
}

export const handleUploadUrl = httpAction(async (ctx, request) => {
  const denied = takeoffTokenError(request);
  if (denied) return denied;
  const r2 = planStorage();
  if (!r2) return storageNotConfigured();

  const body = await readJson(request);
  if (body === undefined) return json({ error: "Body must be JSON" }, 400);
  const parsed = parsePlanUploadRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { hash, size, name } = parsed.value;
  const key = planKey(hash);

  const existing = await r2.getMetadata(ctx, key);
  if (existing) {
    console.log(
      JSON.stringify({ event: "takeoff_plan_upload", outcome: "exists", hash, name })
    );
    return json({ exists: true, size: existing.size ?? null });
  }
  // Signed here rather than by the component so the signature covers
  // `If-None-Match: *` (create-only) — see PLAN_UPLOAD_HEADERS.
  const url = await getSignedUrl(
    r2.client,
    new PutObjectCommand({
      Bucket: r2.config.bucket,
      Key: key,
      ContentType: PLAN_CONTENT_TYPE,
      IfNoneMatch: "*",
    }),
    { expiresIn: PLAN_UPLOAD_URL_TTL_SECONDS }
  );
  console.log(
    JSON.stringify({ event: "takeoff_plan_upload", outcome: "url", hash, size, name })
  );
  return json({ exists: false, url, headers: PLAN_UPLOAD_HEADERS });
});

export const handleUploaded = httpAction(async (ctx, request) => {
  const denied = takeoffTokenError(request);
  if (denied) return denied;
  const r2 = planStorage();
  if (!r2) return storageNotConfigured();

  const body = await readJson(request);
  if (body === undefined) return json({ error: "Body must be JSON" }, 400);
  const parsed = parsePlanUploadedRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { hash, size } = parsed.value;
  const key = planKey(hash);

  // A plan already on record is established: this request may confirm it, never
  // change or remove it, whatever size the caller claims.
  const established = await r2.getMetadata(ctx, key);
  if (established) {
    if (size !== undefined && established.size !== undefined && established.size !== size) {
      return json(
        { error: `Size mismatch: expected ${size} bytes, bucket has ${established.size}` },
        409
      );
    }
    return json({ ok: true, size: established.size ?? null });
  }

  try {
    await r2.syncMetadata(ctx, key);
  } catch (error) {
    if (isNotFound(error)) {
      return json({ error: "Object not found in the bucket" }, 404);
    }
    throw error;
  }
  const metadata = await r2.getMetadata(ctx, key);
  if (!metadata) return json({ error: "Object not found in the bucket" }, 404);
  if (size !== undefined && metadata.size !== undefined && metadata.size !== size) {
    // The PUT is create-only and sent with its length, so the bucket cannot
    // hold a short upload: a mismatch means the claim is wrong, not the object.
    // Nothing is ever deleted through this route.
    console.log(
      JSON.stringify({
        event: "takeoff_plan_uploaded",
        outcome: "size_mismatch",
        hash,
        expected: size,
        actual: metadata.size,
      })
    );
    return json(
      { error: `Size mismatch: expected ${size} bytes, bucket has ${metadata.size}` },
      409
    );
  }
  console.log(
    JSON.stringify({
      event: "takeoff_plan_uploaded",
      outcome: "ok",
      hash,
      size: metadata.size ?? null,
    })
  );
  return json({ ok: true, size: metadata.size ?? null });
});

export const handleDownloadUrl = httpAction(async (ctx, request) => {
  const denied = takeoffTokenError(request);
  if (denied) return denied;
  const r2 = planStorage();
  if (!r2) return storageNotConfigured();

  const hash = planHashFromPath(new URL(request.url).pathname);
  if (!hash) return json({ error: "Not found" }, 404);
  const key = planKey(hash);

  const metadata = await r2.getMetadata(ctx, key);
  if (!metadata) return json({ error: "Plan not found" }, 404);
  const url = await r2.getUrl(key, { expiresIn: PLAN_URL_TTL_SECONDS });
  console.log(JSON.stringify({ event: "takeoff_plan_download", hash }));
  return json({
    url,
    expiresAt: Date.now() + PLAN_URL_TTL_SECONDS * 1000,
    size: metadata.size ?? null,
  });
});
