import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { logAudit } from "./lib/audit";
import { arquivosQuery, arquivosReadAction, arquivosWriteAction, requireUser } from "./lib/rbac";
import {
  createFolder,
  listFolder,
  listFolderResultValidator,
  readFile,
  readFileResultValidator,
  sharepointItemValidator,
  writeFile,
  writeFileResultValidator,
} from "./model/sharepoint/files";
import {
  SHAREPOINT_LIBRARIES,
  libraryValidator,
  listAllowedFolders,
  type LibraryKey,
} from "./model/sharepoint/libraries";
import { getTrelloOverview, trelloOverviewValidator } from "./model/sharepoint/trello";

/**
 * Arquivos da empresa no SharePoint (sites Projetos e Publico), pelo app do
 * backend no Microsoft Graph. Leitura exige `arquivos.read`; criar pastas e
 * salvar arquivos exige `arquivos.write`, e só nas pastas liberadas para
 * escrita (model/sharepoint/libraries.ts). Não há apagar nem mover.
 */

export const listLibraries = arquivosQuery({
  args: {},
  returns: v.array(
    v.object({
      library: libraryValidator,
      label: v.string(),
      webUrl: v.string(),
      readFolders: v.array(v.string()),
      writeFolders: v.array(v.string()),
    })
  ),
  handler: async () => {
    return (Object.keys(SHAREPOINT_LIBRARIES) as LibraryKey[]).map((library) => ({
      library,
      label: SHAREPOINT_LIBRARIES[library].label,
      webUrl: SHAREPOINT_LIBRARIES[library].webUrl,
      readFolders: listAllowedFolders(library, "read"),
      writeFolders: listAllowedFolders(library, "write"),
    }));
  },
});

export const listFolderContents = arquivosReadAction({
  args: {
    library: libraryValidator,
    path: v.optional(v.string()),
    nameContains: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: listFolderResultValidator,
  handler: async (_ctx, args) => {
    return await listFolder(args);
  },
});

export const readFileContents = arquivosReadAction({
  args: { library: libraryValidator, path: v.string(), offset: v.optional(v.number()) },
  returns: readFileResultValidator,
  handler: async (_ctx, args) => {
    return await readFile(args);
  },
});

/** Contagem por etapa da pasta TRELLO de orçamentos (Projetos/z/Orçamentos/TRELLO). */
export const trelloOverview = arquivosReadAction({
  args: {},
  returns: trelloOverviewValidator,
  handler: async () => {
    return await getTrelloOverview();
  },
});

export const saveFile = arquivosWriteAction({
  args: {
    library: libraryValidator,
    path: v.string(),
    text: v.optional(v.string()),
    contentBase64: v.optional(v.string()),
    contentType: v.optional(v.string()),
    ifMatch: v.optional(v.string()),
  },
  returns: writeFileResultValidator,
  handler: async (ctx, args) => {
    const result = await writeFile(args);
    await ctx.runMutation(internal.sharepoint.recordChange, {
      action: result.replaced ? "update" : "create",
      library: args.library,
      path: result.item.path,
      kind: "file",
      size: result.item.size,
    });
    return result;
  },
});

export const createFolderAt = arquivosWriteAction({
  args: { library: libraryValidator, path: v.string() },
  returns: v.object({ library: v.string(), item: sharepointItemValidator }),
  handler: async (ctx, args) => {
    const result = await createFolder(args);
    await ctx.runMutation(internal.sharepoint.recordChange, {
      action: "create",
      library: args.library,
      path: result.item.path,
      kind: "folder",
      size: 0,
    });
    return result;
  },
});

/** Auditoria de cada gravação no SharePoint, como o usuário (ou token) que gravou. */
export const recordChange = internalMutation({
  args: {
    action: v.union(v.literal("create"), v.literal("update")),
    library: libraryValidator,
    path: v.string(),
    kind: v.union(v.literal("file"), v.literal("folder")),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const label = SHAREPOINT_LIBRARIES[args.library].label;
    await logAudit(ctx, user, {
      action: args.action,
      tableName: "sharepoint",
      recordId: `${args.library}:${args.path}`,
      entityLabel: `${label}/${args.path}`,
      details:
        args.kind === "folder"
          ? `Pasta criada no SharePoint (${label})`
          : `Arquivo ${args.action === "update" ? "substituído" : "salvo"} no SharePoint (${label}, ${args.size} bytes)`,
      source: "sharepoint",
    });
    return null;
  },
});
