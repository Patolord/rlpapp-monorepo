import { useEffect, useState } from "react";
import {
  createFileRoute,
  redirect,
  Link,
} from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  Building2,
  Keyboard,
  ArrowLeft,
  History,
  HardHat,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { OfflineBanner } from "@/components/campo/field-page-shell";
import { MyObrasList } from "@/components/campo/my-obras-list";
import { FieldProjectQrBrowser } from "@/components/engenharia/field-project-qr-browser";
import { FieldQrScanner } from "@/components/engenharia/field-qr-scanner";
import {
  listPendingRecords,
  QUEUE_CHANGED_EVENT,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";

export const Route = createFileRoute("/qr-operador")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: QrOperadorPage,
});

function usePendingCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingRecords().then((items) => {
        if (alive) setCount(items.length);
      });
    };
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  return count;
}

function QrOperadorPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const pendingCount = usePendingCount();
  const online = useOnline();
  const [browserOpen, setBrowserOpen] = useState(false);
  useEffect(() => {
    // Escritório vê a busca geral aberta; técnico só se quiser.
    if (currentUser && currentUser.role !== "qr_operator") setBrowserOpen(true);
  }, [currentUser]);

  const backTo =
    currentUser?.role === "director"
      ? "/app"
      : currentUser?.role !== "qr_operator" && currentUser?.department
        ? `/${currentUser.department}`
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {backTo ? (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2"
              render={<Link to={backTo} />}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <>
              <img
                src="/logo.jpg"
                alt="RLP Engenharia"
                className="size-9 rounded-full object-cover"
              />
              <h1 className="text-sm font-semibold">RLP Engenharia</h1>
            </>
          )}
        </div>
        <UserButton />
      </header>
      <OfflineBanner detail="Suas obras e os PDFs salvos continuam disponíveis." />

      <div className="flex flex-1 justify-center px-4 pb-8">
        <div className="flex w-full max-w-4xl flex-col gap-4 py-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardHat className="size-5 text-muted-foreground" />
                Minhas obras
              </CardTitle>
              <CardDescription>
                Toque em uma obra para ver documentos, etiquetas e estoque.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MyObrasList />
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle>Registrar serviço</CardTitle>
              <CardDescription>
                Escaneie a etiqueta do equipamento ou digite o código.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              {online ? (
                <div className="w-full max-w-lg">
                  <FieldQrScanner />
                </div>
              ) : (
                <p className="w-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  O leitor de QR precisa de conexão para abrir a etiqueta. Você
                  ainda pode consultar os registros pendentes.
                </p>
              )}
              <div className="grid w-full gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-12 w-full text-base"
                  render={
                    <Link to="/meus-registros" search={{ action: "manual" }} />
                  }
                >
                  <Keyboard className="mr-2 h-5 w-5" />
                  Digitar código da etiqueta
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full text-base"
                  render={
                    <Link to="/meus-registros" search={{ action: "history" }} />
                  }
                >
                  <History className="mr-2 h-5 w-5" />
                  Meus registros
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingCount}
                    </Badge>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Collapsible open={browserOpen} onOpenChange={setBrowserOpen}>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-5 text-muted-foreground" />
                    Buscar etiqueta em outra obra
                  </CardTitle>
                  <Search className="size-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <FieldProjectQrBrowser />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
