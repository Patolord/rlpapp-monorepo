import { LoadingState } from "@rlpapp/ui";

export function Default() {
  return <LoadingState />;
}

export function WithLabel() {
  return <LoadingState label="Carregando equipamentos…" />;
}

export function Small() {
  return <LoadingState size={16} label="Sincronizando" />;
}
