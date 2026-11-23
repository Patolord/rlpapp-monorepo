/**
 * Ferramentas MCP dos arquivos da empresa no SharePoint (sites Projetos e
 * Publico), pelo app do backend no Microsoft Graph. Só as pastas liberadas em
 * packages/backend/convex/model/sharepoint/libraries.ts aparecem.
 */

import type { ToolSpec } from "../manifest";

const LIBRARY_HINT =
  'SharePoint library: "projetos" (Projetos site: budgets in progress, project drawings, catalogs; the only one with write access) or "publico" (Publico site: finished proposals, forms and CREA reports; read-only).';
const PATH_HINT =
  'Path relative to the library root, folders separated by "/", e.g. "z/Orçamentos/TRELLO/Em Andamento/26.37033PRC - TECNUM - Empreendimento Faria Lima/Projetos". Must start with an allowed folder (see list_sharepoint_libraries); in an allowed folder written with "*", put the real name there, e.g. "2026/Propostas/PRC".';

export const ARQUIVOS_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Company files on SharePoint
  // --------------------------------------------------------------------------
  {
    name: "list_sharepoint_libraries",
    function: "sharepoint:listLibraries",
    title: "List SharePoint libraries",
    description:
      "The company SharePoint libraries this workspace can reach and, for each, the folders allowed for reading and for writing (\"*\" stands for any name at that level, such as the year). Start here before browsing files. How budgets (orçamentos) flow: in Projetos, \"z/Orçamentos/TRELLO\" works like a board, with \"Para Fazer/<ano>/<Cliente - Obra>\", \"Em Andamento/<nº PRC - Cliente - Obra>\", \"Concluído\" and \"Obsoletos ...\", plus \"Pasta Padrão\" (the template: Levantamentos, spreadsheet templates and the proposal template \"PRC - XXXXX - YYYYY.docx\"). Each budget folder holds Levantamentos, Orçamentos and Projetos (drawings), and its .takeoff.json sits in the budget folder itself. Finished proposals (PRC) are filed in Publico under \"<ano>/Propostas/PRC/<mês>/<nº PRC - Cliente - Obra>\".",
  },
  {
    name: "list_sharepoint_folder",
    function: "sharepoint:listFolderContents",
    title: "List SharePoint folder",
    description:
      "Files and subfolders of a SharePoint folder (up to 200 per page, with size, last change, eTag and web link). Without `path`, lists the allowed top-level folders of the library. There is no full-text search: browse folders and use `nameContains` to filter by name.",
    readOnly: true,
    fieldDescriptions: {
      library: LIBRARY_HINT,
      path: `${PATH_HINT} Omit for the library root.`,
      nameContains: "Only items whose name contains this text (accents and case ignored), within the page.",
      cursor: "nextCursor from the previous page.",
    },
  },
  {
    name: "read_sharepoint_file",
    function: "sharepoint:readFileContents",
    title: "Read SharePoint file",
    description:
      "One SharePoint file. Text files up to 5 MB (.json including .takeoff.json, .txt, .csv, .md, .xml) come back as `text`, at most 50,000 characters per call: when `nextOffset` is not null, call again with `offset: nextOffset` and concatenate until it is null (`totalChars` is the full length). Other files (PDF drawings, spreadsheets, images) come back as `downloadUrl`, a pre-authenticated link that expires in about an hour; never show or share that link. The returned `eTag` is what save_sharepoint_file needs to replace the file.",
    readOnly: true,
    fieldDescriptions: {
      library: LIBRARY_HINT,
      path: PATH_HINT,
      offset: "Character offset to continue a text file (nextOffset from the previous call). Default 0.",
    },
  },
  {
    name: "save_sharepoint_file",
    function: "sharepoint:saveFile",
    title: "Save SharePoint file",
    description:
      "Save a file in a SharePoint folder allowed for writing (today in Projetos: \"z/Orçamentos/TRELLO\" and \"Projetos Orçamento\"). Pass the content in `text` (UTF-8) or `contentBase64` (binary), up to 3.5 MB. Without `ifMatch` it only creates: it fails if the name already exists. To replace a file, read it first and pass its `eTag` in `ifMatch`; it fails if someone changed it meanwhile. Missing folders in the path are created. Every save is recorded in the app's audit log. Confirm with the user before replacing a file.",
    fieldDescriptions: {
      library: LIBRARY_HINT,
      path: `${PATH_HINT} Includes the file name, e.g. "z/Orçamentos/TRELLO/Para Fazer/2026/Tegra - Obra NOVA VIVERE/NOVA VIVERE.takeoff.json".`,
      text: "File content as text. Use this or contentBase64.",
      contentBase64: "File content as base64. Use this or text.",
      contentType: 'MIME type, e.g. "application/json" or "application/pdf". Defaults to text/plain or application/octet-stream.',
      ifMatch: "eTag from read_sharepoint_file or list_sharepoint_folder. Only to replace an existing file.",
    },
  },
  {
    name: "create_sharepoint_folder",
    function: "sharepoint:createFolderAt",
    title: "Create SharePoint folder",
    description:
      "Create a folder inside a SharePoint folder allowed for writing, e.g. a new budget folder \"z/Orçamentos/TRELLO/Para Fazer/2026/<Cliente - Obra>\". Fails if it already exists. Recorded in the audit log.",
    fieldDescriptions: { library: LIBRARY_HINT, path: `${PATH_HINT} The last segment is the new folder's name.` },
  },
];
