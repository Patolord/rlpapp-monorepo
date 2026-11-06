import { useAuth } from "@clerk/tanstack-react-start";
import { LoadingState } from "@rlpapp/ui/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AcceptInviteForm } from "@/components/convite/accept-invite-form";
import {
  INVITE_HOME,
  InvalidInvite,
  InviteShell,
} from "@/components/convite/invite-shell";
import { TicketSignIn } from "@/components/convite/ticket-sign-in";

/**
 * Destino do link de convite enviado pelo Clerk (userAdmin.adminInviteUser).
 * O Clerk redireciona para cá com `__clerk_ticket` (o convite) e
 * `__clerk_status`: "sign_up" quando o email ainda não tem conta, "sign_in"
 * quando já tem (entra direto) e "complete" quando o convite já foi usado.
 */
type ConviteSearch = {
  __clerk_ticket?: string;
  __clerk_status?: string;
};

export const Route = createFileRoute("/convite")({
  validateSearch: (search: Record<string, unknown>): ConviteSearch => ({
    __clerk_ticket:
      typeof search.__clerk_ticket === "string" ? search.__clerk_ticket : undefined,
    __clerk_status:
      typeof search.__clerk_status === "string" ? search.__clerk_status : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Convite | RLP Engenharia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConvitePage,
});

function ConvitePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const { __clerk_ticket: ticket, __clerk_status: status } = Route.useSearch();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void navigate({ href: INVITE_HOME });
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || isSignedIn) {
    return (
      <InviteShell>
        <LoadingState label="Carregando…" />
      </InviteShell>
    );
  }

  if (!ticket) {
    return (
      <InviteShell>
        <InvalidInvite
          title="Convite inválido"
          description="Este link não tem um convite válido. Abra o link do email que você recebeu ou peça um novo convite ao administrador."
        />
      </InviteShell>
    );
  }

  if (status === "sign_in") {
    return (
      <InviteShell>
        <TicketSignIn ticket={ticket} />
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <AcceptInviteForm ticket={ticket} />
    </InviteShell>
  );
}
