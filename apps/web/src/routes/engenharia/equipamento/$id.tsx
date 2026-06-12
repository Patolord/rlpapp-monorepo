import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2, AlertTriangle } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/engenharia/equipamento/$id")({
  component: EquipmentRedirect,
});

function EquipmentRedirect() {
  return (
    <AuthShell>
      <RedirectContent />
    </AuthShell>
  );
}

function RedirectContent() {
  const { id } = Route.useParams();
  const equipmentId = id as Id<"equipment">;
  const qrCode = useQuery(api.qrCodes.getByEquipmentId, { equipmentId });

  if (qrCode === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (qrCode) {
    return <Navigate to="/engenharia/qr/$token" params={{ token: qrCode.token }} />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <h1 className="text-2xl font-bold">Equipamento Não Encontrado</h1>
        <p className="text-muted-foreground">
          Não foi possível encontrar um código QR vinculado a este equipamento.
        </p>
      </div>
    </div>
  );
}
