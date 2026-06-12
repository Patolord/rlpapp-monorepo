import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { Plus, Minus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AuthShell } from "@/components/auth-shell";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@rlpapp/shared";

export const Route = createFileRoute("/estoque/ajustes")({
  component: AjustesPage,
});

function AjustesPage() {
  return (
    <AuthShell>
      <AjustesContent />
    </AuthShell>
  );
}

function AjustesContent() {
  const products = useQuery(api.products.list, { onlyActive: true });
  const stock = useQuery(api.inventory.getStock);
  const adjustEvents = useQuery(api.inventory.listEvents, {
    type: "InventoryAdjust",
    limit: 50,
  });

  const adjustInventory = useMutation(api.inventory.adjustInventory);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    adjustmentType: "add" as "add" | "remove",
    quantity: 1,
    reason: "",
  });

  const resetForm = () => {
    setAdjustForm({
      productId: "",
      adjustmentType: "add",
      quantity: 1,
      reason: "",
    });
  };

  const handleAdjust = async () => {
    if (!adjustForm.productId || !adjustForm.reason) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const qtyDelta =
        adjustForm.adjustmentType === "add"
          ? adjustForm.quantity
          : -adjustForm.quantity;

      await adjustInventory({
        productId: adjustForm.productId as Id<"products">,
        qtyDelta,
        reason: adjustForm.reason,
      });

      toast.success("Ajuste realizado com sucesso");
      setIsAdjustOpen(false);
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao realizar ajuste"));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ajustes de Inventário</h1>
          <p className="text-muted-foreground">
            Realize ajustes manuais no estoque (inventário, perdas, correções)
          </p>
        </div>
        <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Settings className="h-4 w-4 mr-2" />
              Novo Ajuste
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajuste de Inventário</DialogTitle>
              <DialogDescription>
                Cria um ajuste de inventário no histórico de eventos
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Produto</Label>
                <Select
                  value={adjustForm.productId}
                  onValueChange={(v) =>
                    setAdjustForm((f) => ({ ...f, productId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} ({p.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Tipo de Ajuste</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={adjustForm.adjustmentType === "add" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() =>
                      setAdjustForm((f) => ({ ...f, adjustmentType: "add" }))
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                  <Button
                    type="button"
                    variant={adjustForm.adjustmentType === "remove" ? "destructive" : "outline"}
                    className="flex-1"
                    onClick={() =>
                      setAdjustForm((f) => ({ ...f, adjustmentType: "remove" }))
                    }
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Remover
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={adjustForm.quantity}
                  onChange={(e) =>
                    setAdjustForm((f) => ({
                      ...f,
                      quantity: Number(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label>Motivo do Ajuste *</Label>
                <Input
                  value={adjustForm.reason}
                  onChange={(e) =>
                    setAdjustForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  placeholder="Ex: Inventário físico, perda, correção de erro..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdjustOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleAdjust}
                variant={adjustForm.adjustmentType === "remove" ? "destructive" : "default"}
              >
                {adjustForm.adjustmentType === "add" ? "Adicionar" : "Remover"} ao Estoque
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posição atual do estoque (armazém)</CardTitle>
          <CardDescription>
            Calculado a partir do histórico de eventos de inventário
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stock ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : stock.length === 0 ? (
            <p className="text-muted-foreground">Armazém vazio</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Custo Médio</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Quantidade mínima</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell className="font-medium">
                      {item.product?.name ?? "Produto não encontrado"}
                    </TableCell>
                    <TableCell>
                      {item.qtyOnHand} {item.product?.unit}
                    </TableCell>
                    <TableCell>
                      {item.avgCost > 0 ? `R$ ${item.avgCost.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>
                      {item.totalValue > 0 ? `R$ ${item.totalValue.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>{item.product?.minQuantity}</TableCell>
                    <TableCell>
                      {item.product &&
                      item.qtyOnHand < item.product.minQuantity ? (
                        <Badge variant="destructive">Abaixo do Mínimo</Badge>
                      ) : (
                        <Badge variant="secondary">Conforme</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Ajustes</CardTitle>
          <CardDescription>Últimos ajustes realizados</CardDescription>
        </CardHeader>
        <CardContent>
          {!adjustEvents ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : adjustEvents.length === 0 ? (
            <p className="text-muted-foreground">Nenhum ajuste realizado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustEvents.map((event) => (
                  <TableRow key={event._id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.product?.name ?? "?"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          event.qtyDelta > 0
                            ? "text-green-600 font-medium"
                            : "text-red-600 font-medium"
                        }
                      >
                        {event.qtyDelta > 0 ? "+" : ""}
                        {event.qtyDelta} {event.product?.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {event.refId}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.userId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
