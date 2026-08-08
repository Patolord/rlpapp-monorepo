import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { runWithToast } from "@/lib/errors";

export function AssignTechniciansDialog({
  projectId,
  trigger,
}: {
  projectId: Id<"projects">;
  trigger?: ReactNode;
}) {
  const assigned = useQuery(api.projects.getAssignedTechnicians, { projectId });
  const candidates = useQuery(api.users.list, {
    onlyActive: true,
    role: "qr_operator",
  });
  const setTechnicians = useMutation(api.projects.setTechnicians);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<Id<"users">>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || assigned === undefined) return;
    setSelected(new Set(assigned.map((t) => t._id)));
  }, [open, assigned]);

  function toggle(id: Id<"users">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const ok = await runWithToast(
      () =>
        setTechnicians({
          projectId,
          technicianIds: [...selected],
        }),
      "Técnicos atualizados",
      "Não foi possível atualizar os técnicos"
    );
    setSaving(false);
    if (ok) setOpen(false);
  }

  const loading = assigned === undefined || candidates === undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Users className="mr-1.5 size-4" />
            Técnicos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Técnicos da obra</DialogTitle>
          <DialogDescription>
            Técnicos atribuídos podem listar os códigos QR e equipamentos desta
            obra em campo, mesmo que não tenham cadastrado o equipamento.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhum técnico (qr_operator) ativo cadastrado.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
            {candidates.map((user) => {
              const checked = selected.has(user._id);
              return (
                <li key={user._id}>
                  <Label
                    htmlFor={`tech-${user._id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60"
                  >
                    <Checkbox
                      id={`tech-${user._id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(user._id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {user.name}
                    </span>
                  </Label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
