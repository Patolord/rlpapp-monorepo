import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { ArrowLeft } from "lucide-react";

import { SentHistoryByProject } from "@/components/engenharia/sent-history-by-project";
import { Button } from "@/components/ui/button";

// Histórico completo do técnico, inclusive registros sem obra. O fluxo de
// escanear e cadastrar ficou dentro de cada obra; esta rota não volta a ser
// o hub antigo.
export const Route = createFileRoute("/meus-registros")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: MeusRegistrosPage,
});

function MeusRegistrosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            render={<Link to="/qr-operador" />}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-semibold">Meus registros</h1>
        </div>
        <UserButton />
      </header>
      <div className="flex-1 overflow-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl py-2">
          <SentHistoryByProject />
        </div>
      </div>
    </div>
  );
}
