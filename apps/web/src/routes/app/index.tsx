import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Warehouse,
  DollarSign,
  Users,
  HardHat,
  ArrowRight,
} from "lucide-react";

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
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    to: "/financeiro",
    title: "Financeiro",
    description: "Contas a pagar e receber, fluxo de caixa, orçamentos e relatórios financeiros.",
    icon: DollarSign,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    to: "/rh",
    title: "Recursos Humanos",
    description: "Gestão de funcionários, folha de pagamento, benefícios e recrutamento.",
    icon: Users,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    to: "/engenharia",
    title: "Engenharia",
    description: "Projetos, cronogramas, acompanhamento de obras e documentação técnica.",
    icon: HardHat,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
] as const;

function DirectorDashboard() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Painel do Diretor</h1>
        <p className="mt-2 text-muted-foreground">
          Selecione um departamento para acessar.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {departmentCards.map((dept) => (
          <Link key={dept.to} to={dept.to} className="group">
            <Card className="h-full transition-colors hover:border-foreground/20 hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${dept.color}`}>
                    <dept.icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardTitle className="mt-4 text-xl">{dept.title}</CardTitle>
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
