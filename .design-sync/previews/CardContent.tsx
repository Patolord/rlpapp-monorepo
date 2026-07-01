import { Card, CardHeader, CardTitle, CardContent } from "@rlpapp/ui";

export function Text() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bomba Centrífuga BC-450</CardTitle>
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

export function List() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Checklist de instalação</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>✓ Fixação estrutural concluída</li>
          <li>✓ Ligação elétrica testada</li>
          <li>· QR code impresso e afixado</li>
        </ul>
      </CardContent>
    </Card>
  );
}
