import {
  ChevronLeft,
  Clock,
  MessageSquarePlus,
  PanelRightClose,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export type View = "chat" | "history";

export function AiChatHeader({
  view,
  onViewChange,
  onNewChat,
  onClose,
}: {
  view: View;
  onViewChange: (view: View) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b p-4">
      <div className="flex-1 space-y-1">
        {view === "history" ? (
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock className="size-4 text-primary" />
            Histórico
          </h2>
        ) : (
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-primary" />
            Assistente IA
          </h2>
        )}
        <p className="text-sm text-muted-foreground">
          {view === "history"
            ? "Conversas anteriores com a IA."
            : "Peça em linguagem natural. A IA propõe e você confirma antes de salvar."}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {view === "chat" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              title="Nova conversa"
            >
              <MessageSquarePlus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewChange("history")}
              title="Histórico"
            >
              <Clock />
            </Button>
          </>
        )}
        {view === "history" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewChange("chat")}
            title="Voltar ao chat"
          >
            <ChevronLeft />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Ocultar assistente"
        >
          <PanelRightClose />
        </Button>
      </div>
    </div>
  );
}
