import { Card, CardHeader, CardTitle, CardDescription } from "@rlpapp/ui";

export function Default() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
        <CardDescription>Torre Norte</CardDescription>
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
    </Card>
  );
}
