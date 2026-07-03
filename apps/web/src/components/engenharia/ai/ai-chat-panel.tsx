import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  Bot,
  Check,
  ChevronLeft,
  Clock,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  Mic,
  MoreVertical,
  PanelRightClose,
  Paperclip,
  Pencil,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioRecorder } from "@/lib/use-audio-recorder";
import { cn } from "@/lib/utils";
import {
  describeIntent,
  type AiIntent,
} from "@/components/engenharia/ai/intents";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  intents?: AiIntent[];
};

type View = "chat" | "history";

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

  const createSession = useMutation(api.aiChat.createSession);
  const addMessageMut = useMutation(api.aiChat.addMessage);
  const updateTitle = useMutation(api.aiChat.updateSessionTitle);
  const deleteSessionMut = useMutation(api.aiChat.deleteSession);

  const sessions = useQuery(api.aiChat.listSessions, { projectId });

  const [activeSessionId, setActiveSessionId] =
    useState<Id<"aiChatSessions"> | null>(null);

  const storedMessages = useQuery(
    api.aiChat.getMessages,
    activeSessionId ? { sessionId: activeSessionId } : "skip"
  );

  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>(
    []
  );
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pendingIntents, setPendingIntents] = useState<AiIntent[] | null>(null);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [editingTitle, setEditingTitle] = useState<Id<"aiChatSessions"> | null>(
    null
  );
  const [titleDraft, setTitleDraft] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const optimisticBaseRef = useRef(0);
  const { recording, toggleRecording } = useAudioRecorder((file) =>
    setFiles((prev) => [...prev, file])
  );

  const messages: ChatMessage[] =
    storedMessages?.map((m) => ({
      role: m.role,
      text: m.text,
      intents: m.intents ? (JSON.parse(m.intents) as AiIntent[]) : undefined,
    })) ?? [];

  const catchUpCount = Math.max(0, messages.length - optimisticBaseRef.current);
  const visibleOptimistic = optimisticMessages.slice(catchUpCount);
  const allMessages = [...messages, ...visibleOptimistic];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length, sending]);

  async function ensureSession(): Promise<Id<"aiChatSessions">> {
    if (activeSessionId) return activeSessionId;
    const id = await createSession({ projectId });
    setActiveSessionId(id);
    return id;
  }

  async function handleNewChat() {
    setActiveSessionId(null);
    setOptimisticMessages([]);
    setPendingIntents(null);
    setInput("");
    setFiles([]);
    setView("chat");
  }

  async function handleSelectSession(id: Id<"aiChatSessions">) {
    setActiveSessionId(id);
    setOptimisticMessages([]);
    setPendingIntents(null);
    setView("chat");
  }

  async function handleSend() {
    if (!input.trim() && files.length === 0) return;
    if (sending) return;

    const currentInput = input.trim();
    const currentFiles = [...files];

    optimisticBaseRef.current = messages.length;
    setInput("");
    setFiles([]);
    setSending(true);
    setPendingIntents(null);

    const userText =
      currentInput +
      (currentFiles.length > 0
        ? `\n\n📎 ${currentFiles.map((f) => f.name).join(", ")}`
        : "");
    setOptimisticMessages((prev) => [...prev, { role: "user", text: userText }]);

    try {
      const sessionId = await ensureSession();

      await addMessageMut({
        sessionId,
        role: "user",
        text: userText,
      });

      // Auto-generate title from first user message
      const isFirst = messages.length === 0 && optimisticMessages.length <= 1;
      if (isFirst && currentInput) {
        const autoTitle =
          currentInput.length > 50
            ? currentInput.slice(0, 47) + "..."
            : currentInput;
        await updateTitle({ sessionId, title: autoTitle });
      }

      const uploaded: {
        storageId: Id<"_storage">;
        name: string;
        mimeType: string;
      }[] = [];
      for (const file of currentFiles) {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
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
        message: currentInput || undefined,
        context,
        files: uploaded.length > 0 ? uploaded : undefined,
      });

      const intents = result.intents as AiIntent[];
      const text = result.needsClarification
        ? `${result.reply}\n\n❓ ${result.needsClarification}`
        : result.reply;

      setOptimisticMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text,
          intents: intents.length ? intents : undefined,
        },
      ]);
      setPendingIntents(intents.length ? intents : null);

      await addMessageMut({
        sessionId,
        role: "assistant",
        text,
        intents: intents.length ? JSON.stringify(intents) : undefined,
      });

      // Flush optimistic messages once stored ones include ours
      setOptimisticMessages([]);
    } catch (error) {
      const errText =
        error instanceof Error
          ? error.message
          : "Não foi possível processar.";
      setOptimisticMessages((prev) => [
        ...prev,
        { role: "assistant", text: errText },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleApply() {
    if (!pendingIntents || pendingIntents.length === 0) return;
    optimisticBaseRef.current = messages.length;
    setApplying(true);
    try {
      const result = await applyIntents({
        projectId,
        intents: pendingIntents,
      });
      const summaryText = result.summary.join("\n");
      const confirmText =
        result.applied > 0
          ? `Pronto! ${result.applied} alteração(ões) aplicada(s).\n\n${summaryText}`
          : `Nenhuma alteração foi aplicada.\n\n${summaryText}`;
      setOptimisticMessages((prev) => [
        ...prev,
        { role: "assistant", text: confirmText },
      ]);
      if (activeSessionId) {
        await addMessageMut({
          sessionId: activeSessionId,
          role: "assistant",
          text: confirmText,
        });
      }
      setOptimisticMessages([]);
      setPendingIntents(null);
    } catch (error) {
      const errText =
        error instanceof Error
          ? error.message
          : "Não foi possível aplicar as alterações.";
      setOptimisticMessages((prev) => [
        ...prev,
        { role: "assistant", text: errText },
      ]);
    } finally {
      setApplying(false);
    }
  }

  async function handleDeleteSession(id: Id<"aiChatSessions">) {
    await deleteSessionMut({ sessionId: id });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setOptimisticMessages([]);
      setPendingIntents(null);
    }
  }

  function startEditTitle(id: Id<"aiChatSessions">, currentTitle: string) {
    setEditingTitle(id);
    setTitleDraft(currentTitle);
  }

  async function saveTitle(id: Id<"aiChatSessions">) {
    if (titleDraft.trim()) {
      await updateTitle({ sessionId: id, title: titleDraft.trim() });
    }
    setEditingTitle(null);
  }

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-xl sm:max-w-md">
      {/* Header */}
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
                onClick={handleNewChat}
                title="Nova conversa"
              >
                <MessageSquarePlus className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("history")}
                title="Histórico"
              >
                <Clock className="size-4" />
              </Button>
            </>
          )}
          {view === "history" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView("chat")}
              title="Voltar ao chat"
            >
              <ChevronLeft className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Ocultar assistente"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {view === "history" ? (
        <div className="flex-1 overflow-y-auto">
          {!sessions || sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
              <Clock className="size-9 opacity-40" />
              <p className="max-w-xs text-sm">
                Nenhuma conversa salva ainda.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => (
                <div
                  key={s._id}
                  className={cn(
                    "group flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/50",
                    activeSessionId === s._id && "bg-muted/50"
                  )}
                >
                  {editingTitle === s._id ? (
                    <div className="flex flex-1 items-center gap-1">
                      <input
                        className="flex-1 rounded border bg-background px-2 py-1 text-sm"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveTitle(s._id);
                          if (e.key === "Escape") setEditingTitle(null);
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => void saveTitle(s._id)}
                      >
                        <Check className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex flex-1 flex-col items-start gap-0.5 text-left"
                        onClick={() => void handleSelectSession(s._id)}
                      >
                        <span className="line-clamp-1 text-sm font-medium">
                          {s.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100"
                            >
                              <MoreVertical className="size-3.5" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => startEditTitle(s._id, s.title)}
                          >
                            <Pencil className="mr-2 size-4" />
                            Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => void handleDeleteSession(s._id)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Chat messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {allMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
                <Bot className="size-9" />
                <p className="max-w-xs text-xs">
                  Ex: "Crie a Torre A com 12 andares", "Adicione um Split na
                  sala do 3º andar", "Defina o cliente como Construtora XYZ".
                  Anexe planilhas, PDFs, Word ou áudio.
                </p>
              </div>
            ) : (
              allMessages.map((m, i) => <ChatBubble key={i} message={m} />)
            )}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Analisando...
              </div>
            )}
          </div>

          {/* Intent preview */}
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
                        <span className="text-muted-foreground">
                          {" "}
                          — {d.detail}
                        </span>
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

          {/* Input bar */}
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
                    setFiles((prev) => [
                      ...prev,
                      ...Array.from(e.target.files!),
                    ]);
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
        </>
      )}
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
