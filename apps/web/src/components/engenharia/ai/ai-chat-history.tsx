import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Check, Clock, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ChatSession = FunctionReturnType<typeof api.aiChat.listSessions>[number];
type SessionId = Id<"aiChatSessions">;

/** Lista de conversas anteriores, com renomear e excluir. */
export function AiChatHistory({
  sessions,
  activeSessionId,
  editingTitle,
  titleDraft,
  onTitleDraftChange,
  onCancelEdit,
  onStartEdit,
  onSaveTitle,
  onSelect,
  onDelete,
}: {
  sessions: ChatSession[] | undefined;
  activeSessionId: SessionId | null;
  editingTitle: SessionId | null;
  titleDraft: string;
  onTitleDraftChange: (title: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (id: SessionId, currentTitle: string) => void;
  onSaveTitle: (id: SessionId) => Promise<void>;
  onSelect: (id: SessionId) => Promise<void>;
  onDelete: (id: SessionId) => Promise<void>;
}) {
  return (
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
                    onChange={(e) => onTitleDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSaveTitle(s._id);
                      if (e.key === "Escape") onCancelEdit();
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void onSaveTitle(s._id)}
                  >
                    <Check />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start gap-0.5 text-left"
                    onClick={() => void onSelect(s._id)}
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
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onStartEdit(s._id, s.title)}
                      >
                        <Pencil className="mr-2 size-4" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => void onDelete(s._id)}
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
  );
}
