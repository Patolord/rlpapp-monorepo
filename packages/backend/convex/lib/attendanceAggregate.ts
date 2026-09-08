import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

/** Staging has its own namespace; a single day pointer publishes the same punches and counts. */
export const attendanceCounts = new TableAggregate<{
  Namespace: string; Key: string; DataModel: DataModel; TableName: "attendanceDailySummaries";
}>(components.attendanceCounts, {
  namespace: (doc) => `${doc.runId}:${doc.attempt}`,
  sortKey: (doc) => doc.employeeKey,
  sumValue: (doc) => doc.punchCount,
});
