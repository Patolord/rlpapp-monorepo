import { Card, CardHeader, CardTitle, CardContent, CardFooter, Button } from "@rlpapp/ui";

export function Actions() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Torre Norte</p>
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

export function SingleAction() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Sensor de Vibração SV-08</CardTitle>
      </CardHeader>
      <CardFooter>
        <Button size="sm" className="w-full">
          Ver detalhes
        </Button>
      </CardFooter>
    </Card>
  );
}
