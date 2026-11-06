// Entry "legacy": API useSignUp/useSignIn com setActive/status (ver routes/index.tsx).
import { useSignIn } from "@clerk/tanstack-react-start/legacy";
import { getClerkLoginErrorMessage } from "@rlpapp/shared";
import { LoadingState } from "@rlpapp/ui/web";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { INVITE_HOME, InvalidInvite } from "@/components/convite/invite-shell";

/** O email já tem conta: o próprio convite serve de credencial para entrar. */
export function TicketSignIn({ ticket }: { ticket: string }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || !signIn || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const result = await signIn.create({ strategy: "ticket", ticket });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          await navigate({ href: INVITE_HOME });
        } else {
          setError("Não foi possível entrar com este convite. Entre com seu login e senha.");
        }
      } catch (err) {
        setError(getClerkLoginErrorMessage(err, "Não foi possível entrar com este convite."));
      }
    })();
  }, [isLoaded, signIn, setActive, navigate, ticket]);

  if (error) {
    return <InvalidInvite title="Convite já usado" description={error} />;
  }
  return <LoadingState label="Entrando…" />;
}
