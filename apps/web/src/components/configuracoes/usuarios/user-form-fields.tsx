import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@rlpapp/shared/auth/permissions";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MIN_PASSWORD_LENGTH = 8;

/** Bloco de campos com rótulo de seção, como nos dialogs do RH. */
export function FormSection({
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

export function Field({
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
    // content-start: numa linha com dois campos, o que não tem hint não
    // distribui a altura sobrando entre rótulo e input.
    <div className="grid content-start gap-1.5">
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

export function PasswordInput({
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

/** Lista de acessos com uma caixa por item; a ordem é a de `ROLES`. */
export function AccessFields({
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

export function accessHint(count: number): string {
  if (count === 0) return "Marque pelo menos um";
  return `${count} de ${ROLES.length} marcado${count === 1 ? "" : "s"}`;
}
