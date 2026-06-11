import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { CheckCircle2, XCircle, User, Calendar } from "lucide-react";

interface MaintenanceLogProps {
  log: {
    _id: string;
    type?: "installation" | "maintenance";
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
              {isInstallation ? "Instalação" : "Manutenção"}
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
      </CardContent>
    </Card>
  );
}
