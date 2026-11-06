import { Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";

/** Mensagem de uma conversa com a IA: do usuário (à direita) ou do assistente. */
export function ChatBubble({
  message,
}: {
  message: { role: "user" | "assistant"; text: string };
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.text}
      </div>
    </div>
  );
}
