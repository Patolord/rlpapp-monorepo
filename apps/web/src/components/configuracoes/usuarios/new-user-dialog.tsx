import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Role } from "@rlpapp/shared/auth/permissions";
import {
  normalizeUsername,
  sanitizeUsernameInput,
  suggestUsername,
} from "@rlpapp/shared";
import { useAction } from "convex/react";
import { KeyRound, Loader2, Mail, Send } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { inviteRedirectUrl } from "@/components/configuracoes/usuarios/admin-user";
import {
  DIALOG_CLASS,
  DialogActions,
  DialogBody,
} from "@/components/configuracoes/usuarios/user-dialog-layout";
import {
  AccessFields,
  Field,
  FormSection,
  MIN_PASSWORD_LENGTH,
  PasswordInput,
  accessHint,
} from "@/components/configuracoes/usuarios/user-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { runWithToast } from "@/lib/errors";
import { cn } from "@/lib/utils";

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

export function NewUserDialog({ trigger }: { trigger: ReactNode }) {
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
            <DialogTitle>
              {mode === "invite" ? "Convidar usuário" : "Novo usuário com login e senha"}
            </DialogTitle>
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
