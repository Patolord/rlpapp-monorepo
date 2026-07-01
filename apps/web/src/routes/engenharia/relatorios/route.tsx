import { createFileRoute, Outlet } from "@tanstack/react-router";

// O layout (sidebar + header) vem do route pai `/engenharia`. Aqui só
// encaminhamos as rotas filhas de relatórios.
export const Route = createFileRoute("/engenharia/relatorios")({
  component: () => <Outlet />,
});
