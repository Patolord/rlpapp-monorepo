import {
  AuthenticateWithRedirectCallback,
  useAuth,
  useSignIn,
} from "@clerk/tanstack-react-start";
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

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/estoque" });
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/estoque"
        signUpForceRedirectUrl="/estoque"
      />
      {!isLoaded ? (
        <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d]">
          <Loader2 className="size-8 animate-spin text-white/60" />
        </div>
      ) : isSignedIn ? (
        <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d]">
          <Loader2 className="size-8 animate-spin text-white/60" />
        </div>
      ) : (
        <LoginForm />
      )}
    </>
  );
}

function LoginForm() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;

    setError("");
    setLoading(true);

    try {
      const result = await signIn.password({
        identifier: email,
        password,
      });

      if (result.error) {
        const code = result.error.code;
        const messages: Record<string, string> = {
          form_identifier_not_found: "E-mail não encontrado.",
          form_password_incorrect: "Senha incorreta.",
          too_many_attempts:
            "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        };
        setError(messages[code ?? ""] ?? result.error.longMessage ?? "Erro ao fazer login.");
      } else {
        await signIn.finalize({ navigate: (to) => window.location.replace(to) });
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      if (clerkError) {
        const messages: Record<string, string> = {
          form_identifier_not_found: "E-mail não encontrado.",
          form_password_incorrect: "Senha incorreta.",
          too_many_attempts:
            "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        };
        setError(messages[clerkError.code] ?? clerkError.longMessage ?? "Erro ao fazer login.");
      } else {
        setError("Erro inesperado. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!signIn) return;
    setError("");
    setGoogleLoading(true);
    try {
      const origin = window.location.origin;
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: `${origin}/`,
        redirectUrl: `${origin}/estoque`,
      });
      if (result.error) {
        setError(result.error.longMessage ?? result.error.message ?? "Erro ao entrar com Google.");
        setGoogleLoading(false);
      }
    } catch (err: any) {
      console.error("[Google Sign-In Error]", err);
      const clerkError = err?.errors?.[0];
      setError(clerkError?.longMessage ?? err?.message ?? "Erro ao entrar com Google.");
      setGoogleLoading(false);
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
        <CardContent className="grid gap-4">
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            variant="outline"
            className="w-full border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            {googleLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Entrar com Google
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/15" />
            <span className="text-xs text-white/40">ou</span>
            <div className="h-px flex-1 bg-white/15" />
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-white/80">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || googleLoading}
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

function GoogleIcon() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
