import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel } from "@/lib/material-import";

type Rule = FunctionReturnType<typeof api.inventory.listRules>[number];
type Material = FunctionReturnType<
  typeof api.inventory.listMaterialOptions
>[number];

type RuleType = "forbidden_pair" | "attributes_must_match";

export function InventoryRules({
  rules,
  materials,
  canConfigure,
}: {
  rules: Rule[];
  materials: Material[];
  canConfigure: boolean;
}) {
  const createRule = useMutation(api.inventory.createRule);
  const setRuleActive = useMutation(api.inventory.setRuleActive);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RuleType>("forbidden_pair");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [materialAId, setMaterialAId] = useState("");
  const [materialBId, setMaterialBId] = useState("");
  const [categoryA, setCategoryA] = useState("");
  const [categoryB, setCategoryB] = useState("");
  const [attributeKey, setAttributeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setType("forbidden_pair");
    setName("");
    setMessage("");
    setMaterialAId("");
    setMaterialBId("");
    setCategoryA("");
    setCategoryB("");
    setAttributeKey("");
  }

  async function submit() {
    setSubmitting(true);
    try {
      await createRule({
        type,
        name,
        message,
        materialAId:
          type === "forbidden_pair" && materialAId
            ? (materialAId as Id<"materials">)
            : undefined,
        materialBId:
          type === "forbidden_pair" && materialBId
            ? (materialBId as Id<"materials">)
            : undefined,
        categoryA:
          type === "attributes_must_match" ? categoryA : undefined,
        categoryB:
          type === "attributes_must_match" ? categoryB : undefined,
        attributeKey:
          type === "attributes_must_match" ? attributeKey : undefined,
      });
      toast.success("Regra criada");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar regra"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(rule: Rule) {
    try {
      await setRuleActive({ ruleId: rule._id, active: !rule.active });
      toast.success(rule.active ? "Regra desativada" : "Regra ativada");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar regra"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Regras de compatibilidade</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Aplicadas quando o Estoque envia materiais para uma obra.
            </p>
          </div>
          {canConfigure && (
            <Dialog
              open={open}
              onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) reset();
              }}
            >
              <DialogTrigger
                render={
                  <Button>
                    <Plus className="mr-2 size-4" />
                    Nova regra
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova regra</DialogTitle>
                  <DialogDescription>
                    Pares proibidos sempre alertam. Atributos coincidentes
                    comparam valores como tensão entre duas categorias.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select
                      value={type}
                      onValueChange={(value) => setType(value as RuleType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="forbidden_pair">
                          Par proibido
                        </SelectItem>
                        <SelectItem value="attributes_must_match">
                          Atributo deve coincidir
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {type === "forbidden_pair" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Material A</Label>
                        <Select
                          value={materialAId}
                          onValueChange={setMaterialAId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {materials.map((material) => (
                              <SelectItem
                                key={material._id}
                                value={material._id}
                              >
                                {formatMaterialLabel(
                                  material.name,
                                  material.variantLabel
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Material B</Label>
                        <Select
                          value={materialBId}
                          onValueChange={setMaterialBId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {materials.map((material) => (
                              <SelectItem
                                key={material._id}
                                value={material._id}
                              >
                                {formatMaterialLabel(
                                  material.name,
                                  material.variantLabel
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Categoria A</Label>
                          <Input
                            value={categoryA}
                            onChange={(event) =>
                              setCategoryA(event.target.value)
                            }
                            placeholder="Ex.: Equipamento"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Categoria B</Label>
                          <Input
                            value={categoryB}
                            onChange={(event) =>
                              setCategoryB(event.target.value)
                            }
                            placeholder="Ex.: Cabo"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Atributo comparado</Label>
                        <Input
                          value={attributeKey}
                          onChange={(event) =>
                            setAttributeKey(event.target.value)
                          }
                          placeholder="Ex.: tensao"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label>Nome</Label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ex.: Tensão do equipamento e cabo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mensagem exibida</Label>
                    <Textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Os materiais possuem tensões incompatíveis."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => void submit()}
                    disabled={submitting}
                  >
                    {submitting ? "Salvando..." : "Criar regra"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma regra cadastrada.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule._id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <Badge variant={rule.active ? "default" : "secondary"}>
                      {rule.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rule.type === "forbidden_pair"
                      ? `${rule.materialAName ?? rule.categoryA} × ${rule.materialBName ?? rule.categoryB}`
                      : `${rule.categoryA} × ${rule.categoryB}: ${rule.attributeKey}`}
                  </p>
                  <p className="mt-1 text-sm">{rule.message}</p>
                </div>
                {canConfigure && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggle(rule)}
                  >
                    {rule.active ? "Desativar" : "Ativar"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
