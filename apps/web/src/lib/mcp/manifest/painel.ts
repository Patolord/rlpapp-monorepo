/**
 * Ferramentas MCP de painéis, documentos, atividade e estimativas.
 */

import { PAGINATION_HINT, nowArg } from "./shared-args";
import type { ToolSpec } from "../manifest";

export const PAINEL_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // Dashboards, documents, activity, estimates
  // --------------------------------------------------------------------------
  {
    name: "get_director_overview",
    function: "dashboard:getDirectorOverview",
    title: "Director dashboard",
    description: "KPIs, per-project progress, critical pending items, recent activity and weekly summary for the whole operation.",
    serverArgs: nowArg,
  },
  {
    name: "list_project_documents",
    function: "projectDocuments:listByProject",
    title: "List project documents",
    description: "Documents (PDFs) attached to a project with their field-access settings. Download is only available in the app.",
  },
  {
    name: "list_project_activity",
    function: "technicianActivity:listProjectActivity",
    title: "List field activity",
    description: "Paginated feed of field activity (registrations, maintenances, status changes) in a project, optionally for one technician.",
    fieldDescriptions: { paginationOpts: PAGINATION_HINT },
  },
];
