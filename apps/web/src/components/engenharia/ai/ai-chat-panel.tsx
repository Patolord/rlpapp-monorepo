import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Bot, Loader2 } from "lucide-react";

import { ChatBubble } from "@/components/engenharia/ai/chat-bubble";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import type { AiIntent } from "@/components/engenharia/ai/intents";

import { ChatInputBar, PendingIntentsPreview } from "./ai-chat-composer";
import { AiChatHeader, type View } from "./ai-chat-header";
import { AiChatHistory } from "./ai-chat-history";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  intents?: AiIntent[];
};

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
      <AiChatHeader
        view={view}
        onViewChange={setView}
        onNewChat={handleNewChat}
        onClose={() => onOpenChange(false)}
      />

      {/* Content */}
      {view === "history" ? (
        <AiChatHistory
          sessions={sessions}
          activeSessionId={activeSessionId}
          editingTitle={editingTitle}
          titleDraft={titleDraft}
          onTitleDraftChange={setTitleDraft}
          onCancelEdit={() => setEditingTitle(null)}
          onStartEdit={startEditTitle}
          onSaveTitle={saveTitle}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
        />
      ) : (
        <>
          {/* Chat messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {allMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
                <Bot className="size-9" />
                <p className="max-w-xs text-xs">
                  Ex: "Crie a Torre A com 12 andares", "Crie o sistema VRF 3
                  com condensadora e evaporadoras", "Deixe o hall do térreo
                  com 2 colunas de largura", "Vincule os QRs do lote Lorena
                  aos equipamentos". Anexe planilhas, PDFs, Word ou áudio.
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
            <PendingIntentsPreview
              pendingIntents={pendingIntents}
              applying={applying}
              onDiscard={() => setPendingIntents(null)}
              onApply={handleApply}
            />
          )}

          {/* Input bar */}
          <ChatInputBar
            input={input}
            setInput={setInput}
            files={files}
            setFiles={setFiles}
            sending={sending}
            onSend={handleSend}
            recording={recording}
            toggleRecording={toggleRecording}
          />
        </>
      )}
    </aside>
  );
}
