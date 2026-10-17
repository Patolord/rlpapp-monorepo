import { createFileRoute, Link } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { ObraActivityList } from "@/components/campo/obra-activity-list";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { PendingBanner } from "@/components/campo/pending-records";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/registros")({
  component: CampoObraRegistrosPage,
});

function CampoObraRegistrosPage() {
  const { obra, obraSlug } = useFieldObra();

  return (
    <FieldPageShell
      title="Meus registros"
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 py-2">
        <PendingBanner />
        <ObraActivityList projectId={obra._id} obraSlug={obraSlug} />
      </div>
    </FieldPageShell>
  );
}
