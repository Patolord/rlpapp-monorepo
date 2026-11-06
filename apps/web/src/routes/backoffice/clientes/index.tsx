import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { CustomerCreateDialog } from "@/components/backoffice/clientes/customer-create-dialog";
import { CustomerImportDialog } from "@/components/backoffice/clientes/customer-import-dialog";
import { CustomersTable } from "@/components/backoffice/clientes/customers-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PersonTypeFilter = "all" | "pf" | "pj";
type StatusFilter = "current" | "active" | "inactive" | "archived" | "all";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "current", label: "Ativos e inativos" },
  { value: "active", label: "Somente ativos" },
  { value: "inactive", label: "Somente inativos" },
  { value: "archived", label: "Arquivados" },
  { value: "all", label: "Todos" },
];

export const Route = createFileRoute("/backoffice/clientes/")({
  component: ClientesPage,
});

function ClientesPage() {
  return (
    <AuthShell>
      <ClientesContent />
    </AuthShell>
  );
}

function ClientesContent() {
  const customers = useQuery(api.customers.list, {
    activeOnly: false,
    includeArchived: true,
  });

  const [search, setSearch] = useState("");
  const [personTypeFilter, setPersonTypeFilter] =
    useState<PersonTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("current");

  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (personTypeFilter !== "all" && c.personType !== personTypeFilter) {
        return false;
      }
      const archived = c.archivedAt !== null;
      switch (statusFilter) {
        case "current":
          if (archived) return false;
          break;
        case "active":
          if (archived || !c.active) return false;
          break;
        case "inactive":
          if (archived || c.active) return false;
          break;
        case "archived":
          if (!archived) return false;
          break;
        case "all":
          break;
      }
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.legalName?.toLowerCase().includes(term) ?? false) ||
        (c.taxId?.includes(term) ?? false)
      );
    });
  }, [customers, search, personTypeFilter, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro mestre de clientes para vincular às obras.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CustomerImportDialog />
          <CustomerCreateDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={personTypeFilter}
              onValueChange={(value) =>
                setPersonTypeFilter(value as PersonTypeFilter)
              }
            >
              <SelectTrigger className="w-40" aria-label="Tipo de pessoa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">PF e PJ</SelectItem>
                <SelectItem value="pj">Pessoa jurídica</SelectItem>
                <SelectItem value="pf">Pessoa física</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="w-44" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CustomersTable
            customers={filtered}
            loading={customers === undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
