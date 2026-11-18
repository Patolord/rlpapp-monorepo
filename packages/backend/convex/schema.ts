import { defineSchema } from "convex/server";
import { budgetBoardTables } from "./schema/budgetBoard";
import { contractsTables } from "./schema/contracts";
import { engineeringTables } from "./schema/engineering";
import { hrTables } from "./schema/hr";
import { identityTables } from "./schema/identity";
import { inventoryTables } from "./schema/inventory";
import { notificationsTables } from "./schema/notifications";
import { procurementTables } from "./schema/procurement";

// Tabelas e validadores ficam em `schema/<domínio>.ts`; aqui só se monta o schema.
export default defineSchema({
  ...identityTables,
  ...engineeringTables,
  ...contractsTables,
  ...budgetBoardTables,
  ...procurementTables,
  ...inventoryTables,
  ...hrTables,
  ...notificationsTables,
});
