import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { can } from "@rlpapp/shared/auth/permissions";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import {
  TakeoffQuoteDialog,
  type TakeoffQuoteTarget,
} from "@/components/compras/takeoff-quote-dialog";
import { TakeoffSourceBadge } from "@/components/compras/takeoff-source-badge";
import { DesktopBudgetView } from "@/components/engenharia/desktop-budget-view";
import {
  AddTakeoffItemCard,
  parseDimensions,
  type NewTakeoffLine,
} from "@/components/engenharia/orcamento/add-takeoff-item-card";
import { TakeoffItemsCard } from "@/components/engenharia/orcamento/takeoff-items-card";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { PermissionGate } from "@/components/role-area-gate";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/orcamento")({
  component: () => (
    <PermissionGate permissions={["suprimentos.read"]}>
      <OrcamentoPage />
    </PermissionGate>
  ),
});

function OrcamentoPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {() => <OrcamentoContent projectId={projectId as Id<"projects">} />}
      </ProjectShell>
    </AuthShell>
  );
}

function OrcamentoContent({ projectId }: { projectId: Id<"projects"> }) {
  const [now] = useState(() => Date.now());
  const currentUser = useQuery(api.users.getCurrentUser);
  const takeoffs = useQuery(api.takeoffs.list, { projectId });
  const createTakeoff = useMutation(api.takeoffs.create);
  const addItem = useMutation(api.takeoffs.addItem);

  const [activeTakeoffId, setActiveTakeoffId] = useState<Id<"takeoffs"> | null>(null);
  const takeoffDetail = useQuery(
    api.takeoffs.get,
    activeTakeoffId ? { takeoffId: activeTakeoffId, now } : "skip"
  );

  const [newLine, setNewLine] = useState<NewTakeoffLine>({
    rawDescription: "",
    quantity: "",
    unit: "",
    widthMm: "",
    heightMm: "",
    lengthMm: "",
    thicknessMm: "",
    diameterMm: "",
    customSpecification: "",
  });
  const newLineDimensions = parseDimensions(newLine);
  const [quoteTarget, setQuoteTarget] = useState<TakeoffQuoteTarget | null>(null);
  const suggestions = useQuery(
    api.materials.suggest,
    newLine.rawDescription.trim().length >= 2
      ? { term: newLine.rawDescription, limit: 5 }
      : "skip"
  );

  useEffect(() => {
    if (takeoffs && takeoffs.length > 0 && !activeTakeoffId) {
      setActiveTakeoffId(takeoffs[0]._id);
    }
  }, [takeoffs, activeTakeoffId]);

  async function ensureTakeoff(): Promise<Id<"takeoffs"> | null> {
    if (activeTakeoffId) return activeTakeoffId;
    try {
      const id = await createTakeoff({
        projectId,
        name: `Orçamento ${new Date().toLocaleDateString("pt-BR")}`,
      });
      setActiveTakeoffId(id);
      return id;
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar takeoff"));
      return null;
    }
  }

  async function handleAddLine(materialId?: Id<"materials">) {
    if (!newLine.rawDescription.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    const takeoffId = await ensureTakeoff();
    if (!takeoffId) return;

    try {
      await addItem({
        takeoffId,
        rawDescription: newLine.rawDescription,
        quantity: newLine.quantity ? Number.parseFloat(newLine.quantity) : undefined,
        unit: newLine.unit || undefined,
        materialId,
        customDimensions: newLineDimensions ?? undefined,
        customSpecification: newLine.customSpecification || undefined,
      });
      setNewLine({
        rawDescription: "",
        quantity: "",
        unit: "",
        widthMm: "",
        heightMm: "",
        lengthMm: "",
        thicknessMm: "",
        diameterMm: "",
        customSpecification: "",
      });
      toast.success("Item adicionado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao adicionar item"));
    }
  }

  // Cada ação segue a permissão da mutation que ela chama.
  const canPromoteMaterial = can(currentUser, "materiais.write");
  const canQuote = can(currentUser, "precos.write");
  const canEdit = can(currentUser, "orcamentos.write");
  // quem publica (orcamentos.write) também remove um orçamento do desktop
  const canRemoveDesktopBudget = can(currentUser, "orcamentos.write");
  const activeSummary = takeoffs?.find((t) => t._id === activeTakeoffId);
  // Orçamentos do desktop são editados lá e republicados: sem entrada manual.
  const isDesktop = activeSummary?.source === "desktop";
  const showSelector =
    !!takeoffs &&
    (takeoffs.length > 1 || takeoffs.some((t) => t.source === "desktop"));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Orçamento / Takeoff</h2>
          <p className="text-sm text-muted-foreground">
            Entrada livre — preços da Compras são opcionais e servem apenas como referência.
          </p>
        </div>
        {canEdit && (
        <Button
          variant="outline"
          onClick={async () => {
            const id = await createTakeoff({
              projectId,
              name: `Takeoff ${new Date().toLocaleDateString("pt-BR")}`,
            });
            setActiveTakeoffId(id);
            toast.success("Novo takeoff criado");
          }}
        >
          <Plus />
          Novo takeoff
        </Button>
        )}
      </div>

      {showSelector && (
        <div className="flex flex-wrap gap-2">
          {takeoffs.map((t) => (
            <div key={t._id} className="flex items-center gap-1">
              <Button
                size="sm"
                variant={activeTakeoffId === t._id ? "default" : "outline"}
                onClick={() => setActiveTakeoffId(t._id)}
              >
                {t.name} ({t.itemCount})
              </Button>
              <TakeoffSourceBadge takeoff={t} />
            </div>
          ))}
        </div>
      )}

      {isDesktop && takeoffDetail ? (
        <DesktopBudgetView
          detail={takeoffDetail}
          canPromoteMaterial={canPromoteMaterial}
          canQuote={canQuote}
          canEdit={canEdit}
          canRemove={canRemoveDesktopBudget}
          onQuote={setQuoteTarget}
          // o efeito acima escolhe o primeiro orçamento que sobrou
          onRemoved={() => setActiveTakeoffId(null)}
        />
      ) : null}

      {!isDesktop && (
        <>
          {canEdit && (
            <AddTakeoffItemCard
              newLine={newLine}
              setNewLine={setNewLine}
              newLineDimensions={newLineDimensions}
              suggestions={suggestions}
              onAddLine={handleAddLine}
            />
          )}

          <TakeoffItemsCard
            items={takeoffDetail?.items ?? []}
            canEdit={canEdit}
            canQuote={canQuote}
            canPromoteMaterial={canPromoteMaterial}
            onQuote={setQuoteTarget}
          />
        </>
      )}

      <TakeoffQuoteDialog
        item={quoteTarget}
        onOpenChange={(open) => {
          if (!open) setQuoteTarget(null);
        }}
      />
    </div>
  );
}
