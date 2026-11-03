import { FileText, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { newProject, pickPdfs } from "../lib/files";
import { MOD } from "../lib/platform";
import { basename } from "../lib/session";
import { DISCIPLINE_SUGGESTIONS, UNTITLED } from "../lib/types";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button, Kbd } from "./ui";

/**
 * Starts a fresh project (an obra): name, client, site, the default discipline and the plantas
 * (any number of PDFs, chosen at once) it opens with.
 */
export function NewProjectDialog() {
  const open = useStore((s) => s.newProjectOpen);
  const setOpen = useStore((s) => s.setNewProjectOpen);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [system, setSystem] = useState("");
  const [pdfs, setPdfs] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setName("");
      setClient("");
      setSite("");
      setSystem("");
      setPdfs([]);
    }
  }, [open]);
  if (!open) return null;

  const addPdfs = async () => {
    const picked = await pickPdfs("Plantas do takeoff");
    if (picked.length > 0) setPdfs((prev) => [...new Set([...prev, ...picked])]);
  };

  const submit = async () => {
    const ok = await newProject(
      {
        name: name.trim() || site.trim() || UNTITLED,
        client: client.trim(),
        site: site.trim(),
        system: system.trim(),
      },
      pdfs,
    );
    if (ok) setOpen(false);
  };

  const input = (
    value: string,
    set: (v: string) => void,
    placeholder: string,
    list?: string,
    autoFocus = false,
  ) => (
    <input
      autoFocus={autoFocus}
      list={list}
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      className="h-8 w-full rounded bg-neutral-800 px-2 text-sm text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400"
    />
  );

  return (
    <Dialog
      title="Novo takeoff"
      onClose={() => setOpen(false)}
      onSubmit={() => void submit()}
      className="w-[26rem]"
    >
      <p className="mt-1 text-xs text-neutral-400">
        Um takeoff é uma obra: reúne as plantas (PDF), as marcações, os locais e os itens de todas
        as disciplinas, e gera uma planilha com uma aba por disciplina.
      </p>
      <div className="mt-4 space-y-2 text-xs text-neutral-400">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the input is rendered by the helper above */}
        <label className="block">
          <span className="mb-1 block">Obra</span>
          {input(site, setSite, "ex.: Gávea - Torre 01", undefined, true)}
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the input is rendered by the helper above */}
        <label className="block">
          <span className="mb-1 block">Cliente</span>
          {input(client, setClient, "ex.: S2A Empreendimentos")}
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the input is rendered by the helper above */}
        <label className="block">
          <span className="mb-1 block">Nome do takeoff (opcional, usa a obra)</span>
          {input(name, setName, "ex.: Gávea - Pressurização e Exaustão")}
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the input is rendered by the helper above */}
        <label className="block">
          <span className="mb-1 block">Disciplina inicial (pode ter várias)</span>
          {input(system, setSystem, "ex.: Pressurização de Escadas", "new-project-systems")}
          <datalist id="new-project-systems">
            {DISCIPLINE_SUGGESTIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <div>
          <div className="mb-1 flex items-center">
            <span>Plantas (PDF) · selecione várias de uma vez</span>
            <Button onClick={() => void addPdfs()} className="ml-auto h-7 gap-1 px-2 text-xs">
              <Plus size={14} /> {pdfs.length ? "Adicionar" : "Escolher plantas…"}
            </Button>
          </div>
          {pdfs.length > 0 && (
            <ul className="max-h-32 divide-y divide-neutral-800 overflow-y-auto rounded border border-neutral-800">
              {pdfs.map((p) => (
                <li key={p} className="flex items-center gap-2 px-2 py-1" title={p}>
                  <FileText size={14} className="shrink-0 text-neutral-500" />
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{basename(p)}</span>
                  <button
                    type="button"
                    aria-label={`Tirar ${basename(p)}`}
                    onClick={() => setPdfs((prev) => prev.filter((x) => x !== p))}
                    className="shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[12px] text-neutral-500">
          {pdfs.length
            ? `${pdfs.length} planta${pdfs.length > 1 ? "s" : ""}; outras com `
            : "As plantas também podem vir depois, com "}
          <Kbd>{MOD}</Kbd>+<Kbd>O</Kbd>.
        </span>
        <Button onClick={() => setOpen(false)}>Cancelar</Button>
        <Button type="submit" variant="primary">
          Criar takeoff
        </Button>
      </div>
    </Dialog>
  );
}
