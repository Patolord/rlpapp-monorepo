import {
  createFileRoute,
  redirect,
  Link,
} from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { Button } from "@/components/ui/button";
import { FieldRecordWorkspace } from "@/components/engenharia/field-record-workspace";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/meus-registros")({
  validateSearch: (
    search: Record<string, unknown>
  ): { action?: "manual" | "scan" | "projects" | "history" } => {
    const action = search.action;
    return action === "manual" ||
      action === "scan" ||
      action === "projects" ||
      action === "history"
      ? { action }
      : {};
  },
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: MeusRegistrosPage,
});

function MeusRegistrosPage() {
  const search = Route.useSearch();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
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
          <h1 className="text-sm font-semibold">Meus Registros</h1>
        </div>
        <UserButton />
      </header>

      <div className="flex-1 overflow-auto px-4 pb-6">
        <FieldRecordWorkspace initialAction={search.action} />
      </div>
    </div>
  );
}
