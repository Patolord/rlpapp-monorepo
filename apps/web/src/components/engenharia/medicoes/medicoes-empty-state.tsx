import { Link } from "@tanstack/react-router";
import { CircleDollarSign, Plus } from "lucide-react";
import { EmptyState as EmptyStateBlock } from "@rlpapp/ui/web";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCan } from "@/hooks/use-can";

export function MedicoesEmptyState({ obraSlug }: { obraSlug: string }) {
  const canSeeContracts = useCan("contratos.read");
  return (
    <Card>
      <EmptyStateBlock
        icon={<CircleDollarSign />}
        title="Nenhum contrato elegível para medições"
        description="Cadastre um contrato de venda ao cliente nesta obra para começar a registrar medições."
        action={
          canSeeContracts ? (
            <Button
              render={
                <Link
                  to="/engenharia/obras/$obraSlug/contratos"
                  params={{ obraSlug }}
                />
              }
            >
              <Plus />
              Ir para contratos
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}
