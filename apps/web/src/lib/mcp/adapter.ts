import type { FunctionReturnType } from "convex/server";

import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export type ListProjectsResult = FunctionReturnType<typeof api.projects.list>;
export type ResolveProjectResult = FunctionReturnType<
  typeof api.projects.resolve
>;
export type ProjectOverviewResult = FunctionReturnType<
  typeof api.projects.getOverview
>;
export type ProjectHierarchyResult = FunctionReturnType<
  typeof api.projects.getHierarchy
>;
export type EquipmentResult = FunctionReturnType<
  typeof api.equipment.getForEngineering
>;
export type ProjectReportResult = FunctionReturnType<
  typeof api.reports.getProjectReport
>;

export type EngineeringAdapter = {
  listProjects: (args: {
    includeArchived?: boolean;
  }) => Promise<ListProjectsResult>;
  resolveProject: (args: { identifier: string }) => Promise<ResolveProjectResult>;
  getProjectOverview: (args: {
    projectId: Id<"projects">;
  }) => Promise<ProjectOverviewResult>;
  getProjectHierarchy: (args: {
    projectId: Id<"projects">;
  }) => Promise<ProjectHierarchyResult>;
  getEquipment: (args: { id: Id<"equipment"> }) => Promise<EquipmentResult>;
  getProjectReport: (args: {
    projectId: Id<"projects">;
    now: number;
  }) => Promise<ProjectReportResult>;
};

export type EngineeringAdapterFactory = (
  userId: string
) => EngineeringAdapter | Promise<EngineeringAdapter>;
