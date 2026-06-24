import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { getMaintenanceLogTypeLabel, type MaintenanceLogType } from "@/lib/maintenance-log-type";
import { uploadPhotos } from "@/lib/upload-photos";
import { CheckCircle2, XCircle, User, Calendar, ImagePlus, Loader2 } from "lucide-react";

interface MaintenanceLogProps {
  log: {
    _id: string;
    type?: MaintenanceLogType;
    technicianName: string;
    notes?: string;
    tags?: string[];
    status: "installing" | "operational" | "warning" | "error";
    tests?: {
      vacuum: boolean;
      pressure: boolean;
      communication: boolean;
      gas?: boolean;
    };
    photoUrls: string[];
    createdAt: number;
  };
}

function TestItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {passed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
      <span>{label}</span>
    </div>
  );
}

export function MaintenanceLogCard({ log }: MaintenanceLogProps) {
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotosMutation = useMutation(api.maintenanceLogs.addPhotos);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);

  const date = new Date(log.createdAt);
  const formattedDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isInstallation = log.type === "installation";

  async function handleSavePhotos() {
    if (newPhotos.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoIds = await uploadPhotos(generateUploadUrl, newPhotos);
      await addPhotosMutation({
        logId: log._id as Id<"maintenanceLogs">,
        photoIds,
      });
      setNewPhotos([]);
      setAddingPhotos(false);
    } catch (err) {
      console.error("Failed to add photos:", err);
      setError("Não foi possível salvar as fotos. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {formattedDate} {formattedTime}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{log.technicianName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isInstallation ? "default" : "secondary"}>
              {getMaintenanceLogTypeLabel(log.type ?? "maintenance")}
            </Badge>
            <StatusBadge status={log.status} />
          </div>
        </div>

        {log.tags && log.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {log.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {log.notes && (
          <p className="text-sm leading-relaxed">{log.notes}</p>
        )}

        {log.tests && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <TestItem label="Vácuo" passed={log.tests.vacuum} />
            <TestItem label="Pressão" passed={log.tests.pressure} />
            <TestItem label="Comunicação" passed={log.tests.communication} />
            {log.tests.gas !== undefined && (
              <TestItem label="Carga de gás" passed={log.tests.gas} />
            )}
          </div>
        )}

        {log.photoUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {log.photoUrls.map((url, index) => (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square overflow-hidden rounded-md"
              >
                <img
                  src={url}
                  alt={`Foto ${index + 1}`}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </a>
            ))}
          </div>
        )}

        {addingPhotos ? (
          <div className="space-y-3 border-t pt-3">
            <PhotoPicker
              files={newPhotos}
              onFilesChange={setNewPhotos}
              label="Adicionar Foto"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setAddingPhotos(false);
                  setNewPhotos([]);
                  setError(null);
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                onClick={handleSavePhotos}
                disabled={submitting || newPhotos.length === 0}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {submitting ? "Salvando..." : "Salvar Fotos"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setAddingPhotos(true)}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Adicionar Fotos
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
