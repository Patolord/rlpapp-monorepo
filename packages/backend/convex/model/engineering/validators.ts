import { v } from "convex/values";

export const equipmentStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

export const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);
