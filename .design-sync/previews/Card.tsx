import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
  Badge,
  Button,
} from "@rlpapp/ui";

export function Basic() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
        <CardDescription>Torre Norte · Instalado em 12/03/2026</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Última manutenção preventiva realizada há 14 dias. Próxima revisão
          agendada para 26/07/2026.
        </p>
      </CardContent>
    </Card>
  );
}

export function WithHeaderActionAndFooter() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
        <CardDescription>Torre Norte · Instalado em 12/03/2026</CardDescription>
        <CardAction>
          <Badge variant="success">Operacional</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Última manutenção preventiva realizada há 14 dias.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline">
          Ver histórico
        </Button>
        <Button size="sm">Registrar manutenção</Button>
      </CardFooter>
    </Card>
  );
}

export function Elevated() {
  return (
    <Card variant="elevated" className="w-80">
      <CardHeader>
        <CardTitle>Painel Elétrico PE-12</CardTitle>
        <CardDescription>Subestação B</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Card elevado, usado para destacar itens em uma lista.
        </p>
      </CardContent>
    </Card>
  );
}

export function Interactive() {
  return (
    <Card variant="interactive" className="w-80">
      <CardHeader>
        <CardTitle>Sensor de Vibração SV-08</CardTitle>
        <CardDescription>Clique para ver detalhes</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function Compact() {
  return (
    <Card size="sm" className="w-80">
      <CardHeader>
        <CardTitle>Equipamentos pendentes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          3 itens aguardando inspeção
        </p>
      </CardContent>
    </Card>
  );
}
