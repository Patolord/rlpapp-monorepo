import { useAuth } from "@clerk/tanstack-react-start";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth } from "convex/react";
import { CheckCircle2, Loader2, Monitor } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";
import { parseConnectParams, takeoffCallbackUrl, type ConnectParams } from "@/lib/takeoff-connect";

/**
 * Login do RLP Takeoff (app desktop) com a conta da empresa.
 *
 * O app abre esta página no navegador com `port`, `state`, `challenge` (PKCE
 * S256) e `device`. Confirmando, o backend grava um código de uso único ligado
 * a este usuário e ao desafio (`takeoffAuth.createCode`), e o navegador volta
 * para o listener do app em `http://127.0.0.1:<port>/callback`. Ver
 * packages/backend/convex/lib/takeoffAuth.ts.
 */
export const Route = createFileRoute("/takeoff/conectar")({
  validateSearch: (search: Record<string, unknown>): Partial<Record<keyof ConnectParams, string>> => {
    const pick = (key: string) => {
      const value = search[key];
      return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
    };
    return {
      port: pick("port"),
      state: pick("state"),
      challenge: pick("challenge"),
      device: pick("device"),
      installation: pick("installation"),
    };
  },
  component: ConectarPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-4">
      <Card className="w-full max-w-md shadow-sm">{children}</Card>
    </div>
  );
}

function ConectarPage() {
  const search = Route.useSearch();
  const params = useMemo(() => parseConnectParams(search), [search]);
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Sem sessão: entra pela página de login e volta para cá com os parâmetros.
  useEffect(() => {
    if (params && isLoaded && !isSignedIn) {
      void navigate({
        to: "/",
        search: { redirect: `${window.location.pathname}${window.location.search}` },
      });
    }
  }, [params, isLoaded, isSignedIn, navigate]);

  if (!params) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Link inválido</CardTitle>
          <CardDescription>
            Este endereço deve ser aberto pelo botão &ldquo;Entrar&rdquo; do RLP
            Takeoff. Volte ao app e tente de novo.
          </CardDescription>
        </CardHeader>
      </Shell>
    );
  }
  if (!isLoaded || !isSignedIn) {
    return (
      <Shell>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </CardContent>
      </Shell>
    );
  }
  return <ConfirmConnection params={params} />;
}

function ConfirmConnection({ params }: { params: ConnectParams }) {
  const { isAuthenticated } = useConvexAuth();
  const createCode = useAction(api.takeoffAuth.createCode);
  const [phase, setPhase] = useState<"ask" | "busy" | "done" | "cancelled">("ask");
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setPhase("busy");
    setError(null);
    try {
      const { code } = await createCode({
        challenge: params.challenge,
        device: params.device,
        installationId: params.installation,
      });
      setPhase("done");
      window.location.assign(takeoffCallbackUrl(params, { code }));
    } catch (e) {
      setError(getErrorMessage(e, "Não foi possível conectar o app"));
      setPhase("ask");
    }
  };

  const cancel = () => {
    setPhase("cancelled");
    // avisa o app para parar de esperar
    window.location.assign(takeoffCallbackUrl(params, { error: "access_denied" }));
  };

  if (phase === "done" || phase === "cancelled") {
    return (
      <Shell>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="mb-2 size-10 text-green-600" />
          <CardTitle>{phase === "done" ? "Pronto" : "Conexão cancelada"}</CardTitle>
          <CardDescription>
            {phase === "done"
              ? "Pode voltar ao RLP Takeoff. Esta aba já pode ser fechada."
              : "Nada foi conectado. Esta aba já pode ser fechada."}
          </CardDescription>
        </CardHeader>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardHeader className="items-center text-center">
        <Monitor className="mb-2 size-10 text-primary" />
        <CardTitle className="text-xl">
          Conectar o RLP Takeoff ({params.device}) à sua conta?
        </CardTitle>
        <CardDescription className="text-base">
          O app passa a baixar o catálogo da empresa e enviar propostas de
          material em seu nome, com as suas permissões. Você pode desconectar
          este computador a qualquer momento em Minha conta &rsaquo; Agentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="xl"
          className="font-semibold"
          disabled={phase === "busy" || !isAuthenticated}
          onClick={() => void connect()}
        >
          {(phase === "busy" || !isAuthenticated) && (
            <Loader2 className="animate-spin" />
          )}
          Conectar
        </Button>
        <Button variant="outline" size="xl" disabled={phase === "busy"} onClick={cancel}>
          Cancelar
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Só confirme se foi você quem clicou em &ldquo;Entrar&rdquo; no RLP Takeoff
          agora há pouco.
        </p>
      </CardContent>
    </Shell>
  );
}
