import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, CopyPlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runWithToast } from "@/lib/errors";
import type {
  HierarchyFloor,
  ProjectHierarchy,
} from "@/components/engenharia/building-panel/hierarchy";

/**
 * Renumera o nome de uma unidade ao mudar de andar: números que começam com o
 * número do andar de origem e têm dígitos a mais (ex: "201" no andar 2) trocam
 * o prefixo pelo número do andar de destino ("301" no andar 3). Nomes sem
 * número embutido ("Cobertura", "Final 1") ficam iguais.
 */
export function renumberUnitName(
  name: string,
  sourceFloorNumber: number,
  targetFloorNumber: number
): string {
  const src = String(sourceFloorNumber);
  const tgt = String(targetFloorNumber);
  if (sourceFloorNumber === targetFloorNumber) return name;
  return name.replace(/\d+/g, (token) =>
    token.length > src.length && token.startsWith(src)
      ? tgt + token.slice(src.length)
      : token
  );
}

/**
 * Diálogo "Replicar andar": copia os ambientes, sistemas e equipamentos
 * planejados de um andar típico para outros andares vazios da torre, com
 * preview editável dos nomes renumerados (201 → 301 etc.).
 */
export function ReplicateFloorDialog({
  projectId,
  sourceFloorId,
  onClose,
}: {
  projectId: Id<"projects">;
  sourceFloorId: Id<"floors"> | null;
  onClose: () => void;
}) {
  const replicate = useMutation(api.floors.replicate);
  // Mesma query reativa da matriz (compartilha o cache do Convex).
  const hierarchy = useQuery(
    api.projects.getHierarchy,
    sourceFloorId ? { projectId } : "skip"
  ) as ProjectHierarchy | null | undefined;

  const { tower, sourceFloor } = useMemo(() => {
    if (!hierarchy || !sourceFloorId)
      return { tower: null, sourceFloor: null };
    for (const t of hierarchy.towers) {
      const floor = t.floors.find((f) => f._id === sourceFloorId);
      if (floor) return { tower: t, sourceFloor: floor };
    }
    return { tower: null, sourceFloor: null };
  }, [hierarchy, sourceFloorId]);

  const [selectedFloorIds, setSelectedFloorIds] = useState<Set<string>>(
    () => new Set()
  );
  // Nomes editados manualmente: `${floorId}:${envId}` → nome.
  const [nameOverrides, setNameOverrides] = useState<Map<string, string>>(
    () => new Map()
  );
  const [expandedFloorIds, setExpandedFloorIds] = useState<Set<string>>(
    () => new Set()
  );
  const [saving, setSaving] = useState(false);

  // Zera o estado ao abrir para outro andar.
  useEffect(() => {
    setSelectedFloorIds(new Set());
    setNameOverrides(new Map());
    setExpandedFloorIds(new Set());
  }, [sourceFloorId]);

  const sourceEnvs = useMemo(
    () =>
      (sourceFloor?.environments ?? [])
        .slice()
        .sort((a, b) => a.order - b.order),
    [sourceFloor]
  );
  const equipmentCount = sourceEnvs.reduce(
    (sum, env) => sum + env.equipment.length,
    0
  );

  const candidateFloors = useMemo(() => {
    if (!tower || !sourceFloor) return [];
    return tower.floors
      .filter((f) => f._id !== sourceFloor._id)
      .sort((a, b) => b.number - a.number)
      .map((floor) => ({
        floor,
        empty: floor.environments.length === 0,
      }));
  }, [tower, sourceFloor]);

  const selectedFloors = candidateFloors.filter(
    (c) => c.empty && selectedFloorIds.has(c.floor._id)
  );

  function previewName(floor: HierarchyFloor, envId: string, envName: string) {
    const override = nameOverrides.get(`${floor._id}:${envId}`);
    if (override !== undefined) return override;
    return renumberUnitName(
      envName,
      sourceFloor?.number ?? 0,
      floor.number
    );
  }

  function toggleFloor(floorId: string) {
    setSelectedFloorIds((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!sourceFloor || selectedFloors.length === 0 || saving) return;
    setSaving(true);
    const renames = selectedFloors.flatMap(({ floor }) =>
      sourceEnvs.map((env) => ({
        sourceEnvironmentId: env._id,
        targetFloorId: floor._id as Id<"floors">,
        name: previewName(floor, env._id, env.name).trim() || env.name,
      }))
    );
    const ok = await runWithToast(
      () =>
        replicate({
          sourceFloorId: sourceFloor._id,
          targetFloorIds: selectedFloors.map(
            ({ floor }) => floor._id as Id<"floors">
          ),
          renames,
        }),
      `Andar replicado para ${selectedFloors.length} andar${selectedFloors.length === 1 ? "" : "es"}`,
      "Não foi possível replicar o andar"
    );
    setSaving(false);
    if (ok) onClose();
  }

  const open = sourceFloorId !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Replicar andar</DialogTitle>
          <DialogDescription>
            {sourceFloor
              ? `Copia os ${sourceEnvs.length} ambiente${sourceEnvs.length === 1 ? "" : "s"} e ${equipmentCount} equipamento${equipmentCount === 1 ? "" : "s"} de "${sourceFloor.label}" para os andares selecionados. Cada andar recebe novos sistemas (um sistema por unidade).`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {candidateFloors.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Esta torre não tem outros andares. Adicione os andares antes de
              replicar.
            </p>
          )}
          {candidateFloors.map(({ floor, empty }) => {
            const selected = empty && selectedFloorIds.has(floor._id);
            const expanded = expandedFloorIds.has(floor._id);
            return (
              <div
                key={floor._id}
                className={cn(
                  "rounded-md border",
                  selected && "border-primary/60 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    id={`replicate-${floor._id}`}
                    checked={selected}
                    disabled={!empty}
                    onCheckedChange={() => toggleFloor(floor._id)}
                  />
                  <label
                    htmlFor={`replicate-${floor._id}`}
                    className={cn(
                      "flex-1 cursor-pointer text-sm font-medium",
                      !empty && "cursor-not-allowed text-muted-foreground"
                    )}
                  >
                    {floor.label}
                    {!empty && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        já tem ambientes
                      </span>
                    )}
                  </label>
                  {selected && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFloorIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(floor._id)) next.delete(floor._id);
                          else next.add(floor._id);
                          return next;
                        })
                      }
                      className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 transition-transform",
                          expanded && "rotate-90"
                        )}
                      />
                      Nomes
                    </button>
                  )}
                </div>

                {/* Preview editável dos nomes renumerados. */}
                {selected && (
                  <div className="space-y-1 border-t px-3 py-2">
                    {expanded ? (
                      sourceEnvs.map((env) => (
                        <div
                          key={env._id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="w-24 shrink-0 truncate text-muted-foreground">
                            {env.name}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            →
                          </span>
                          <Input
                            className="h-7 flex-1 text-xs"
                            value={previewName(floor, env._id, env.name)}
                            onChange={(e) =>
                              setNameOverrides((prev) => {
                                const next = new Map(prev);
                                next.set(
                                  `${floor._id}:${env._id}`,
                                  e.target.value
                                );
                                return next;
                              })
                            }
                          />
                        </div>
                      ))
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        {sourceEnvs
                          .map((env) => previewName(floor, env._id, env.name))
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || selectedFloors.length === 0}
            onClick={() => void handleSubmit()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CopyPlus className="mr-1.5 size-4" />
            )}
            Replicar para {selectedFloors.length} andar
            {selectedFloors.length === 1 ? "" : "es"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
