import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";

import {
  type PartyConfig,
  PartyDetailDialog,
} from "@/components/engenharia/party/party-detail-dialog";
import type { PartySummary } from "@/components/engenharia/party/party-info-fields";

export type ContractorSummary = PartySummary<Id<"contractors">>;

const CONTRACTOR_PARTY: PartyConfig<
  Id<"contractors">,
  Id<"contractorContacts">
> = {
  kind: "contractor",
  trigger: "text",
  labels: {
    description:
      "Dados cadastrais e contatos atuais ou históricos do empreiteiro.",
    updated: "Empreiteiro atualizado",
    updateError: "Erro ao atualizar empreiteiro",
  },
  usePartyApi(contractorId, { open, includeInactiveContacts }) {
    const details = useQuery(
      api.contractors.get,
      open ? { contractorId, includeInactiveContacts } : "skip"
    );
    const update = useMutation(api.contractors.update);
    const addContact = useMutation(api.contractors.addContact);
    const updateContact = useMutation(api.contractors.updateContact);
    const removeContact = useMutation(api.contractors.removeContact);
    const restoreContact = useMutation(api.contractors.restoreContact);
    return {
      details,
      update: (fields) => update({ contractorId, ...fields }),
      addContact: (fields) => addContact({ contractorId, ...fields }),
      updateContact,
      removeContact,
      restoreContact,
    };
  },
};

export function ContractorDetailDialog({
  contractor,
}: {
  contractor: ContractorSummary;
}) {
  return <PartyDetailDialog party={contractor} config={CONTRACTOR_PARTY} />;
}
