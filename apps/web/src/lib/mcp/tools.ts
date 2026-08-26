import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

import type {
  EngineeringAdapterFactory,
  ProjectHierarchyResult,
  ProjectOverviewResult,
} from "./adapter";
import { getAuthUserId } from "./auth";
import { sanitizeErrorMessage } from "./errors";
import {
  getEquipmentInputSchema,
  getEquipmentOutputSchema,
  getProjectHierarchyOutputSchema,
  getProjectOverviewOutputSchema,
  getProjectReportOutputSchema,
  listProjectsInputSchema,
  listProjectsOutputSchema,
  projectIdInputSchema,
  projectSummarySchema,
  readOnlyAnnotations,
  resolveProjectInputSchema,
  resolveProjectOutputSchema,
} from "./schemas";

function jsonResult<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorResult(error: unknown) {
  const message = sanitizeErrorMessage(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function resolveAdapter(
  ctx: ServerContext,
  factory: EngineeringAdapterFactory
) {
  const userId = getAuthUserId(ctx.http?.authInfo);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return await factory(userId);
}

function omitQrToken<T extends { token?: unknown }>(item: T): Omit<T, "token"> {
  const { token: _token, ...rest } = item;
  return rest;
}

function withoutQrTokensFromOverview(
  overview: ProjectOverviewResult
): unknown {
  if (!overview) return overview;
  return {
    ...overview,
    units: overview.units.map((unit) => ({
      ...unit,
      equipment: unit.equipment.map(omitQrToken),
    })),
  };
}

function withoutQrTokensFromHierarchy(
  hierarchy: ProjectHierarchyResult
): unknown {
  if (!hierarchy) return hierarchy;
  return {
    ...hierarchy,
    towers: hierarchy.towers.map((tower) => ({
      ...tower,
      floors: tower.floors.map((floor) => ({
        ...floor,
        environments: floor.environments.map((environment) => ({
          ...environment,
          equipment: environment.equipment.map(omitQrToken),
        })),
      })),
    })),
  };
}

export function registerEngineeringTools(
  server: McpServer,
  factory: EngineeringAdapterFactory
): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List engineering projects (obras) with progress counts. Optionally include archived projects.",
      inputSchema: listProjectsInputSchema,
      outputSchema: listProjectsOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const projects = await adapter.listProjects({
          includeArchived: args.includeArchived,
        });
        return jsonResult({
          projects: projects.map((project) =>
            projectSummarySchema.parse({
              _id: project._id,
              name: project.name,
              slug: project.slug,
              client: project.client,
              customerName: project.customerName,
              address: project.address,
              status: project.status,
              responsibleName: project.responsibleName,
              startDate: project.startDate,
              endDate: project.endDate,
              createdAt: project.createdAt,
              archivedAt: project.archivedAt,
              totalItems: project.totalItems,
              installedItems: project.installedItems,
              unitCount: project.unitCount,
              towerCount: project.towerCount,
            })
          ),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "resolve_project",
    {
      title: "Resolve project",
      description:
        "Resolve an engineering project by slug, Convex ID, or other identifier.",
      inputSchema: resolveProjectInputSchema,
      outputSchema: resolveProjectOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const project = await adapter.resolveProject({
          identifier: args.identifier,
        });
        return jsonResult({ project });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "get_project_overview",
    {
      title: "Get project overview",
      description:
        "Get a project overview including units, planned equipment, and installation progress.",
      inputSchema: projectIdInputSchema,
      outputSchema: getProjectOverviewOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const overview = await adapter.getProjectOverview({
          projectId: args.projectId as Id<"projects">,
        });
        return jsonResult({
          overview: withoutQrTokensFromOverview(overview),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "get_project_hierarchy",
    {
      title: "Get project hierarchy",
      description:
        "Get the tower → floor → environment → equipment hierarchy for a project.",
      inputSchema: projectIdInputSchema,
      outputSchema: getProjectHierarchyOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const hierarchy = await adapter.getProjectHierarchy({
          projectId: args.projectId as Id<"projects">,
        });
        return jsonResult({
          hierarchy: withoutQrTokensFromHierarchy(hierarchy),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "get_equipment",
    {
      title: "Get equipment",
      description:
        "Get a registered physical equipment record by ID. Does not return storage file IDs.",
      inputSchema: getEquipmentInputSchema,
      outputSchema: getEquipmentOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const equipment = await adapter.getEquipment({
          id: args.id as Id<"equipment">,
        });
        return jsonResult({ equipment });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "get_project_report",
    {
      title: "Get project report",
      description:
        "Get a consolidated engineering report for a project (progress, towers, productivity, recent activity).",
      inputSchema: projectIdInputSchema,
      outputSchema: getProjectReportOutputSchema,
      annotations: readOnlyAnnotations,
    },
    async (args, ctx) => {
      try {
        const adapter = await resolveAdapter(ctx, factory);
        const report = await adapter.getProjectReport({
          projectId: args.projectId as Id<"projects">,
          now: Date.now(),
        });
        return jsonResult({ report });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
