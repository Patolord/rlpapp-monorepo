import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout pai das abas da obra (Prédio, Torres, Dashboard, etc.). O conteúdo
// da aba "Prédio" vive em `$projectId.index.tsx`; aqui só encaminhamos os
// filhos via Outlet para que cada aba renderize seu próprio conteúdo.
export const Route = createFileRoute("/engenharia/relatorios/$projectId")({
  component: () => <Outlet />,
});
