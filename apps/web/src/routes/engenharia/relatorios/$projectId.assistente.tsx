import { useRef, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import {
  Bot,
  Check,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/assistente"
)({
  component: () => (
    <AuthShell>
      <AssistantPage />
    </AuthShell>
  ),
});

function AssistantPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId}>
      {(project) => <AssistantContent project={project} />}
    </ProjectShell>
  );
}

type ProposalEquipment = {
  system: string;
  ambiente: string;
  kind: "condensadora" | "evaporadora";
  modelo?: string;
  capacidade?: string;
  obs?: string;
};
type ProposalUnit = {
  floor: number;
  final: number;
  label?: string;
  type: "vrf" | "split";
  floorSpan?: number;
  deadline?: number;
  equipment: ProposalEquipment[];
};
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

function AssistantContent({ project }: { project: ProjectOverview }) {
  const propose = useAction(api.ai.proposeLayout);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const bulkCreate = useMutation(api.projectEquipment.bulkCreate);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [proposal, setProposal] = useState<ProposalUnit[] | null>(null);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { recording, toggleRecording } = useAudioRecorder((file) =>
    setFiles((prev) => [...prev, file])
  );

  async function handleSend() {
    if (!input.trim() && files.length === 0) return;
    setSending(true);

    const userText =
      input.trim() +
      (files.length > 0
        ? `\n\n📎 ${files.map((f) => f.name).join(", ")}`
        : "");
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

      const result = await propose({
        projectId: project._id,
        message: input.trim() || undefined,
        floorsContext: project.floors.map((f) => ({
          number: f.number,
          label: f.label,
        })),
        files: uploaded.length > 0 ? uploaded : undefined,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.reply },
      ]);
      setProposal(result.units);
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

  async function handleApprove() {
    if (!proposal || proposal.length === 0) return;
    setApproving(true);
    const ok = await runWithToast(
      () =>
        bulkCreate({
          projectId: project._id,
          units: proposal.map((u) => ({
            floor: u.floor,
            final: u.final,
            label: u.label,
            type: u.type,
            floorSpan: u.floorSpan,
            deadline: u.deadline,
            equipment: u.equipment.map((e) => ({
              system: e.system,
              ambiente: e.ambiente,
              kind: e.kind,
              modelo: e.modelo,
              capacidade: e.capacidade,
              obs: e.obs,
            })),
          })),
        }),
      "Apartamentos criados a partir da proposta",
      "Não foi possível salvar a proposta"
    );
    setApproving(false);
    if (ok) {
      setProposal(null);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Pronto! Os dados foram salvos na obra." },
      ]);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-h-112 flex-col rounded-lg border">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <Bot className="size-10" />
              <p className="max-w-xs text-sm">
                Descreva os apartamentos, cole uma tabela ou anexe um Excel,
                Word, PDF ou áudio. A IA monta a proposta e você aprova antes de
                salvar.
              </p>
            </div>
          ) : (
            messages.map((m, i) => <ChatBubble key={i} message={m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Analisando...
            </div>
          )}
        </div>

        <div className="border-t p-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs"
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
          <div className="flex items-end gap-2">
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
              placeholder="Ex: 2º ao 12º andar, finais 1 a 5..."
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
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Proposta</h2>
        {proposal === null ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            A proposta da IA aparece aqui para você revisar e editar antes de
            salvar.
          </p>
        ) : proposal.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            A IA não identificou apartamentos. Tente dar mais detalhes.
          </p>
        ) : (
          <>
            <div className="max-h-112 space-y-3 overflow-y-auto">
              {proposal.map((unit, ui) => (
                <ProposalUnitCard
                  key={ui}
                  unit={unit}
                  onChange={(patch) =>
                    setProposal((prev) =>
                      prev!.map((u, i) => (i === ui ? { ...u, ...patch } : u))
                    )
                  }
                  onRemove={() =>
                    setProposal((prev) =>
                      prev!.filter((_, i) => i !== ui)
                    )
                  }
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setProposal(null)}
              >
                <X className="mr-1.5 size-4" />
                Descartar
              </Button>
              <Button
                className="flex-1"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 size-4" />
                )}
                Aprovar e salvar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function ProposalUnitCard({
  unit,
  onChange,
  onRemove,
}: {
  unit: ProposalUnit;
  onChange: (patch: Partial<ProposalUnit>) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-24"
            value={unit.label ?? ""}
            placeholder="Apto"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <Select
            value={unit.type}
            onValueChange={(v) => onChange({ type: v as "vrf" | "split" })}
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vrf">VRF</SelectItem>
              <SelectItem value="split">Split</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Andar {unit.floor} · Final {unit.final}
          </span>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remover apartamento"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {unit.equipment.map((e, ei) => (
            <div
              key={ei}
              className="flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 p-1.5 text-xs"
            >
              <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                {e.system}
              </span>
              <span className="text-muted-foreground">
                {e.kind === "condensadora" ? "Cond." : "Evap."}
              </span>
              <span>{e.ambiente}</span>
              {(e.modelo || e.capacidade) && (
                <span className="text-muted-foreground">
                  · {[e.modelo, e.capacidade].filter(Boolean).join(" ")}
                </span>
              )}
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                aria-label="Remover item"
                onClick={() =>
                  onChange({
                    equipment: unit.equipment.filter((_, i) => i !== ei),
                  })
                }
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {unit.equipment.length} equipamento
          {unit.equipment.length === 1 ? "" : "s"}
        </p>
      </CardContent>
    </Card>
  );
}

function useAudioRecorder(onComplete: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `gravacao-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        onComplete(file);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  return { recording, toggleRecording };
}
