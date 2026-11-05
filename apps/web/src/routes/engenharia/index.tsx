import { createFileRoute, redirect } from "@tanstack/react-router";

import { OBRAS_LIST_PATH } from "@/lib/engenharia/obra-paths";

// A engenharia começa pelas obras; códigos QR são gerenciados dentro de cada
// obra (/engenharia/obras/$obraSlug/qr-codes).
export const Route = createFileRoute("/engenharia/")({
  beforeLoad: () => {
    throw redirect({ to: OBRAS_LIST_PATH });
  },
});
