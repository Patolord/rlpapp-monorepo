import { api } from "@rlpapp/backend/convex/_generated/api";
import { Loader2 } from "lucide-react";

import { ObraLinkRow } from "@/components/campo/obra-link-row";
import { fieldCacheKeys } from "@/lib/field-cache";
import { useOfflineQuery } from "@/lib/use-offline-query";

export function MyObrasList() {
  const { data: projects, fromCache, cacheChecked } = useOfflineQuery(
    fieldCacheKeys.myProjects,
    api.technicianPortal.listMyProjects
  );

  if (projects === undefined) {
    if (!cacheChecked) return null;
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Carregando suas obras...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma obra atribuída a você. Peça à engenharia para liberar o acesso.
        Enquanto isso, procure a obra em "Estou em outra obra".
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {fromCache && (
        <p className="text-xs text-muted-foreground">
          Lista salva neste aparelho — pode estar desatualizada.
        </p>
      )}
      {projects.map((project) => (
        <ObraLinkRow key={project._id} project={project} />
      ))}
    </div>
  );
}
