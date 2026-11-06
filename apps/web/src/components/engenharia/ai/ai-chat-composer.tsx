import { useRef, type Dispatch, type SetStateAction } from "react";
import { Check, ListChecks, Loader2, Mic, Paperclip, Send, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  describeIntent,
  type AiIntent,
} from "@/components/engenharia/ai/intents";

/** Ações propostas pela IA, aguardando confirmação antes de salvar. */
export function PendingIntentsPreview({
  pendingIntents,
  applying,
  onDiscard,
  onApply,
}: {
  pendingIntents: AiIntent[];
  applying: boolean;
  onDiscard: () => void;
  onApply: () => void;
}) {
  return (
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
            onClick={onDiscard}
          >
            <X />
            Descartar
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}
            Confirmar
          </Button>
        </div>
      </div>
  );
}

/** Barra de digitação com anexos e gravação de áudio. */
export function ChatInputBar({
  input,
  setInput,
  files,
  setFiles,
  sending,
  onSend,
  recording,
  toggleRecording,
}: {
  input: string;
  setInput: (input: string) => void;
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  sending: boolean;
  onSend: () => Promise<void>;
  recording: boolean;
  toggleRecording: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
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
          <Paperclip />
        </Button>
        <Button
          variant={recording ? "destructive" : "ghost"}
          size="icon"
          onClick={toggleRecording}
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
        >
          {recording ? (
            <Square />
          ) : (
            <Mic />
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
              void onSend();
            }
          }}
        />
        <Button
          size="icon"
          onClick={onSend}
          disabled={sending || (!input.trim() && files.length === 0)}
          aria-label="Enviar"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}
