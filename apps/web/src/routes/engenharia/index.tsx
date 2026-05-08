import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardHat, QrCode, Wrench, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/engenharia/")({
  component: EngenhariaDashboard,
});

function EngenhariaDashboard() {
  return (
    <>
      <Authenticated>
        <DashboardContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Faça login para acessar</p>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function DashboardContent() {
  const qrCodes = useQuery(api.qrCodes.list);
  const equipmentList = useQuery(api.equipment.list);

  const totalQr = qrCodes?.length ?? 0;
  const linkedQr = qrCodes?.filter((q) => q.equipmentId).length ?? 0;
  const freeQr = totalQr - linkedQr;

  const totalEquipment = equipmentList?.length ?? 0;
  const operational = equipmentList?.filter((e) => e.status === "operational").length ?? 0;
  const warnings = equipmentList?.filter((e) => e.status === "warning").length ?? 0;
  const errors = equipmentList?.filter((e) => e.status === "error").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Engenharia</h1>
        <p className="text-sm text-muted-foreground">
          Rastreamento de equipamentos HVAC por QR Code
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Equipamentos</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEquipment}</div>
            <p className="text-xs text-muted-foreground">
              {operational} operacionais
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">QR Codes</CardTitle>
            <QrCode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQr}</div>
            <p className="text-xs text-muted-foreground">
              {linkedQr} vinculados, {freeQr} livres
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Alertas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{warnings}</div>
            <p className="text-xs text-muted-foreground">
              equipamentos em alerta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Erros</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errors}</div>
            <p className="text-xs text-muted-foreground">
              equipamentos com erro
            </p>
          </CardContent>
        </Card>
      </div>

      {equipmentList && equipmentList.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Equipamentos Recentes</h2>
          <div className="space-y-2">
            {equipmentList.slice(0, 10).map((eq) => (
              <Link
                key={eq._id}
                to="/engenharia/equipamento/$id"
                params={{ id: eq._id }}
              >
                <Card className="cursor-pointer transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{eq.tag}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {eq.type} — {eq.location}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        eq.status === "operational"
                          ? "bg-green-100 text-green-800 border-green-300"
                          : eq.status === "warning"
                            ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                            : "bg-red-100 text-red-800 border-red-300"
                      }
                    >
                      {eq.status === "operational"
                        ? "Operacional"
                        : eq.status === "warning"
                          ? "Alerta"
                          : "Erro"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
