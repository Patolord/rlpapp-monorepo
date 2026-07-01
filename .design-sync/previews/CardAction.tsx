import { Card, CardHeader, CardTitle, CardDescription, CardAction, Badge, Button } from "@rlpapp/ui";

export function WithBadge() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
        <CardDescription>Torre Norte</CardDescription>
        <CardAction>
          <Badge variant="success">Operacional</Badge>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

export function WithButton() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Painel Elétrico PE-12</CardTitle>
        <CardDescription>Subestação B</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost">
            Editar
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
