import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  can,
  hasRole,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import {
  formatDate,
  formatDisplayName,
  formatUsername,
  normalizeUsername,
  sanitizeUsernameInput,
  suggestUsername,
} from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/web";
import { createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MailX,
  Pencil,
  Search,
  Send,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runWithToast } from "@/lib/errors";
import { cn } from "@/lib/utils";

type User = FunctionReturnType<typeof api.users.list>[number];

export const Route = createFileRoute("/configuracoes/usuarios")({
  component: UsuariosPage,
});

const MIN_PASSWORD_LENGTH = 8;

/** Convite enviado e ainda não aceito: o cadastro existe, a conta não. */
function isPendingInvite(user: Pick<User, "clerkId" | "invitedAt">): boolean {
  return user.clerkId === undefined && user.invitedAt !== undefined;
}

/** Página /convite deste app, destino do link que o Clerk envia por email. */
function inviteRedirectUrl(): string {
  return `${window.location.origin}/convite`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function UsuariosPage() {
  return (
    <AuthShell>
      <UsuariosContent />
    </AuthShell>
  );
}

function UsuariosContent() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.list, {});

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [revokingUser, setRevokingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const isAdmin = can(currentUser, "admin.manage");

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];
    if (filterStatus === "active") {
      result = result.filter((u) => u.isActive && !isPendingInvite(u));
    } else if (filterStatus === "inactive") {
      result = result.filter((u) => !u.isActive);
    } else if (filterStatus === "invited") {
      result = result.filter((u) => isPendingInvite(u));
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.username?.toLowerCase().includes(term)
      );
    }
    return result.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    });
  }, [users, filterStatus, searchTerm]);

  const isFiltering = searchTerm.trim() !== "" || filterStatus !== "all";
  const pendingCount = users?.filter(isPendingInvite).length ?? 0;

  if (!currentUser) {
    return <LoadingState variant="skeleton" label="Carregando usuários" fullHeight />;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">
          Somente administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Quem acessa o sistema e com quais acessos. Os acessos se somam: uma
            pessoa pode ter vários.
          </p>
        </div>
        <NewUserDialog
          trigger={
            <Button>
              <UserPlus />
              Convidar usuário
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, email ou login"
            aria-label="Buscar usuários"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger
            className="w-full sm:w-[200px]"
            aria-label="Filtrar por status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Somente ativos</SelectItem>
            <SelectItem value="invited">
              Convites pendentes{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </SelectItem>
            <SelectItem value="inactive">Somente inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {users === undefined
              ? "Usuários"
              : isFiltering
                ? `${filteredUsers.length} de ${users.length} usuários`
                : `${users.length} usuário${users.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users === undefined ? (
            <LoadingState variant="skeleton" label="Carregando usuários" />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Nenhum usuário cadastrado"
              description="Convide a primeira pessoa pelo email para liberar o acesso ao sistema."
              action={
                <NewUserDialog
                  trigger={
                    <Button>
                      <UserPlus />
                      Convidar usuário
                    </Button>
                  }
                />
              }
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              variant="inline"
              description="Nenhum usuário corresponde aos filtros."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterStatus("all");
                  }}
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Acessos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const isSelf = user._id === currentUser._id;
                    const pending = isPendingInvite(user);
                    return (
                      <TableRow
                        key={user._id}
                        className={user.isActive ? undefined : "text-muted-foreground"}
                      >
                        <TableCell>
                          <p className="font-medium text-foreground">
                            {formatDisplayName(user.name)}
                            {isSelf && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                você
                              </span>
                            )}
                          </p>
                          {user.email && (
                            <p className="text-sm text-muted-foreground">
                              {user.email}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {user.username ? (
                            formatUsername(user.username)
                          ) : (
                            <span className="font-sans text-muted-foreground">
                              {pending ? "Define ao aceitar" : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RoleBadges roles={user.roles} />
                        </TableCell>
                        <TableCell>
                          <UserStatusBadge user={user} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {user.lastLoginAt
                            ? formatDate(user.lastLoginAt)
                            : pending && user.invitedAt
                              ? `Convidado em ${formatDate(user.invitedAt)}`
                              : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <IconAction
                              label={`Editar ${user.name}`}
                              tooltip="Editar"
                              onClick={() => setEditingUser(user)}
                            >
                              <Pencil />
                            </IconAction>
                            {pending ? (
                              <>
                                <ResendInviteButton user={user} />
                                <IconAction
                                  label={`Cancelar convite de ${user.name}`}
                                  tooltip="Cancelar convite"
                                  onClick={() => setRevokingUser(user)}
                                >
                                  <MailX className="text-destructive" />
                                </IconAction>
                              </>
                            ) : user.isActive ? (
                              <IconAction
                                label={`Desativar ${user.name}`}
                                tooltip={
                                  isSelf
                                    ? "Você não pode desativar o próprio acesso"
                                    : "Desativar"
                                }
                                disabled={isSelf}
                                onClick={() => setDeactivatingUser(user)}
                              >
                                <UserX className="text-destructive" />
                              </IconAction>
                            ) : (
                              <ReactivateButton user={user} />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditUserDialog
        user={editingUser}
        currentUserId={currentUser._id}
        onClose={() => setEditingUser(null)}
      />
      <DeactivateUserDialog
        user={deactivatingUser}
        onClose={() => setDeactivatingUser(null)}
      />
      <RevokeInviteDialog
        user={revokingUser}
        onClose={() => setRevokingUser(null)}
      />
    </div>
  );
}

/* ---------- Row actions ---------- */

function IconAction({
  label,
  tooltip,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ReactivateButton({ user }: { user: User }) {
  const reactivateUser = useMutation(api.users.reactivate);
  const [busy, setBusy] = useState(false);
  return (
    <IconAction
      label={`Reativar ${user.name}`}
      tooltip="Reativar"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await runWithToast(
          () => reactivateUser({ id: user._id }),
          "Usuário reativado",
          "Erro ao reativar usuário"
        );
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <UserCheck className="text-status-success" />}
    </IconAction>
  );
}

function ResendInviteButton({ user }: { user: User }) {
  const resendInvite = useAction(api.userAdmin.adminResendInvite);
  const [busy, setBusy] = useState(false);
  return (
    <IconAction
      label={`Reenviar convite para ${user.name}`}
      tooltip="Reenviar convite"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await runWithToast(
          () => resendInvite({ id: user._id, redirectUrl: inviteRedirectUrl() }),
          `Convite reenviado para ${user.email}`,
          "Erro ao reenviar convite"
        );
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Send />}
    </IconAction>
  );
}

function UserStatusBadge({ user }: { user: Pick<User, "isActive" | "clerkId" | "invitedAt"> }) {
  if (!user.isActive) return <Badge variant="muted">Inativo</Badge>;
  if (isPendingInvite(user)) return <Badge variant="warning">Convite pendente</Badge>;
  return <Badge variant="success">Ativo</Badge>;
}

/* ---------- Form building blocks ---------- */

/** Bloco de campos com rótulo de seção, como nos dialogs do RH. */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 flex w-full items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {title}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  children,
}: {
  id?: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        className="pr-10"
        value={value}
        minLength={MIN_PASSWORD_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={show}
      >
        {show ? (
          <EyeOff className="text-muted-foreground" />
        ) : (
          <Eye className="text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

function RoleBadges({ roles }: { roles: Role[] }) {
  if (roles.length === 0) {
    return <span className="text-sm text-muted-foreground">Sem acessos</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant="outline">
          {ROLE_LABELS[role]}
        </Badge>
      ))}
    </div>
  );
}

/** Lista de acessos com uma caixa por item; a ordem é a de `ROLES`. */
function AccessFields({
  idPrefix,
  roles,
  onChange,
}: {
  idPrefix: string;
  roles: Role[];
  onChange: (roles: Role[]) => void;
}) {
  const toggle = (role: Role, checked: boolean) => {
    const next = checked ? [...roles, role] : roles.filter((r) => r !== role);
    onChange(ROLES.filter((r) => next.includes(r)));
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLES.map((role) => {
        const id = `${idPrefix}-role-${role}`;
        return (
          <label
            key={role}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-control-border bg-card p-3 transition-colors hover:bg-muted/60 has-data-checked:border-primary/50 has-data-checked:bg-primary/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring/45"
          >
            <Checkbox
              id={id}
              checked={roles.includes(role)}
              onCheckedChange={(checked) => toggle(role, checked === true)}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium leading-none">{ROLE_LABELS[role]}</span>
              <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function accessHint(count: number): string {
  if (count === 0) return "Marque pelo menos um";
  return `${count} de ${ROLES.length} marcado${count === 1 ? "" : "s"}`;
}

/* ---------- Dialog chrome (cabeçalho fixo, corpo rolável, rodapé fixo) ---------- */

const DIALOG_CLASS =
  "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg";

function DialogBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">{children}</div>;
}

function DialogActions({
  start,
  children,
}: {
  /** Ação secundária alinhada à esquerda (ex.: reenviar convite). */
  start?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogFooter
      className={cn(
        "border-t border-border bg-muted/30 px-6 py-4 sm:items-center",
        start ? "sm:justify-between" : "sm:justify-end"
      )}
    >
      {start}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">{children}</div>
    </DialogFooter>
  );
}

/* ---------- Novo usuário ---------- */

type NewUserMode = "invite" | "manual";

type InviteFormData = {
  email: string;
  name: string;
  roles: Role[];
};

type ManualFormData = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  roles: Role[];
};

const emptyInviteForm: InviteFormData = { email: "", name: "", roles: [] };

const emptyManualForm: ManualFormData = {
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  roles: [],
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NewUserDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NewUserMode>("invite");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMode("invite");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader className="gap-4 space-y-0 px-6 pt-6 pb-4 pr-12">
          <div className="space-y-1.5">
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              {mode === "invite"
                ? "A pessoa recebe um email com o link para criar a própria conta: nome, login e senha."
                : "Para quem não tem email. Você define o login e a senha e repassa à pessoa."}
            </DialogDescription>
          </div>
          <ModeSwitch mode={mode} onChange={setMode} />
        </DialogHeader>
        {open && mode === "invite" ? (
          <InviteUserForm key="invite" onDone={() => setOpen(false)} />
        ) : open ? (
          <ManualUserForm key="manual" onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: NewUserMode;
  onChange: (mode: NewUserMode) => void;
}) {
  const options: Array<{ value: NewUserMode; label: string; icon: ReactNode }> = [
    { value: "invite", label: "Convidar por email", icon: <Mail /> },
    { value: "manual", label: "Login e senha", icon: <KeyRound /> },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Como criar o usuário"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((option) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring/45 [&_svg]:size-4 [&_svg]:shrink-0",
              selected
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InviteUserForm({ onDone }: { onDone: () => void }) {
  const inviteUser = useAction(api.userAdmin.adminInviteUser);
  const [form, setForm] = useState<InviteFormData>(emptyInviteForm);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<InviteFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const email = form.email.trim().toLowerCase();
  const canSubmit = EMAIL_PATTERN.test(email) && form.roles.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        inviteUser({
          email,
          name: form.name.trim() || undefined,
          roles: form.roles,
          redirectUrl: inviteRedirectUrl(),
        }),
      `Convite enviado para ${email}`,
      "Erro ao enviar convite"
    );
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="contents">
      <DialogBody>
        <FormSection title="Quem convidar">
          <Field id="invite-email" label="Email">
            <Input
              id="invite-email"
              type="email"
              placeholder="nome@rlpeng.com.br"
              autoComplete="off"
              autoFocus
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              required
            />
          </Field>
          <Field
            id="invite-name"
            label="Nome"
            optional
            hint="Como aparece na lista até o convite ser aceito. A pessoa define o nome final."
          >
            <Input
              id="invite-name"
              placeholder="João Silva"
              autoComplete="off"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
        </FormSection>

        <FormSection title="Acessos" hint={accessHint(form.roles.length)}>
          <AccessFields
            idPrefix="invite"
            roles={form.roles}
            onChange={(roles) => update({ roles })}
          />
        </FormSection>
      </DialogBody>

      <DialogActions>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !canSubmit}>
          {saving ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar convite
        </Button>
      </DialogActions>
    </form>
  );
}

function ManualUserForm({ onDone }: { onDone: () => void }) {
  const createUser = useAction(api.userAdmin.adminCreateUser);
  const [form, setForm] = useState<ManualFormData>(emptyManualForm);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<ManualFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const setName = (patch: Pick<ManualFormData, "firstName"> | Pick<ManualFormData, "lastName">) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!usernameTouched) {
        next.username = suggestUsername(next.firstName, next.lastName);
      }
      return next;
    });

  const canSubmit =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    form.username !== "" &&
    form.password.length >= MIN_PASSWORD_LENGTH &&
    form.roles.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        createUser({
          name: `${form.firstName.trim()} ${form.lastName.trim()}`,
          username: normalizeUsername(form.username),
          password: form.password,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          roles: form.roles,
        }),
      "Usuário criado",
      "Erro ao criar usuário"
    );
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="contents">
      <DialogBody>
        <FormSection title="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="create-firstName" label="Nome">
              <Input
                id="create-firstName"
                placeholder="João"
                autoComplete="off"
                autoFocus
                value={form.firstName}
                onChange={(e) => setName({ firstName: e.target.value })}
                required
              />
            </Field>
            <Field id="create-lastName" label="Sobrenome">
              <Input
                id="create-lastName"
                placeholder="Silva"
                autoComplete="off"
                value={form.lastName}
                onChange={(e) => setName({ lastName: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="create-email" label="Email" optional>
              <Input
                id="create-email"
                type="email"
                placeholder="joao@rlpeng.com.br"
                autoComplete="off"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
            </Field>
            <Field id="create-phone" label="Telefone" optional>
              <Input
                id="create-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                autoComplete="off"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Acesso">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="create-username"
              label="Login"
              hint={
                usernameTouched
                  ? "Só letras minúsculas, números, ponto, hífen e sublinhado."
                  : "Sugerido a partir do nome. Edite se preferir outro."
              }
            >
              <Input
                id="create-username"
                placeholder="joao.silva"
                className="font-mono"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={form.username}
                onChange={(e) => {
                  setUsernameTouched(true);
                  update({ username: sanitizeUsernameInput(e.target.value) });
                }}
                required
              />
            </Field>
            <Field
              id="create-password"
              label="Senha"
              hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
            >
              <PasswordInput
                id="create-password"
                value={form.password}
                onChange={(password) => update({ password })}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Acessos" hint={accessHint(form.roles.length)}>
          <AccessFields
            idPrefix="create"
            roles={form.roles}
            onChange={(roles) => update({ roles })}
          />
        </FormSection>
      </DialogBody>

      <DialogActions>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !canSubmit}>
          {saving && <Loader2 className="animate-spin" />}
          Criar usuário
        </Button>
      </DialogActions>
    </form>
  );
}

/* ---------- Editar ---------- */

type EditFormData = {
  name: string;
  email: string;
  phone: string;
  roles: Role[];
};

function EditUserDialog({
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
  });
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  const update = (patch: Partial<EditFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const isDirty =
    form.name.trim() !== user.name ||
    form.email.trim() !== (user.email ?? "") ||
    form.phone.trim() !== (user.phone ?? "") ||
    !sameRoles(form.roles, user.roles);

  // Mesma regra do backend (users.update): quem edita a si mesmo mantém
  // administração ou diretoria.
  const removesOwnAdmin =
    isSelf && !hasRole({ roles: form.roles }, "admin") && !hasRole({ roles: form.roles }, "director");

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

/* ---------- Desativar ---------- */

function DeactivateUserDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const removeUser = useMutation(api.users.remove);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const ok = await runWithToast(
      () => removeUser({ id: user._id }),
      "Usuário desativado",
      "Erro ao desativar usuário"
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Desativar usuário?</DialogTitle>
          <DialogDescription>
            {user ? formatDisplayName(user.name) : "O usuário"} perde o acesso
            ao sistema e ao app na hora. O cadastro continua na lista e pode ser
            reativado depois.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving && <Loader2 className="animate-spin" />}
            Desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Cancelar convite ---------- */

function RevokeInviteDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const revokeInvite = useAction(api.userAdmin.adminRevokeInvite);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    const ok = await runWithToast(
      () => revokeInvite({ id: user._id }),
      "Convite cancelado",
      "Erro ao cancelar convite"
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar convite?</DialogTitle>
          <DialogDescription>
            O link enviado para {user?.email ?? "a pessoa"} deixa de valer e o
            cadastro sai da lista. Você pode convidar de novo quando quiser.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Manter convite
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving && <Loader2 className="animate-spin" />}
            Cancelar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
