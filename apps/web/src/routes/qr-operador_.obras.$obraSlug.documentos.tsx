import { createFileRoute, Link } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { ObraDocumentsList } from "@/components/campo/obra-documents-list";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/documentos")({
  component: CampoObraDocumentosPage,
});

function CampoObraDocumentosPage() {
  const { obra, obraSlug } = useFieldObra();

  return (
    <FieldPageShell
      title="Documentos"
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <div className="mx-auto w-full max-w-lg py-2">
        <ObraDocumentsList projectId={obra._id} obraSlug={obraSlug} />
      </div>
    </FieldPageShell>
  );
}
