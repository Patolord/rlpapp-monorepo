import { defineSchema } from "convex/server";
import { aiTables } from "./schema/ai";
import { budgetBoardTables } from "./schema/budgetBoard";
import { contractsTables } from "./schema/contracts";
import { engineeringTables } from "./schema/engineering";
import { fieldServicesTables } from "./schema/fieldServices";
import { hrTables } from "./schema/hr";
import { identityTables } from "./schema/identity";
import { inventoryTables } from "./schema/inventory";
import { notificationsTables } from "./schema/notifications";
import { procurementTables } from "./schema/procurement";

// Tabelas e validadores ficam em `schema/<domínio>.ts`; aqui só se monta o schema.
export default defineSchema({
  ...identityTables,
  ...engineeringTables,
  ...fieldServicesTables,
  ...contractsTables,
  ...budgetBoardTables,
  ...procurementTables,
  ...inventoryTables,
  ...hrTables,
  ...notificationsTables,
  ...aiTables,
});
