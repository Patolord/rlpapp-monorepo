import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { ArrowLeft, ChevronRight, HardHat, History, Search } from "lucide-react";

import { OfflineBanner } from "@/components/campo/field-page-shell";
import { MyObrasList } from "@/components/campo/my-obras-list";
import { PendingBanner } from "@/components/campo/pending-records";
import { Button } from "@/components/ui/button";

// Primeira tela do app de campo (e start_url do PWA): as obras do técnico.
// Tudo o mais — escanear, digitar código, etiquetas, registros — acontece
// dentro de uma obra.
export const Route = createFileRoute("/qr-operador")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: QrOperadorPage,
});

function QrOperadorPage() {
  const currentUser = useQuery(api.users.getCurrentUser);

  const backTo =
    currentUser?.role === "director"
      ? "/app"
      : currentUser?.role !== "qr_operator" && currentUser?.department
        ? `/${currentUser.department}`
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {backTo ? (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              render={<Link to={backTo} />}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <img
              src="/logo.jpg"
              alt="RLP Engenharia"
              className="size-9 shrink-0 rounded-full object-cover"
            />
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-sm font-semibold">
              <HardHat className="size-4 text-muted-foreground" />
              Minhas obras
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Toque em uma obra para escanear etiquetas e registrar serviços.
            </p>
          </div>
        </div>
        <UserButton />
      </header>
      <OfflineBanner detail="Suas obras e os PDFs salvos continuam disponíveis." />

      <div className="flex flex-1 justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-lg flex-col gap-4 py-2">
          <PendingBanner />
          <MyObrasList />

          <Link
            to="/qr-operador/outras-obras"
            className="flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
          >
            <div className="rounded-md bg-muted p-2">
              <Search className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Estou em outra obra</p>
              <p className="text-xs text-muted-foreground">
                Procurar uma obra que não está na sua lista.
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>

          <Link
            to="/meus-registros"
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
          >
            <div className="rounded-md bg-muted p-2">
              <History className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Meus registros</p>
              <p className="text-xs text-muted-foreground">
                Tudo o que você enviou, inclusive o que ficou sem obra.
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}
