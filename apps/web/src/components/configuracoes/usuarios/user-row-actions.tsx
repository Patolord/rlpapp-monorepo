import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import { Loader2, Send, UserCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { inviteRedirectUrl, type User } from "@/components/configuracoes/usuarios/admin-user";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runWithToast } from "@/lib/errors";

export function IconAction({
  label,
  tooltip,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function ReactivateButton({ user }: { user: User }) {
  const reactivateUser = useMutation(api.users.reactivate);
  const [busy, setBusy] = useState(false);
  return (
    <IconAction
      label={`Reativar ${user.name}`}
      tooltip="Reativar"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await runWithToast(
          () => reactivateUser({ id: user._id }),
          "Usuário reativado",
          "Erro ao reativar usuário"
        );
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <UserCheck className="text-status-success" />}
    </IconAction>
  );
}

export function ResendInviteButton({ user }: { user: User }) {
  const resendInvite = useAction(api.userAdmin.adminResendInvite);
  const [busy, setBusy] = useState(false);
  return (
    <IconAction
      label={`Reenviar convite para ${user.name}`}
      tooltip="Reenviar convite"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await runWithToast(
          () => resendInvite({ id: user._id, redirectUrl: inviteRedirectUrl() }),
          `Convite reenviado para ${user.email}`,
          "Erro ao reenviar convite"
        );
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Send />}
    </IconAction>
  );
}
