import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2 } from "lucide-react";

import { ActivityCard } from "@/components/engenharia/sent-history-by-project";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ActivityUser = {
  _id: Id<"users">;
  name: string;
  isActive: boolean;
};

const ALL_USERS = "all";

// Serviços registrados em campo numa obra (cadastro, instalação, manutenção
// e ações de campo), com filtro por técnico. Requer engenharia.read.
export function ProjectServicesList({
  projectId,
  activityUsers,
}: {
  projectId: Id<"projects">;
  activityUsers: ActivityUser[];
}) {
  const [selectedUser, setSelectedUser] = useState<string>(ALL_USERS);
  const { results, status, loadMore } = usePaginatedQuery(
    api.technicianActivity.listProjectActivity,
    {
      projectId,
      userId:
        selectedUser === ALL_USERS ? undefined : (selectedUser as Id<"users">),
    },
    { initialNumItems: 20 }
  );

  return (
    <div className="space-y-3">
      <Select
        value={selectedUser}
        onValueChange={(value) => setSelectedUser(value || ALL_USERS)}
      >
        <SelectTrigger className="sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_USERS}>Todos os técnicos</SelectItem>
          {activityUsers.map((user) => (
            <SelectItem key={user._id} value={user._id}>
              {user.isActive ? user.name : `${user.name} (inativo)`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {status === "LoadingFirstPage" ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando serviços...
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {selectedUser === ALL_USERS
            ? "Nenhum serviço registrado nesta obra."
            : "Este técnico não registrou serviços nesta obra."}
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((item) => (
            <ActivityCard key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      )}

      {status === "CanLoadMore" && (
        <Button variant="outline" className="w-full" onClick={() => loadMore(20)}>
          Carregar mais serviços
        </Button>
      )}
      {status === "LoadingMore" && (
        <Button variant="outline" className="w-full" disabled>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando...
        </Button>
      )}
    </div>
  );
}
