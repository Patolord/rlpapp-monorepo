import { createFileRoute } from "@tanstack/react-router";

import { CampoObraStockList } from "@/components/campo/obra-stock-list";
import { FieldPageShell } from "@/components/campo/field-page-shell";

export const Route = createFileRoute("/qr-operador_/estoque/")({
  component: CampoEstoqueListPage,
});

function CampoEstoqueListPage() {
  return (
    <FieldPageShell title="Estoque da obra">
      <CampoObraStockList />
    </FieldPageShell>
  );
}
