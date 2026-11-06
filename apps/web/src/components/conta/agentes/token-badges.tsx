import type { Permission, tokenStatus } from "@/components/conta/agentes/agent-tokens";
import { Badge } from "@/components/ui/badge";

export function PermissionBadge({ permission }: { permission: Permission }) {
  return permission === "full_access" ? (
    <Badge className="px-2 py-0.5 text-xs">Acesso total</Badge>
  ) : (
    <Badge variant="secondary" className="px-2 py-0.5 text-xs">
      Somente leitura
    </Badge>
  );
}

/** Token emitido pelo login do RLP Takeoff (app desktop), não criado à mão. */
export function DeviceBadge({ kind }: { kind?: "agent" | "device" }) {
  if (kind !== "device") return null;
  return (
    <Badge variant="outline" className="px-2 py-0.5 text-xs">
      App desktop
    </Badge>
  );
}

export function StatusBadge({
  status,
}: {
  status: ReturnType<typeof tokenStatus>;
}) {
  if (status === "revoked") {
    return (
      <Badge variant="destructive" className="px-2 py-0.5 text-xs">
        Revogado
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge variant="warning" className="px-2 py-0.5 text-xs">
        Expirado
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="px-2 py-0.5 text-xs">
      Ativo
    </Badge>
  );
}
