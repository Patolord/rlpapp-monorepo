import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Bot,
  Check,
  ListChecks,
  Loader2,
  Mic,
  PanelRightClose,
  Paperclip,
  Send,
  Sparkles,
  Square,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/lib/use-audio-recorder";
import { runWithToast } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  describeIntent,
  type AiIntent,
} from "@/components/engenharia/ai/intents";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; intents?: AiIntent[] };

export function AiChatPanel({
  projectId,
  context,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  context?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const interpret = useAction(api.ai.interpret);
  const applyIntents = useMutation(api.aiIntents.applyIntents);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pendingIntents, setPendingIntents] = useState<AiIntent[] | null>(null);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { recording, toggleRecording } = useAudioRecorder((file) =>
    setFiles((prev) => [...prev, file])
  );

  async function handleSend() {
    if (!input.trim() && files.length === 0) return;
    setSending(true);
    setPendingIntents(null);

    const userText =
      input.trim() +
      (files.length > 0 ? `\n\n📎 ${files.map((f) => f.name).join(", ")}` : "");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);

    try {
      const uploaded: {
        storageId: Id<"_storage">;
        name: string;
        mimeType: string;
      }[] = [];
      for (const file of files) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        uploaded.push({
          storageId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
        });
      }

      const result = await interpret({
        projectId,
        message: input.trim() || undefined,
        context,
        files: uploaded.length > 0 ? uploaded : undefined,
      });

      const intents = result.intents as AiIntent[];
      const text = result.needsClarification
        ? `${result.reply}\n\n❓ ${result.needsClarification}`
        : result.reply;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text, intents: intents.length ? intents : undefined },
      ]);
      setPendingIntents(intents.length ? intents : null);
      setInput("");
      setFiles([]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Não foi possível processar.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleApply() {
    if (!pendingIntents || pendingIntents.length === 0) return;
    setApplying(true);
    const ok = await runWithToast(
      () => applyIntents({ projectId, intents: pendingIntents }),
      "Alterações aplicadas",
      "Não foi possível aplicar as alterações"
    );
    setApplying(false);
    if (ok) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Pronto! As alterações foram salvas." },
      ]);
      setPendingIntents(null);
    }
  }

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-xl sm:max-w-md">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-primary" />
            Assistente IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Peça em linguagem natural. A IA propõe e você confirma antes de
            salvar.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Ocultar assistente"
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
              <Bot className="size-9" />
              <p className="max-w-xs text-xs">
                Ex: "Crie a Torre A com 12 andares", "Adicione um Split na sala
                do 3º andar", "Defina o cliente como Construtora XYZ". Anexe
                planilhas, PDFs, Word ou áudio.
              </p>
            </div>
          ) : (
            messages.map((m, i) => <ChatBubble key={i} message={m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Analisando...
            </div>
          )}
        </div>

        {pendingIntents && pendingIntents.length > 0 && (
          <div className="border-t bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <ListChecks className="size-3.5" />
              {pendingIntents.length} ação(ões) propostas
            </p>
            <div className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
              {pendingIntents.map((intent, i) => {
                const d = describeIntent(intent);
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <span className="font-medium">{d.title}</span>
                      <span className="text-muted-foreground"> — {d.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setPendingIntents(null)}
              >
                <X className="mr-1 size-4" />
                Descartar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Check className="mr-1 size-4" />
                )}
                Confirmar
              </Button>
            </div>
          </div>
        )}

        <div className="border-t p-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept=".xlsx,.xls,.csv,.docx,.pdf,.txt,audio/*"
              onChange={(e) => {
                if (e.target.files) {
                  setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = "";
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Anexar arquivo"
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              variant={recording ? "destructive" : "ghost"}
              size="icon"
              onClick={toggleRecording}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
            >
              {recording ? (
                <Square className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Peça algo à IA..."
              rows={1}
              className="min-h-10 flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || (!input.trim() && files.length === 0)}
              aria-label="Enviar"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
    </aside>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
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
