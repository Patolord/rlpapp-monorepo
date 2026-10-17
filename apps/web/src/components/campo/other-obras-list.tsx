import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Loader2, Search } from "lucide-react";

import { ObraLinkRow } from "@/components/campo/obra-link-row";
import { Input } from "@/components/ui/input";

/**
 * Válvula de escape: o técnico foi deslocado para uma obra que não está na
 * lista dele. Qualquer obra ativa com etiquetas pode ser aberta; o hub da
 * obra avisa que ele não está atribuído, mas não bloqueia.
 */
export function OtherObrasList() {
  const projects = useQuery(api.technicianPortal.listBrowsableProjects);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!projects) return [];
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return projects;
    return projects.filter((project) =>
      [
        project.name,
        project.legacyNumber?.toString(),
        project.client,
        project.address,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [projects, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="other-obras-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Obra, nº, cliente ou endereço"
          className="h-12 pl-9 text-base"
          autoComplete="off"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Abrir uma obra daqui não muda suas atribuições. Avise a engenharia se
        for ficar nela.
      </p>

      {projects === undefined ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Carregando obras...
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "Nenhuma obra corresponde à busca."
            : "Nenhuma obra ativa possui etiquetas QR no momento."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((project) => (
            <ObraLinkRow key={project._id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
