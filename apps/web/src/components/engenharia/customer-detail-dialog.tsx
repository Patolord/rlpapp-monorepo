import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";

import {
  type PartyConfig,
  PartyDetailDialog,
} from "@/components/engenharia/party/party-detail-dialog";
import type { PartySummary } from "@/components/engenharia/party/party-info-fields";

export type CustomerSummary = PartySummary<Id<"customers">>;

const CUSTOMER_PARTY: PartyConfig<
  Id<"customers">,
  Id<"customerContacts">
> = {
  kind: "customer",
  trigger: "icon",
  labels: {
    description:
      "Dados cadastrais e contatos atuais ou históricos do cliente.",
    updated: "Cliente atualizado",
    updateError: "Erro ao atualizar cliente",
  },
  usePartyApi(customerId, { open, includeInactiveContacts }) {
    const details = useQuery(
      api.customers.get,
      open ? { customerId, includeInactiveContacts } : "skip"
    );
    const update = useMutation(api.customers.update);
    const addContact = useMutation(api.customers.addContact);
    const updateContact = useMutation(api.customers.updateContact);
    const removeContact = useMutation(api.customers.removeContact);
    const restoreContact = useMutation(api.customers.restoreContact);
    return {
      details,
      update: (fields) => update({ customerId, ...fields }),
      addContact: (fields) => addContact({ customerId, ...fields }),
      updateContact,
      removeContact,
      restoreContact,
    };
  },
};

export function CustomerDetailDialog({
  customer,
}: {
  customer: CustomerSummary;
}) {
  return <PartyDetailDialog party={customer} config={CUSTOMER_PARTY} />;
}
