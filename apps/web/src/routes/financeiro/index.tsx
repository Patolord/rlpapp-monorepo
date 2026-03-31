import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";

export const Route = createFileRoute("/financeiro/")({
  component: FinanceiroDashboard,
});

function FinanceiroDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <DollarSign className="h-8 w-8 text-emerald-600" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Financeiro</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        O módulo financeiro está em desenvolvimento. Em breve você terá acesso a contas a pagar, receber, fluxo de caixa e relatórios.
      </p>
    </div>
  );
}
