import { StatusBadge } from "@rlpapp/ui";

export function AllVariants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge variant="neutral">Neutro</StatusBadge>
      <StatusBadge variant="info">Info</StatusBadge>
      <StatusBadge variant="success">Sucesso</StatusBadge>
      <StatusBadge variant="warning">Atenção</StatusBadge>
      <StatusBadge variant="danger">Falha</StatusBadge>
      <StatusBadge variant="muted">Sem uso</StatusBadge>
    </div>
  );
}

export function EquipmentStatuses() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge variant="info">Instalando</StatusBadge>
      <StatusBadge variant="success">Operacional</StatusBadge>
      <StatusBadge variant="warning">Atenção</StatusBadge>
      <StatusBadge variant="danger">Falha</StatusBadge>
    </div>
  );
}
