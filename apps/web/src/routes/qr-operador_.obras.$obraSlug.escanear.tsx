import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { FieldQrScanner } from "@/components/engenharia/field-qr-scanner";

// Leitor de QR dentro da obra: a etiqueta lida abre no contexto dela.
export const Route = createFileRoute("/qr-operador_/obras/$obraSlug/escanear")({
  component: CampoObraEscanearPage,
});

function CampoObraEscanearPage() {
  const { obra, obraSlug } = useFieldObra();
  const navigate = useNavigate();

  return (
    <FieldPageShell
      title="Escanear etiqueta"
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <div className="mx-auto w-full max-w-lg py-2">
        <FieldQrScanner
          autoStart
          onToken={(token) =>
            void navigate({
              to: "/qr-operador/obras/$obraSlug/etiqueta/$token",
              params: { obraSlug, token },
              replace: true,
            })
          }
        />
      </div>
    </FieldPageShell>
  );
}
