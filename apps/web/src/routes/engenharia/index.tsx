import { createFileRoute } from "@tanstack/react-router";
import { HardHat } from "lucide-react";

export const Route = createFileRoute("/engenharia/")({
  component: EngenhariaDashboard,
});

function EngenhariaDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
        <HardHat className="h-8 w-8 text-amber-600" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Engenharia</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        O módulo de engenharia está em desenvolvimento. Em breve você terá acesso a projetos, cronogramas e documentação técnica.
      </p>
    </div>
  );
}
