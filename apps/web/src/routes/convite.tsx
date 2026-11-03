import { useAuth } from "@clerk/tanstack-react-start";
// Entry "legacy": API useSignUp/useSignIn com setActive/status (ver index.tsx).
import { useSignIn, useSignUp } from "@clerk/tanstack-react-start/legacy";
import {
  getClerkLoginErrorMessage,
  getClerkSignUpErrorMessage,
  normalizeUsername,
  sanitizeUsernameInput,
  suggestUsername,
} from "@rlpapp/shared";
import { LoadingState } from "@rlpapp/ui/web";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, MailX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Destino do link de convite enviado pelo Clerk (userAdmin.adminInviteUser).
 * O Clerk redireciona para cá com `__clerk_ticket` (o convite) e
 * `__clerk_status`: "sign_up" quando o email ainda não tem conta, "sign_in"
 * quando já tem (entra direto) e "complete" quando o convite já foi usado.
 */
type ConviteSearch = {
  __clerk_ticket?: string;
  __clerk_status?: string;
};

export const Route = createFileRoute("/convite")({
  validateSearch: (search: Record<string, unknown>): ConviteSearch => ({
    __clerk_ticket:
      typeof search.__clerk_ticket === "string" ? search.__clerk_ticket : undefined,
    __clerk_status:
      typeof search.__clerk_status === "string" ? search.__clerk_status : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Convite | RLP Engenharia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConvitePage,
});

const MIN_PASSWORD_LENGTH = 8;
const HOME = "/app";

function ConvitePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { __clerk_ticket: ticket, __clerk_status: status } = Route.useSearch();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void navigate({ href: HOME });
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || isSignedIn) {
    return (
      <Shell>
        <LoadingState label="Carregando…" />
      </Shell>
    );
  }

  if (!ticket) {
    return (
      <Shell>
        <InvalidInvite
          title="Convite inválido"
          description="Este link não tem um convite válido. Abra o link do email que você recebeu ou peça um novo convite ao administrador."
        />
      </Shell>
    );
  }

  if (status === "sign_in") {
    return (
      <Shell>
        <TicketSignIn ticket={ticket} />
      </Shell>
    );
  }

  return (
    <Shell>
      <AcceptInviteForm ticket={ticket} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4 py-8">
      {children}
    </div>
  );
}

function InvalidInvite({ title, description }: { title: string; description: string }) {
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MailX className="size-6" />
        </div>
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button render={<Link to="/" />} variant="outline">
          Ir para o login
        </Button>
      </CardContent>
    </Card>
  );
}

/** O email já tem conta: o próprio convite serve de credencial para entrar. */
function TicketSignIn({ ticket }: { ticket: string }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || !signIn || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const result = await signIn.create({ strategy: "ticket", ticket });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          await navigate({ href: HOME });
        } else {
          setError("Não foi possível entrar com este convite. Entre com seu login e senha.");
        }
      } catch (err) {
        setError(getClerkLoginErrorMessage(err, "Não foi possível entrar com este convite."));
      }
    })();
  }, [isLoaded, signIn, setActive, navigate, ticket]);

  if (error) {
    return <InvalidInvite title="Convite já usado" description={error} />;
  }
  return <LoadingState label="Entrando…" />;
}

type AcceptForm = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone: string;
};

function AcceptInviteForm({ ticket }: { ticket: string }) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const navigate = useNavigate();
  const [form, setForm] = useState<AcceptForm>({
    firstName: "",
    lastName: "",
    username: "",
    password: "",
    phone: "",
  });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (patch: Partial<AcceptForm>) => setForm((f) => ({ ...f, ...patch }));

  const setName = (patch: Pick<AcceptForm, "firstName"> | Pick<AcceptForm, "lastName">) =>
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
    form.password.length >= MIN_PASSWORD_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signUp || !canSubmit || loading) return;
    setError("");
    setLoading(true);
    try {
      const phone = form.phone.trim();
      const result = await signUp.create({
        strategy: "ticket",
        ticket,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: normalizeUsername(form.username),
        password: form.password,
        unsafeMetadata: phone ? { phone } : {},
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        await navigate({ href: HOME });
      } else {
        setError(
          "O cadastro ficou incompleto. Tente de novo ou peça um novo convite ao administrador."
        );
      }
    } catch (err) {
      setError(getClerkSignUpErrorMessage(err, "Erro ao criar a conta. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="items-center text-center">
        <img src="/logo.jpg" alt="RLP Engenharia" className="mb-3 size-20 object-contain" />
        <CardTitle className="text-2xl font-bold">Você foi convidado</CardTitle>
        <CardDescription className="text-base">
          Crie sua conta na RLP Engenharia. O login e a senha que você escolher
          aqui valem para o sistema e para o app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="firstName" className="text-base">
                Nome
              </Label>
              <Input
                id="firstName"
                placeholder="João"
                autoComplete="given-name"
                autoFocus
                value={form.firstName}
                onChange={(e) => setName({ firstName: e.target.value })}
                disabled={!isLoaded}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName" className="text-base">
                Sobrenome
              </Label>
              <Input
                id="lastName"
                placeholder="Silva"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => setName({ lastName: e.target.value })}
                disabled={!isLoaded}
                required
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="username" className="text-base">
              Login
            </Label>
            <Input
              id="username"
              placeholder="joao.silva"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.username}
              onChange={(e) => {
                setUsernameTouched(true);
                update({ username: sanitizeUsernameInput(e.target.value) });
              }}
              disabled={!isLoaded}
              required
              className="h-12 font-mono text-base"
            />
            <p className="text-sm text-muted-foreground">
              {usernameTouched
                ? "Só letras minúsculas, números, ponto, hífen e sublinhado."
                : "Sugerido a partir do nome. Você pode escolher outro."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password" className="text-base">
              Senha
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                minLength={MIN_PASSWORD_LENGTH}
                onChange={(e) => update({ password: e.target.value })}
                disabled={!isLoaded}
                required
                className="h-12 pr-12 text-base"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent"
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
            <p className="text-sm text-muted-foreground">
              Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone" className="text-base">
              Telefone{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(11) 99999-9999"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => update({ phone: e.target.value })}
              disabled={!isLoaded}
              className="h-12 text-base"
            />
          </div>

          {error && (
            <p role="alert" className="text-base text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={!isLoaded || loading || !canSubmit}
            size="xl"
            className="w-full font-semibold"
          >
            {loading && <Loader2 className="size-5 animate-spin" />}
            Criar conta e entrar
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link
              to="/"
              className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
