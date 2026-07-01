import { Card, CardHeader, CardTitle, CardDescription, CardAction, Badge } from "@rlpapp/ui";

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

export function WithAction() {
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
