import { createFileRoute, Link } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { ProjectQrList } from "@/components/engenharia/field-project-qr-browser";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/etiquetas")({
  component: CampoObraEtiquetasPage,
});

function CampoObraEtiquetasPage() {
  const { obra, obraSlug } = useFieldObra();

  return (
    <FieldPageShell
      title="Etiquetas QR"
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <div className="mx-auto w-full max-w-lg py-2">
        <ProjectQrList
          projectId={obra._id}
          qrCount={obra.qrCount}
          registeredCount={obra.registeredCount}
        />
      </div>
    </FieldPageShell>
  );
}
