import { Card, CardHeader, CardTitle, CardDescription } from "@rlpapp/ui";

export function Default() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
        <CardDescription>Torre Norte · Instalado em 12/03/2026</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function LongText() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Relatório mensal</CardTitle>
        <CardDescription>
          Resumo consolidado de instalações, manutenções e ocorrências
          registradas em todas as torres no período selecionado.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
