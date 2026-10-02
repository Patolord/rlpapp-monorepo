import { createFileRoute, Link } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { CampoObraStockPage } from "@/components/campo/obra-stock-page";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/estoque")({
  component: CampoObraEstoquePage,
});

function CampoObraEstoquePage() {
  const { obra, obraSlug } = useFieldObra();

  return (
    <FieldPageShell
      title="Estoque"
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <CampoObraStockPage projectId={obra._id} />
    </FieldPageShell>
  );
}
