import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectOption = { _id: Id<"projects">; name: string };

export function BatchesWithoutProjectCard() {
  const batches = useQuery(api.qrCodes.listBatchesWithoutProject, {});
  const projects = useQuery(api.projects.list, {});

  if (!batches || batches.length === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Lotes sem obra
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Etiquetas destes lotes não aparecem em nenhuma obra, nem mesmo as já
          cadastradas em campo. Defina a obra de cada lote para corrigir.
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {batches.map((batch) => (
          <BatchRow key={batch.batchId} batch={batch} projects={projects ?? []} />
        ))}
      </CardContent>
    </Card>
  );
}

function BatchRow({
  batch,
  projects,
}: {
  batch: {
    batchId: string;
    batchName: string | null;
    createdAt: number;
    total: number;
    registered: number;
    sampleTokens: string[];
  };
  projects: ProjectOption[];
}) {
  const setBatchProject = useMutation(api.qrCodes.setBatchProject);
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!projectId) return;
    const project = projects.find((p) => p._id === projectId);
    setSaving(true);
    try {
      const result = await setBatchProject({
        batchId: batch.batchId,
        projectId: projectId as Id<"projects">,
      });
      toast.success(
        `Lote vinculado a ${project?.name ?? "obra"} (${result.updated} etiqueta(s))`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao definir a obra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {batch.batchName ?? batch.batchId}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {batch.total} etiqueta{batch.total === 1 ? "" : "s"} ·{" "}
          <span className={batch.registered > 0 ? "font-medium text-amber-700" : ""}>
            {batch.registered} cadastrada{batch.registered === 1 ? "" : "s"} em campo
          </span>{" "}
          · {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {batch.sampleTokens.join(", ")}
          {batch.total > batch.sampleTokens.length ? ", …" : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full lg:w-56">
            <SelectValue placeholder="Selecione a obra" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={!projectId || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Definir obra
        </Button>
      </div>
    </div>
  );
}
