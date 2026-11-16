import { createFileRoute, redirect } from "@tanstack/react-router";

// O quadro saiu da Engenharia para a área própria /orcamentos; links antigos
// (favoritos, mensagens) continuam chegando lá.
export const Route = createFileRoute("/engenharia/orcamentos")({
  beforeLoad: () => {
    throw redirect({ to: "/orcamentos", replace: true });
  },
});
