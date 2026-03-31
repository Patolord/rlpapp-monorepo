import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import Header from "@/components/header";

export const Route = createFileRoute("/estoque")({
  beforeLoad: async ({ context }) => {
    if (!(context as any).userId) {
      throw redirect({ to: "/login" });
    }
  },
  component: EstoqueLayout,
});

function EstoqueLayout() {
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <Header />
      <Outlet />
    </div>
  );
}
