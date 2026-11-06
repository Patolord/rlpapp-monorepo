import { api } from "@rlpapp/backend/convex/_generated/api";
import { getPermissions, type Role } from "@rlpapp/shared/auth/permissions";
import { formatDate, formatDisplayName, formatUsername } from "@rlpapp/shared";
import { useAction, useMutation } from "convex/react";
import { Loader2, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PermissionOverridesFields } from "@/components/configuracoes/permission-overrides-fields";
import {
  inviteRedirectUrl,
  isPendingInvite,
  type User,
} from "@/components/configuracoes/usuarios/admin-user";
import { UserStatusBadge } from "@/components/configuracoes/usuarios/user-badges";
import {
  DIALOG_CLASS,
  DialogActions,
  DialogBody,
} from "@/components/configuracoes/usuarios/user-dialog-layout";
import {
  AccessFields,
  Field,
  FormSection,
  accessHint,
} from "@/components/configuracoes/usuarios/user-form-fields";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { runWithToast } from "@/lib/errors";
import { sameOverrides, type PermissionOverrides } from "@/lib/permission-overrides";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

type EditFormData = {
  name: string;
  email: string;
  phone: string;
  roles: Role[];
  overrides: PermissionOverrides;
};

export function EditUserDialog({
  user,
  currentUserId,
  onClose,
}: {
  user: User | null;
  currentUserId: User["_id"];
  onClose: () => void;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS}>
        {user && (
          <EditUserForm
            key={user._id}
            user={user}
            isSelf={user._id === currentUserId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function sameRoles(a: Role[], b: Role[]): boolean {
  return a.length === b.length && a.every((role, i) => role === b[i]);
}

function EditUserForm({
  user,
  isSelf,
  onClose,
}: {
  user: User;
  isSelf: boolean;
  onClose: () => void;
}) {
  const updateUser = useMutation(api.users.update);
  const resendInvite = useAction(api.userAdmin.adminResendInvite);
  const pending = isPendingInvite(user);
  const [form, setForm] = useState<EditFormData>({
    name: user.name,
    email: user.email ?? "",
    phone: user.phone ?? "",
    roles: user.roles,
    overrides: {
      permissionGrants: user.permissionGrants,
      permissionDenials: user.permissionDenials,
    },
  });
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  const update = (patch: Partial<EditFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const isDirty =
    form.name.trim() !== user.name ||
    form.email.trim() !== (user.email ?? "") ||
    form.phone.trim() !== (user.phone ?? "") ||
    !sameRoles(form.roles, user.roles) ||
    !sameOverrides(form.overrides, {
      permissionGrants: user.permissionGrants,
      permissionDenials: user.permissionDenials,
    });

  // Mesma regra do backend (users.update): quem edita a si mesmo mantém a
  // gestão de usuários (acesso de administração/diretoria e sem retirá-la).
  const removesOwnAdmin =
    isSelf &&
    !getPermissions({ roles: form.roles, ...form.overrides }).includes("admin.manage");

  const canSubmit = form.name.trim() !== "" && isDirty && !removesOwnAdmin;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        updateUser({
          id: user._id,
          name: form.name.trim(),
          // Convite pendente: o email é a chave do convite e fica como está.
          email: pending ? undefined : form.email.trim() || null,
          phone: form.phone.trim() || null,
          roles: form.roles,
          permissionGrants: form.overrides.permissionGrants,
          permissionDenials: form.overrides.permissionDenials,
        }),
      "Alterações salvas",
      "Erro ao salvar alterações"
    );
    setSaving(false);
    if (ok) onClose();
  };

  const handleResend = async () => {
    setResending(true);
    await runWithToast(
      () => resendInvite({ id: user._id, redirectUrl: inviteRedirectUrl() }),
      `Convite reenviado para ${user.email}`,
      "Erro ao reenviar convite"
    );
    setResending(false);
  };

  const meta: string[] = [];
  if (user.username) meta.push(`Login ${formatUsername(user.username)}`);
  if (pending && user.invitedAt) meta.push(`Convidado em ${formatDate(user.invitedAt)}`);
  else if (user.lastLoginAt) meta.push(`Último acesso em ${formatDate(user.lastLoginAt)}`);
  else meta.push("Nunca acessou");

  return (
    <form onSubmit={handleSubmit} className="contents">
      <DialogHeader className="flex-row items-center gap-4 space-y-0 px-6 pt-6 pb-4 pr-12 text-left">
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="truncate text-lg">
              {formatDisplayName(user.name)}
            </DialogTitle>
            <UserStatusBadge user={user} />
          </div>
          <DialogDescription className="truncate">
            {meta.join(" · ")}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogBody>
        {pending && (
          <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-foreground">
            O convite ainda não foi aceito. Nome e login são definidos pela
            própria pessoa ao criar a conta; os acessos valem desde já.
          </p>
        )}

        <FormSection title="Contato">
          <Field id="edit-name" label="Nome completo">
            <Input
              id="edit-name"
              autoComplete="off"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="edit-email"
              label="Email"
              optional={!pending}
              hint={
                pending
                  ? "É o email do convite. Para mudar, cancele o convite e envie outro."
                  : undefined
              }
            >
              <Input
                id="edit-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                readOnly={pending}
                className={pending ? "bg-muted/60 text-muted-foreground" : undefined}
              />
            </Field>
            <Field id="edit-phone" label="Telefone" optional>
              <Input
                id="edit-phone"
                type="tel"
                autoComplete="off"
                placeholder="(11) 99999-9999"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </Field>
          </div>
          {!user.username && !pending && (
            <p className="text-xs text-muted-foreground">
              Usuário sem login próprio; entra pelo email.
            </p>
          )}
        </FormSection>

        <FormSection
          title="Acessos"
          hint={
            form.roles.length === 0
              ? "Sem acessos, o usuário não entra em nenhuma área"
              : accessHint(form.roles.length)
          }
        >
          <AccessFields
            idPrefix="edit"
            roles={form.roles}
            onChange={(roles) => update({ roles })}
          />
          {removesOwnAdmin && (
            <p role="alert" className="text-xs text-destructive">
              Você não pode remover o próprio acesso de administração.
            </p>
          )}
        </FormSection>

        <FormSection
          title="Permissões individuais"
          hint="Ajuste fino por cima dos acessos: libere uma funcionalidade a mais ou retire uma do acesso só para esta pessoa."
        >
          <PermissionOverridesFields
            idPrefix="edit"
            roles={form.roles}
            overrides={form.overrides}
            onChange={(overrides) => update({ overrides })}
          />
        </FormSection>
      </DialogBody>

      <DialogActions
        start={
          pending ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resending}
              onClick={handleResend}
            >
              {resending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Send />
              )}
              Reenviar convite
            </Button>
          ) : undefined
        }
      >
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !canSubmit}>
          {saving && <Loader2 className="animate-spin" />}
          Salvar alterações
        </Button>
      </DialogActions>
    </form>
  );
}
