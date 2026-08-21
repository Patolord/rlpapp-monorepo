import { useAuth } from "@clerk/tanstack-react-start";
// Entry "legacy": mantém a API useSignIn com setActive/status usada neste fluxo
// (a entry principal do Clerk v6 expõe a nova API de signals, incompatível).
import { useSignIn } from "@clerk/tanstack-react-start/legacy";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { getClerkLoginErrorMessage, normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";
import { LoadingState } from "@rlpapp/ui/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type IndexSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const redirect = search.redirect;
    // Só aceita caminhos internos para evitar open redirect
    if (typeof redirect === "string" && redirect.startsWith("/")) {
      return { redirect };
    }
    return {};
  },
  component: IndexPage,
});

function useLoginDestination() {
  const { redirect } = Route.useSearch();
  return redirect ?? "/app";
}

function IndexPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const destination = useLoginDestination();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void navigate({ to: destination });
    }
  }, [isLoaded, isSignedIn, navigate, destination]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc]">
        <LoadingState label="Carregando..." />
      </div>
    );
  }

  return <LoginForm />;
}

function LoginForm() {
  const { signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const destination = useLoginDestination();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;

    setError("");
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: normalizeUsername(username),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: destination });
      } else {
        setError("Erro ao fazer login. Tente novamente.");
      }
    } catch (err: unknown) {
      setError(getClerkLoginErrorMessage(err, "Erro inesperado. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center pb-2">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="mb-3 size-20 object-contain"
          />
          <CardTitle className="text-2xl font-bold">RLP Engenharia</CardTitle>
          <CardDescription className="text-base">
            Acesse sua conta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="username" className="text-base">
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="seu.usuario"
                value={username}
                onChange={(e) => setUsername(sanitizeUsernameInput(e.target.value))}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                className="h-12 text-base"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-base">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 text-base"
              />
            </div>

            {error && <p className="text-base text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full text-base font-semibold"
            >
              {loading && <Loader2 className="mr-2 size-5 animate-spin" />}
              Entrar
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                to="/politica-privacidade"
                className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Política de Privacidade
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
