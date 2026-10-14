import { createFileRoute, redirect } from "@tanstack/react-router";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { PendingRecordsPage } from "@/components/campo/pending-records";

export const Route = createFileRoute("/qr-operador_/pendentes")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: PendentesPage,
});

function PendentesPage() {
  return (
    <FieldPageShell
      title="Registros pendentes"
      subtitle="Feitos sem internet, aguardando envio"
    >
      <div className="mx-auto w-full max-w-lg py-2">
        <PendingRecordsPage />
      </div>
    </FieldPageShell>
  );
}
