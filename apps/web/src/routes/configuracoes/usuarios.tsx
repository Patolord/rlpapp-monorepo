import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  can,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import {
  formatDate,
  formatDisplayName,
  formatUsername,
  normalizeUsername,
  sanitizeUsernameInput,
} from "@rlpapp/shared";
import { EmptyState, LoadingState } from "@rlpapp/ui/web";
import { createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { AuthShell } from "@/components/auth-shell";
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
import { runWithToast } from "@/lib/errors";

type User = FunctionReturnType<typeof api.users.list>[number];

export const Route = createFileRoute("/configuracoes/usuarios")({
  component: UsuariosPage,
});

const MIN_PASSWORD_LENGTH = 8;


/** "João Silva" → "joao.silva" (sem acentos, só caracteres aceitos pelo Clerk). */
function suggestUsername(firstName: string, lastName: string): string {
  const parts = [firstName, lastName]
    .map((part) =>
      sanitizeUsernameInput(
        part
          .trim()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
      )
    )
    .filter(Boolean);
  return parts.join(".");
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const isAdmin = can(currentUser, "admin.manage");

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];
    if (filterStatus === "active") {
      result = result.filter((u) => u.isActive);
    } else if (filterStatus === "inactive") {
      result = result.filter((u) => !u.isActive);
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
        <CreateUserDialog
          trigger={
            <Button>
              <Plus />
              Novo usuário
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
            className="w-full sm:w-[180px]"
            aria-label="Filtrar por status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Somente ativos</SelectItem>
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
              description="Crie o primeiro usuário para liberar o acesso ao sistema."
              action={
                <CreateUserDialog
                  trigger={
                    <Button>
                      <Plus />
                      Novo usuário
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
                          {user.username ? formatUsername(user.username) : "—"}
                        </TableCell>
                        <TableCell>
                          <RoleBadges roles={user.roles} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.isActive ? "success" : "muted"}>
                            {user.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingUser(user)}
                              title="Editar"
                              aria-label={`Editar ${user.name}`}
                            >
                              <Pencil />
                            </Button>
                            {user.isActive ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeactivatingUser(user)}
                                disabled={isSelf}
                                title={
                                  isSelf
                                    ? "Você não pode desativar o próprio acesso"
                                    : "Desativar"
                                }
                                aria-label={`Desativar ${user.name}`}
                              >
                                <UserX className="text-destructive" />
                              </Button>
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
        onClose={() => setEditingUser(null)}
      />
      <DeactivateUserDialog
        user={deactivatingUser}
        onClose={() => setDeactivatingUser(null)}
      />
    </div>
  );
}

function ReactivateButton({ user }: { user: User }) {
  const reactivateUser = useMutation(api.users.reactivate);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
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
      title="Reativar"
      aria-label={`Reativar ${user.name}`}
    >
      {busy ? <Loader2 className="animate-spin" /> : <UserCheck className="text-emerald-600" />}
    </Button>
  );
}

/* ---------- Form building blocks ---------- */

/** Bloco de campos com rótulo de seção, como nos dialogs do RH. */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
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
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
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

/* ---------- Create ---------- */

type CreateFormData = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  roles: Role[];
};

const emptyCreateForm: CreateFormData = {
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  roles: [],
};

function CreateUserDialog({ trigger }: { trigger: ReactNode }) {
  const createUser = useAction(api.userAdmin.adminCreateUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateFormData>(emptyCreateForm);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setForm(emptyCreateForm);
    setUsernameTouched(false);
    setShowPassword(false);
  };

  const update = (patch: Partial<CreateFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const setName = (patch: Pick<CreateFormData, "firstName"> | Pick<CreateFormData, "lastName">) =>
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
    if (ok) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O login e a senha são usados para entrar no sistema e no app.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormSection title="Identificação">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="create-firstName" label="Nome">
                <Input
                  id="create-firstName"
                  placeholder="João"
                  autoComplete="off"
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
              <Field id="create-email" label="Email" hint="Opcional">
                <Input
                  id="create-email"
                  type="email"
                  placeholder="joao@rlpeng.com.br"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => update({ email: e.target.value })}
                />
              </Field>
              <Field id="create-phone" label="Telefone" hint="Opcional">
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
              <div className="relative">
                <Input
                  id="create-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  value={form.password}
                  minLength={MIN_PASSWORD_LENGTH}
                  onChange={(e) => update({ password: e.target.value })}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="text-muted-foreground" />
                  ) : (
                    <Eye className="text-muted-foreground" />
                  )}
                </Button>
              </div>
            </Field>
          </FormSection>

          <FormSection title="Acessos" hint="Marque pelo menos um">
            <AccessFields
              idPrefix="create"
              roles={form.roles}
              onChange={(roles) => update({ roles })}
            />
          </FormSection>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving && <Loader2 className="animate-spin" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Edit ---------- */

type EditFormData = {
  name: string;
  email: string;
  phone: string;
  roles: Role[];
};

function EditUserDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {user && <EditUserForm key={user._id} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, onClose }: { user: User; onClose: () => void }) {
  const updateUser = useMutation(api.users.update);
  const [form, setForm] = useState<EditFormData>({
    name: user.name,
    email: user.email ?? "",
    phone: user.phone ?? "",
    roles: user.roles,
  });
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<EditFormData>) =>
    setForm((f) => ({ ...f, ...patch }));

  const canSubmit = form.name.trim() !== "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        updateUser({
          id: user._id,
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          roles: form.roles,
        }),
      "Alterações salvas",
      "Erro ao salvar alterações"
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogDescription>
          {user.username ? (
            <>
              Login <span className="font-mono">{formatUsername(user.username)}</span>. O login
              não pode ser alterado.
            </>
          ) : (
            "Usuário sem login próprio; entra pelo email."
          )}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection title="Identificação">
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
            <Field id="edit-email" label="Email" hint="Opcional">
              <Input
                id="edit-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
            </Field>
            <Field id="edit-phone" label="Telefone" hint="Opcional">
              <Input
                id="edit-phone"
                type="tel"
                autoComplete="off"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Acessos"
          hint={form.roles.length === 0 ? "Sem acessos, o usuário não entra em nenhuma área" : undefined}
        >
          <AccessFields
            idPrefix="edit"
            roles={form.roles}
            onChange={(roles) => update({ roles })}
          />
        </FormSection>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !canSubmit}>
            {saving && <Loader2 className="animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/* ---------- Deactivate ---------- */

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
