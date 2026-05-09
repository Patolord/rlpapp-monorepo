import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/rh/")({
  component: RhDashboard,
});

function RhDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10">
        <Users className="h-8 w-8 text-violet-600" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Recursos Humanos</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        O módulo de RH está em desenvolvimento. Em breve você terá acesso a gestão de funcionários, folha de pagamento e benefícios.
      </p>
    </div>
  );
}
