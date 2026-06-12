import { useAuth } from "@clerk/tanstack-react-start";
// Entry "legacy": mantém a API useSignIn com setActive/status usada neste fluxo
// (a entry principal do Clerk v6 expõe a nova API de signals, incompatível).
import { useSignIn } from "@clerk/tanstack-react-start/legacy";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
        identifier: username,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        await navigate({ to: destination });
      } else {
        setError("Erro ao fazer login. Tente novamente.");
      }
    } catch (err: unknown) {
      const clerkError = (err as { errors?: Array<{ code?: string; longMessage?: string }> })
        ?.errors?.[0];
      if (clerkError) {
        const messages: Record<string, string> = {
          form_identifier_not_found: "Usuário não encontrado.",
          form_password_incorrect: "Senha incorreta.",
          too_many_attempts:
            "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        };
        setError(
          messages[clerkError.code ?? ""] ??
            clerkError.longMessage ??
            "Erro ao fazer login."
        );
      } else {
        setError("Erro inesperado. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d] px-4">
      <Card className="w-full max-w-sm border-white/10 bg-white/5 backdrop-blur-sm">
        <CardHeader className="items-center text-center">
          <img
            src="/logo.jpg"
            alt="RLP Engenharia"
            className="mb-2 size-16 rounded-full object-cover"
          />
          <CardTitle className="text-lg text-white">RLP Engenharia</CardTitle>
          <CardDescription className="text-white/60">
            Acesse sua conta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username" className="text-white/80">
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="seu.usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-white/30 focus-visible:ring-white/20"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password" className="text-white/80">
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
                className="border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-white/30 focus-visible:ring-white/20"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-[#0b1228] hover:bg-white/90"
            >
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
