import { z } from "zod";

export const listProjectsInputSchema = z.object({
  includeArchived: z.boolean().optional(),
});

export const projectSummarySchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  client: z.string().nullable(),
  customerName: z.string().nullable(),
  address: z.string().nullable(),
  status: z.string().nullable(),
  responsibleName: z.string().nullable(),
  startDate: z.number().nullable(),
  endDate: z.number().nullable(),
  createdAt: z.number(),
  archivedAt: z.number().nullable(),
  totalItems: z.number(),
  installedItems: z.number(),
  unitCount: z.number(),
  towerCount: z.number(),
});

export const listProjectsOutputSchema = z.object({
  projects: z.array(projectSummarySchema),
});

export const resolveProjectInputSchema = z.object({
  identifier: z.string().min(1),
});

export const resolveProjectOutputSchema = z.object({
  project: z
    .object({
      _id: z.string(),
      slug: z.string(),
    })
    .nullable(),
});

export const projectIdInputSchema = z.object({
  projectId: z.string().min(1),
});

export const getProjectOverviewOutputSchema = z.object({
  overview: z.json(),
});

export const getProjectHierarchyOutputSchema = z.object({
  hierarchy: z.json(),
});

export const getEquipmentInputSchema = z.object({
  id: z.string().min(1),
});

export const equipmentStatusSchema = z.enum([
  "installing",
  "operational",
  "warning",
  "error",
]);

export const equipmentSchema = z.object({
  _id: z.string(),
  description: z.string().nullable(),
  status: equipmentStatusSchema,
  createdAt: z.number(),
  projectEquipmentId: z.string().nullable(),
  createdByUserId: z.string().nullable(),
  tag: z.string().nullable(),
  type: z.string().nullable(),
  notes: z.string().nullable(),
});

export const getEquipmentOutputSchema = z.object({
  equipment: equipmentSchema.nullable(),
});

export const getProjectReportOutputSchema = z.object({
  report: z.json(),
});

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
