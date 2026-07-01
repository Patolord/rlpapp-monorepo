import { useAuth } from "@clerk/tanstack-react-start";
// Entry "legacy": mantém a API useSignIn com setActive/status usada neste fluxo
// (a entry principal do Clerk v6 expõe a nova API de signals, incompatível).
import { useSignIn } from "@clerk/tanstack-react-start/legacy";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { getClerkLoginErrorMessage, normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";
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
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d]">
        <Loader2 className="size-8 animate-spin text-white/60" />
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
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d] px-4">
      <Card className="w-full max-w-md border-white/10 bg-white/5 backdrop-blur-sm">
        <CardHeader className="items-center text-center pb-2">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="mb-3 size-20 rounded-full object-cover"
          />
          <CardTitle className="text-2xl font-bold text-white">
            RLP Engenharia
          </CardTitle>
          <CardDescription className="text-base text-white/60">
            Acesse sua conta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="username" className="text-base text-white/80">
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
                className="h-12 text-base border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-white/30 focus-visible:ring-white/20"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-base text-white/80">
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
                className="h-12 text-base border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-white/30 focus-visible:ring-white/20"
              />
            </div>

            {error && <p className="text-base text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold bg-white text-[#0b1228] hover:bg-white/90"
            >
              {loading && <Loader2 className="mr-2 size-5 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
