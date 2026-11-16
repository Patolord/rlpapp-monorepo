/**
 * Ferramentas MCP dos arquivos da empresa no SharePoint (sites Projetos e
 * Publico), pelo app do backend no Microsoft Graph. Só as pastas liberadas em
 * packages/backend/convex/model/sharepoint/libraries.ts aparecem.
 */

import type { ToolSpec } from "../manifest";

const LIBRARY_HINT =
  'SharePoint library: "projetos" (Projetos site: budgets, project drawings, catalogs; the only one with write access) or "publico" (Publico site: forms and CREA reports, read-only).';
const PATH_HINT =
  'Path relative to the library root, folders separated by "/", e.g. "Projetos Orçamento/Bios/ARQ-101.pdf". Must start with an allowed top-level folder (see list_sharepoint_libraries).';

export const ARQUIVOS_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Company files on SharePoint
  // --------------------------------------------------------------------------
  {
    name: "list_sharepoint_libraries",
    function: "sharepoint:listLibraries",
    title: "List SharePoint libraries",
    description:
      "The company SharePoint libraries this workspace can reach and, for each, the top-level folders allowed for reading and for writing. Start here before browsing files; budgets (orçamentos) and takeoff files live in Projetos → \"Projetos Orçamento\", one folder per budget.",
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
      "One SharePoint file. Text files up to 1 MB (.json including .takeoff.json, .txt, .csv, .md, .xml) come back as `text`; other files (PDF drawings, spreadsheets, images) come back as `downloadUrl`, a pre-authenticated link that expires in about an hour; never show or share that link. The returned `eTag` is what save_sharepoint_file needs to replace the file.",
    readOnly: true,
    fieldDescriptions: { library: LIBRARY_HINT, path: PATH_HINT },
  },
  {
    name: "save_sharepoint_file",
    function: "sharepoint:saveFile",
    title: "Save SharePoint file",
    description:
      "Save a file in a SharePoint folder allowed for writing (today only Projetos → \"Projetos Orçamento\"). Pass the content in `text` (UTF-8) or `contentBase64` (binary), up to 3.5 MB. Without `ifMatch` it only creates: it fails if the name already exists. To replace a file, read it first and pass its `eTag` in `ifMatch`; it fails if someone changed it meanwhile. Missing folders in the path are created. Every save is recorded in the app's audit log. Confirm with the user before replacing a file.",
    fieldDescriptions: {
      library: LIBRARY_HINT,
      path: `${PATH_HINT} Includes the file name, e.g. "Projetos Orçamento/Bios/Bios.takeoff.json".`,
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
      "Create a folder inside a SharePoint folder allowed for writing, e.g. a new budget folder \"Projetos Orçamento/<Cliente - Obra>\". Fails if it already exists. Recorded in the audit log.",
    fieldDescriptions: { library: LIBRARY_HINT, path: `${PATH_HINT} The last segment is the new folder's name.` },
  },
];
