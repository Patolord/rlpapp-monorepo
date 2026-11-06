import { Link } from "@tanstack/react-router";
import { Loader2, Printer, Trash2 } from "lucide-react";
import type { EquipmentStatusKey } from "@rlpapp/ui/tokens";

import type { QrRow } from "@/components/engenharia/qr-codes/qr-code-rows";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Tabela de etiquetas da obra (já filtradas), com seleção e ações por linha. */
export function QrCodesTable({
  rows,
  selected,
  allFilteredSelected,
  deletingToken,
  onToggleAll,
  onToggle,
  onPrint,
  onDelete,
}: {
  rows: QrRow[];
  selected: Set<string>;
  allFilteredSelected: boolean;
  deletingToken: string | null;
  onToggleAll: () => void;
  onToggle: (token: string) => void;
  onPrint: (tokens: string[], title: string) => void;
  onDelete: (row: QrRow) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={
                    allFilteredSelected
                      ? "Desmarcar etiquetas listadas"
                      : "Selecionar etiquetas listadas"
                  }
                  checked={allFilteredSelected}
                  disabled={rows.length === 0}
                  onCheckedChange={onToggleAll}
                />
              </TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Nenhum QR corresponde aos filtros.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r._id}
                  data-state={selected.has(r.token) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Selecionar etiqueta ${r.token}`}
                      checked={selected.has(r.token)}
                      onCheckedChange={() => onToggle(r.token)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/engenharia/qr/$token"
                      params={{ token: r.token }}
                      className="font-mono font-medium text-primary hover:underline"
                    >
                      {r.token}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <LocationCell
                      towerName={r.towerName}
                      floorLabel={r.floorLabel}
                      environmentName={r.environmentName}
                      ambiente={r.ambiente}
                    />
                  </TableCell>
                  <TableCell>
                    <EquipmentCell row={r} />
                  </TableCell>
                  <TableCell>
                    {r.status ? (
                      <StatusBadge
                        status={r.status as EquipmentStatusKey}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.batchName ?? r.batchId ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Imprimir etiqueta"
                        aria-label={`Imprimir etiqueta ${r.token}`}
                        onClick={() =>
                          onPrint([r.token], `Código QR ${r.token}`)
                        }
                      >
                        <Printer />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={!!r.equipmentId || deletingToken === r.token}
                        title={
                          r.equipmentId
                            ? "Etiqueta cadastrada em campo não pode ser excluída"
                            : "Excluir etiqueta"
                        }
                        aria-label={`Excluir etiqueta ${r.token}`}
                        onClick={() => onDelete(r)}
                      >
                        {deletingToken === r.token ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EquipmentCell({ row }: { row: QrRow }) {
  if (row.plannedItemId) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.system ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[row.modelo, row.capacidade].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {row.kind && (
          <Badge variant="outline" className="shrink-0">
            {row.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
          </Badge>
        )}
      </div>
    );
  }
  // Cadastrada em campo sem item planejado: a descrição do técnico é o nome.
  if (row.equipmentId) {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium">
          {row.description || "Cadastrado em campo"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Sem item planejado
        </p>
      </div>
    );
  }
  return <span className="text-muted-foreground">Etiqueta livre</span>;
}

function LocationCell({
  towerName,
  floorLabel,
  environmentName,
  ambiente,
}: {
  towerName: string | null;
  floorLabel: string | null;
  environmentName: string | null;
  ambiente: string | null;
}) {
  const parts = [towerName, floorLabel, environmentName].filter(
    (p): p is string => Boolean(p)
  );
  if (parts.length > 0) {
    return <span>{parts.join(" · ")}</span>;
  }
  // Itens legados sem hierarquia: mostra o texto livre do ambiente.
  if (ambiente) {
    return <span className="text-muted-foreground">{ambiente}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}
