import { PageHeader, Button } from "@rlpapp/ui";

export function Default() {
  return (
    <PageHeader
      title="Equipamentos"
      description="Gerencie o cadastro e o histórico de manutenção da torre."
      className="w-[480px]"
    />
  );
}

export function WithAction() {
  return (
    <PageHeader
      title="Registro de Campo"
      description="12 equipamentos registrados hoje"
      action={<Button>Novo registro</Button>}
      className="w-[480px]"
    />
  );
}
