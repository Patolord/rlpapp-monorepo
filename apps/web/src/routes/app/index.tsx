import { Link, createFileRoute } from "@tanstack/react-router";
import { Warehouse, DollarSign, Users, HardHat } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/app/")({
  component: DirectorDashboard,
});

const departmentCards = [
  {
    to: "/estoque",
    title: "Estoque",
    description: "Gestão de produtos, fornecedores, entradas, saídas e movimentações de materiais.",
    icon: Warehouse,
  },
  {
    to: "/financeiro",
    title: "Financeiro",
    description: "Contas a pagar e receber, fluxo de caixa, orçamentos e relatórios financeiros.",
    icon: DollarSign,
  },
  {
    to: "/rh",
    title: "Recursos Humanos",
    description: "Gestão de funcionários, folha de pagamento, benefícios e recrutamento.",
    icon: Users,
  },
  {
    to: "/engenharia",
    title: "Engenharia",
    description: "Projetos, cronogramas, acompanhamento de obras e documentação técnica.",
    icon: HardHat,
  },
] as const;

function DirectorDashboard() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Painel do Diretor</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione um departamento para acessar.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {departmentCards.map((dept) => (
          <Link key={dept.to} to={dept.to} className="group">
            <Card className="h-full rounded-2xl border-border bg-card shadow-sm transition-colors hover:bg-muted">
              <CardHeader className="pb-3">
                <div className="mb-3 flex items-center gap-3">
                  <dept.icon className="h-5 w-5" />
                  <CardTitle className="text-lg font-semibold">{dept.title}</CardTitle>
                </div>
                <CardDescription className="text-sm">
                  {dept.description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
