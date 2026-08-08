import { createFileRoute } from "@tanstack/react-router";

import { FieldRecordWorkspace } from "@/components/engenharia/field-record-workspace";

export const Route = createFileRoute("/engenharia/registro-de-campo")({
  component: RegistroDeCampoPage,
});

function RegistroDeCampoPage() {
  return <FieldRecordWorkspace />;
}
