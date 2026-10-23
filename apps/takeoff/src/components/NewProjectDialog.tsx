import { useEffect, useState } from "react";
import { newProject } from "../lib/files";
import { MOD } from "../lib/platform";
import { DISCIPLINE_SUGGESTIONS, UNTITLED } from "../lib/types";
import { useStore } from "../store";
import { Backdrop, Button, Kbd } from "./ui";

/** Starts a fresh project (an obra): name, client, site and the default discipline. */
export function NewProjectDialog() {
  const open = useStore((s) => s.newProjectOpen);
  const setOpen = useStore((s) => s.setNewProjectOpen);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [system, setSystem] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setClient("");
      setSite("");
      setSystem("");
    }
  }, [open]);
  if (!open) return null;

  const submit = async () => {
    const ok = await newProject({
      name: name.trim() || site.trim() || UNTITLED,
      client: client.trim(),
      site: site.trim(),
      system: system.trim(),
    });
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
    <Backdrop onClose={() => setOpen(false)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-[26rem] rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-neutral-100">Novo takeoff</h2>
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
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-[12px] text-neutral-500">
            Depois, <Kbd>{MOD}</Kbd>+<Kbd>O</Kbd> adiciona as plantas.
          </span>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Criar takeoff
          </Button>
        </div>
      </form>
    </Backdrop>
  );
}
