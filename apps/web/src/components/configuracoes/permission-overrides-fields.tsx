import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  describePermissions,
  overridesCount,
  togglePermission,
  type PermissionOverrides,
  type PermissionSource,
} from "@/lib/permission-overrides";
import { cn } from "@/lib/utils";

const SOURCE_BADGES: Partial<
  Record<PermissionSource, { label: string; variant: "success" | "danger" | "muted" | "warning" }>
> = {
  granted: { label: "Adicionada", variant: "success" },
  denied: { label: "Retirada", variant: "danger" },
  dependency: { label: "Pré-requisito", variant: "muted" },
  blocked: { label: "Sem pré-requisito", variant: "warning" },
};

/**
 * Ajustes individuais de permissão por cima dos acessos: cada funcionalidade
 * com uma caixa. Marcar algo que o acesso não dá concede; desmarcar algo que
 * o acesso dá retira. Pré-requisitos entram e saem junto (ver
 * PERMISSION_DEPENDENCIES no shared).
 */
export function PermissionOverridesFields({
  idPrefix,
  roles,
  overrides,
  onChange,
}: {
  idPrefix: string;
  roles: Role[];
  overrides: PermissionOverrides;
  onChange: (overrides: PermissionOverrides) => void;
}) {
  const count = overridesCount(overrides);
  const [open, setOpen] = useState(count > 0);
  const rows = describePermissions(roles, overrides);
  const enabledCount = Object.values(rows).filter((row) => row.enabled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", !open && "-rotate-90")}
          />
          {open ? "Ocultar permissões" : "Ver e ajustar permissões"}
          <span className="font-normal text-muted-foreground">
            ({enabledCount} ativas
            {count > 0 ? `, ${count} ajuste${count === 1 ? "" : "s"}` : ""})
          </span>
        </button>
        {count > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ permissionGrants: [], permissionDenials: [] })}
          >
            <RotateCcw />
            Voltar ao padrão do acesso
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-control-border bg-card">
                {group.permissions.map((permission) => {
                  const id = `${idPrefix}-perm-${permission}`;
                  const row = rows[permission];
                  const badge = SOURCE_BADGES[row.source];
                  return (
                    <label
                      key={permission}
                      htmlFor={id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-ring/45"
                    >
                      <Checkbox
                        id={id}
                        checked={row.enabled}
                        onCheckedChange={(checked) =>
                          onChange(
                            togglePermission(roles, overrides, permission, checked === true)
                          )
                        }
                        className="mt-0.5"
                      />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-sm font-medium leading-tight">
                          {PERMISSION_LABELS[permission]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {PERMISSION_DESCRIPTIONS[permission]}
                        </span>
                      </span>
                      {badge && (
                        <Badge variant={badge.variant} className="mt-0.5 shrink-0">
                          {badge.label}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
