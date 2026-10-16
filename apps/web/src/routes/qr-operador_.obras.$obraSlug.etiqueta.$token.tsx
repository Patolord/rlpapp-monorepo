import { createFileRoute, Link } from "@tanstack/react-router";

import { EquipmentTokenPage } from "@/components/campo/equipment-token-page";
import { FieldPageShell } from "@/components/campo/field-page-shell";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { Button } from "@/components/ui/button";

// Etiqueta aberta dentro de uma obra: cadastros novos ficam vinculados a ela.
export const Route = createFileRoute(
  "/qr-operador_/obras/$obraSlug/etiqueta/$token"
)({
  component: CampoObraEtiquetaPage,
});

function CampoObraEtiquetaPage() {
  const { token } = Route.useParams();
  const { obra, obraSlug } = useFieldObra();

  return (
    <FieldPageShell
      title={token}
      subtitle={obraTitle(obra)}
      back={<Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />}
    >
      <EquipmentTokenPage
        token={token}
        project={{ _id: obra._id, name: obra.name }}
        notFoundAction={
          <Button
            variant="outline"
            render={
              <Link to="/qr-operador/obras/$obraSlug" params={{ obraSlug }} />
            }
          >
            Voltar para a obra
          </Button>
        }
      />
    </FieldPageShell>
  );
}
