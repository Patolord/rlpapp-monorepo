import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import {
  EmployeeCreateDialog,
  EmployeeDetailDialog,
  STATUS_LABEL,
} from "@/components/rh/employee-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCentsInput } from "@/lib/rh/money";

export const Route = createFileRoute("/rh/funcionarios/")({
  component: FuncionariosPage,
});

function FuncionariosPage() {
  return (
    <AuthShell>
      <FuncionariosContent />
    </AuthShell>
  );
}

function FuncionariosContent() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const employees = useQuery(api.employees.list, { includeArchived });

  const filtered = useMemo(() => {
    if (!employees) return [];
    if (!search.trim()) return employees;
    const term = search.toLowerCase();
    return employees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(term) ||
        (employee.jobTitle?.toLowerCase().includes(term) ?? false) ||
        (employee.code?.includes(term) ?? false) ||
        (employee.cpf?.includes(term) ?? false)
    );
  }, [employees, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de identidade e padrões usados na folha mensal.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Novo funcionário
        </Button>
      </div>

      <EmployeeCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar nome, cargo, código ou CPF…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
                className="size-4 accent-primary"
              />
              Mostrar arquivados
            </label>
          </div>
          {employees === undefined ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cód.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Sal. base</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {employees?.length
                        ? "Nenhum funcionário corresponde à busca."
                        : "Nenhum funcionário cadastrado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((employee) => (
                  <TableRow key={employee._id}>
                    <TableCell className="text-muted-foreground">
                      {employee.code ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.jobTitle ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCentsInput(employee.baseSalaryCents)}
                    </TableCell>
                    <TableCell>{employee.paymentMethod.toUpperCase()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          employee.status === "active" ? "default" : "outline"
                        }
                      >
                        {STATUS_LABEL[employee.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <EmployeeDetailDialog employee={employee} />
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
