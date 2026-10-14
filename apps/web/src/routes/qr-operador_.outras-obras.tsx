import { createFileRoute, redirect } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { OtherObrasList } from "@/components/campo/other-obras-list";

export const Route = createFileRoute("/qr-operador_/outras-obras")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: OutrasObrasPage,
});

function OutrasObrasPage() {
  return (
    <FieldPageShell
      title="Outras obras"
      subtitle="Obras ativas com etiquetas QR, mesmo sem atribuição"
    >
      <div className="mx-auto w-full max-w-lg py-2">
        <OtherObrasList />
      </div>
    </FieldPageShell>
  );
}
