#!/usr/bin/env node
// Apaga deployments de preview do Convex que não servem mais, pela Management API
// (https://docs.convex.dev/management-api). Usado por .github/workflows/convex-preview-cleanup.yml.
//
//   node convex-preview-cleanup.mjs --branch <nome>          apaga o preview desse branch
//   node convex-preview-cleanup.mjs --keep <a,b,...>         apaga todo preview cujo branch
//                                                            não está na lista (PRs abertos)
//   --dry-run                                                só lista o que seria apagado
//
// Ambiente:
//   CONVEX_MANAGEMENT_TOKEN  token de acesso do time ou do projeto no Convex (obrigatório)
//   CONVEX_PROJECT_ID        id do projeto; dispensável quando o token é de projeto
//
// O preview do Convex criado pelo build da Vercel tem como identificador o nome do branch do
// git (VERCEL_GIT_COMMIT_REF), então o branch do PR basta para achá-lo. Só deployments do tipo
// "preview" são tocados; produção e dev nunca entram na lista.

const API = "https://api.convex.dev/v1";

export function parseArgs(argv) {
  const args = { branch: null, keep: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--branch") args.branch = argv[++i] ?? "";
    else if (arg === "--keep") args.keep = argv[++i] ?? "";
    else throw new Error(`argumento desconhecido: ${arg}`);
  }
  if ((args.branch === null) === (args.keep === null)) {
    throw new Error("use --branch <nome> ou --keep <lista>, um dos dois");
  }
  if (args.branch !== null && !args.branch.trim()) throw new Error("--branch vazio");
  return args;
}

/** Os previews a apagar: só tipo "preview", com identificador, e pelo critério pedido. */
export function previewsToDelete(deployments, { branch, keep }) {
  const previews = deployments.filter(
    (d) => d.deploymentType === "preview" && typeof d.previewIdentifier === "string" && d.previewIdentifier,
  );
  if (branch !== null && branch !== undefined) {
    return previews.filter((d) => d.previewIdentifier === branch);
  }
  const kept = new Set(
    String(keep ?? "")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
  );
  return previews.filter((d) => !kept.has(d.previewIdentifier));
}

async function api(token, method, path) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.CONVEX_MANAGEMENT_TOKEN;
  if (!token) {
    console.log(
      "::warning::CONVEX_MANAGEMENT_TOKEN não configurado; nada foi apagado. Veja o README (Previews do Convex).",
    );
    return;
  }

  let projectId = process.env.CONVEX_PROJECT_ID?.trim() || null;
  if (!projectId) {
    const details = await api(token, "GET", "/token_details");
    projectId = details?.projectId ?? null;
  }
  if (!projectId) {
    throw new Error("token de time: defina a variável CONVEX_PROJECT_ID com o id do projeto");
  }

  const deployments = await api(
    token,
    "GET",
    `/projects/${encodeURIComponent(projectId)}/list_deployments?deploymentType=preview`,
  );
  const targets = previewsToDelete(deployments ?? [], args);
  const total = (deployments ?? []).filter((d) => d.deploymentType === "preview").length;
  console.log(`${total} preview(s) no projeto; ${targets.length} a apagar.`);

  let failed = 0;
  for (const d of targets) {
    const label = `${d.name} (branch ${d.previewIdentifier})`;
    if (args.dryRun) {
      console.log(`[dry-run] apagaria ${label}`);
      continue;
    }
    try {
      await api(token, "POST", `/deployments/${encodeURIComponent(d.name)}/delete`);
      console.log(`apagado ${label}`);
    } catch (error) {
      failed++;
      console.log(`::error::falha ao apagar ${label}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
