import { Link } from "@tanstack/react-router";
import { FileQuestion, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Página de recurso/rota não encontrada com saída para a tela inicial.
 * `/app` redireciona cada role para sua área (engenharia, qr-operador, etc.).
 */
export function NotFoundPage({
  title = "Página não encontrada",
  description = "O endereço que você abriu não existe ou foi removido.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8fc] px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <FileQuestion className="size-14 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Button className="mt-2" render={<Link to="/app" />}>
          <Home className="mr-2 size-4" />
          Voltar à tela inicial
        </Button>
      </div>
    </div>
  );
}
