import { EmptyState, Button } from "@rlpapp/ui";

function IconBox() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  );
}

export function Card() {
  return (
    <EmptyState
      icon={<IconBox />}
      title="Nenhum equipamento cadastrado"
      description="Cadastre o primeiro equipamento desta torre para começar."
      className="w-96"
    />
  );
}

export function WithAction() {
  return (
    <EmptyState
      icon={<IconBox />}
      title="Nenhum resultado encontrado"
      description="Ajuste os filtros ou limpe a busca para ver todos os equipamentos."
      action={<Button size="sm">Limpar filtros</Button>}
      className="w-96"
    />
  );
}

export function Dashed() {
  return (
    <EmptyState
      variant="dashed"
      icon={<IconBox />}
      title="Arraste arquivos aqui"
      description="ou clique para selecionar fotos do equipamento"
      className="w-96"
    />
  );
}

export function Plain() {
  return (
    <EmptyState
      variant="plain"
      title="Sem relatórios neste período"
      description="Selecione outro intervalo de datas."
      className="w-96"
    />
  );
}
