import { defineSchema } from "convex/server";
import { contractsTables } from "./schema/contracts";
import { engineeringTables } from "./schema/engineering";
import { hrTables } from "./schema/hr";
import { identityTables } from "./schema/identity";
import { inventoryTables } from "./schema/inventory";
import { procurementTables } from "./schema/procurement";

// Tabelas e validadores ficam em `schema/<domínio>.ts`; aqui só se monta o schema.
export default defineSchema({
  ...identityTables,
  ...engineeringTables,
  ...contractsTables,
  ...procurementTables,
  ...inventoryTables,
  ...hrTables,
});
