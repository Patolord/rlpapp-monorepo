import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Tag,
  Loader2,
  AlertTriangle,
  QrCode,
  ArrowLeft,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/engenharia/qr/$token")({
  component: QrDetailPage,
});

function QrDetailPage() {
  return (
    <AuthShell>
      <QrDetailContent />
    </AuthShell>
  );
}

function QrDetailContent() {
  const { token } = Route.useParams();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateEquipment = useMutation(api.equipment.update);

  const [editing, setEditing] = useState(false);
  const [editTag, setEditTag] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirector = currentUser?.role === "director";

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://app.rlp.com";

  if (data === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h1 className="text-2xl font-bold">Código QR não encontrado</h1>
          <p className="text-muted-foreground">
            O código QR ({token}) não está registrado no sistema.
          </p>
          <Button variant="outline" render={<Link to="/engenharia" />}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const { qrCode, equipment } = data;

  function startEditing() {
    if (!equipment) return;
    setEditTag(equipment.tag ?? "");
    setEditLocation(equipment.location ?? "");
    setEditing(true);
  }

  async function handleSave() {
    if (!equipment) return;
    setSaving(true);
    try {
      await updateEquipment({
        id: equipment._id,
        tag: editTag,
        location: editLocation,
      });
      setEditing(false);
    } catch (err) {
      console.error("Failed to update equipment:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <Button variant="ghost" size="sm" render={<Link to="/engenharia" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para códigos QR
        </Button>
      </div>

      {/* QR Code Visual */}
      <Card className="mb-4">
        <CardContent className="flex flex-col items-center pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            RLP Engenharia
          </p>
          <p className="mb-3 font-mono text-lg font-bold">{qrCode.token}</p>
          <QRCodeSVG
            value={`${baseUrl}/q/${qrCode.token}`}
            size={180}
            level="M"
          />
          <div className="mt-3 flex items-center gap-2">
            {qrCode.equipmentId ? (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200"
              >
                Vinculado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-gray-50 text-gray-500 border-gray-200"
              >
                Livre
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Criado em{" "}
              {new Date(qrCode.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Details */}
      {equipment ? (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                {editing ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="edit-tag">Nome (identificador)</Label>
                      <Input
                        id="edit-tag"
                        value={editTag}
                        onChange={(e) => setEditTag(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-location">Endereço</Label>
                      <Input
                        id="edit-location"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-xl font-bold">
                        {equipment.tag ?? "Equipamento"}
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {equipment.type ?? equipment.description}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={equipment.status} />
                {isDirector && !editing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={startEditing}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {editing && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !editTag || !editLocation}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            )}

            {!editing && (
              <>
                <Separator className="my-3" />
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{equipment.location}</span>
                  </div>
                </div>

                {equipment.notes && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-sm">{equipment.notes}</p>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            <QrCode className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">
                Nenhum Equipamento Vinculado
              </h2>
              <p className="text-sm text-muted-foreground">
                Este código QR ainda não foi vinculado a nenhum equipamento. O
                vínculo ocorre quando alguém escaneia o código e preenche o
                formulário de registro.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
