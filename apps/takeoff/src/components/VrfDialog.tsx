import { useEffect, useState } from "react";
import {
  brandOf,
  formatHp,
  HP_SUGGESTIONS,
  ROLE_LABELS,
  sizeRun,
  type VrfRole,
  type VrfSpec,
} from "../lib/vrf";
import { vrfSystems } from "../lib/vrfItems";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button, Kbd } from "./ui";

const input =
  "h-7 rounded bg-neutral-800 px-1.5 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

const ROLE_HELP: Record<VrfRole, string> = {
  main: "Da condensadora até o primeiro Y-kit; a bitola vem da capacidade do sistema.",
  trunk:
    "Entre dois Y-kits; informe a soma das evaporadoras a jusante (vazio = menor bitola da tabela).",
  branch: "Do Y-kit até uma evaporadora; informe a capacidade da evaporadora. Conta 1 evaporadora.",
};

/**
 * Asked after a VRF run is drawn (or when editing selected runs): which system, the role of the
 * run, the capacity that sizes it, elbows and vertical length. The brand's tables show the
 * resulting gas/liquid pair right away.
 */
export function VrfDialog() {
  const pending = useStore((s) => s.pendingVrf);
  const editIds = useStore((s) => s.vrfEditIds);
  const lastSpec = useStore((s) => s.lastVrfSpec);
  const project = useStore((s) => s.project);
  const brands = useStore((s) => s.catalog.vrfBrands);
  const activeItemId = useStore((s) => s.activeItemId);
  const {
    setPendingVrf,
    setVrfEditIds,
    addVrfRun,
    updateVrfSpec,
    addVrfSystem,
    setVrfSystem,
    updateVrfSystem,
  } = useStore.getState();
  const systems = vrfSystems(project);
  const open = pending !== null || editIds !== null;
  const [systemId, setSystemId] = useState<string>("");
  const [spec, setSpec] = useState<VrfSpec>(lastSpec);
  const [vertical, setVertical] = useState(0);
  const [systemHp, setSystemHp] = useState(8);
  const [brandId, setBrandId] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: seeds the form when the dialog opens
  useEffect(() => {
    if (!open) return;
    const first = editIds
      ? project.measurements.find((m) => editIds.includes(m.id) && m.vrf)
      : undefined;
    setSpec(first?.vrf ?? lastSpec);
    setVertical(first?.vertical ?? 0);
    const current =
      first?.itemId ||
      (systems.some((n) => n.id === activeItemId) ? activeItemId : null) ||
      systems[systems.length - 1]?.id ||
      "";
    setSystemId(current ?? "");
    const sys = systems.find((s) => s.id === current);
    setSystemHp(sys?.vrf?.hp ?? 8);
    setBrandId(brandOf(brands, sys?.vrf?.brand).id);
  }, [open, editIds, lastSpec, project.measurements]);

  if (!open) return null;
  const editing = editIds !== null;
  const system = systems.find((s) => s.id === systemId);
  const brand = brandOf(brands, system?.vrf?.brand ?? brandId);
  const hpForSize = spec.role === "main" ? systemHp : spec.hp;
  const pair = sizeRun(brand, spec.role, hpForSize);
  const close = () => {
    setPendingVrf(null);
    setVrfEditIds(null);
  };
  const submit = () => {
    const norm: VrfSpec = {
      role: spec.role,
      hp: Math.max(0, spec.hp || 0),
      curves: Math.max(0, Math.round(spec.curves || 0)),
    };
    let target = systemId === "__new__" || !systemId ? undefined : systemId;
    if (!target) target = addVrfSystem({ brand: brandId, hp: systemHp });
    else if (system && system.vrf?.hp !== systemHp) updateVrfSystem(target, { hp: systemHp });
    if (editIds) {
      updateVrfSpec(editIds, norm, vertical);
      setVrfSystem(editIds, target);
    } else if (pending) addVrfRun(norm, pending.page, pending.points, vertical, target);
    close();
  };
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);
  const onSystemChange = (id: string) => {
    setSystemId(id);
    const sys = systems.find((s) => s.id === id);
    if (sys) {
      setSystemHp(sys.vrf?.hp ?? 8);
      setBrandId(brandOf(brands, sys.vrf?.brand).id);
    }
  };

  return (
    <Dialog
      title={editing ? "Editar trecho VRF" : "Trecho VRF medido"}
      onClose={close}
      onSubmit={submit}
      className="w-[32rem]"
    >
      <datalist id="vrf-hp">
        {HP_SUGGESTIONS.map((hp) => (
          <option key={hp} value={hp} />
        ))}
      </datalist>
      <p className="mt-1 text-xs text-neutral-400">
        As bitolas de gás e líquido saem das tabelas da marca pela capacidade; cobre, joelhos,
        isolamento, Y-kits, cabos e mão de obra são calculados na aba VRF.
      </p>

      <div className="mt-4 grid grid-cols-[1fr_7rem_6rem] gap-3 text-xs text-neutral-400">
        <label className="block">
          <span className="mb-1 block">Sistema VRF (item do orçamento)</span>
          <select
            value={systemId}
            onChange={(e) => onSystemChange(e.target.value)}
            className={`${input} w-full`}
          >
            {systems.length === 0 && <option value="">Sistema VRF (novo)</option>}
            {systems.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.vrf ? ` · ${formatHp(n.vrf.hp)}` : ""}
              </option>
            ))}
            <option value="__new__">+ Novo sistema VRF</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block">Marca</span>
          <select
            value={brand.id}
            disabled={Boolean(system)}
            onChange={(e) => setBrandId(e.target.value)}
            className={`${input} w-full disabled:opacity-60`}
            title={system ? "Troque a marca do sistema na aba VRF" : "Marca do novo sistema"}
          >
            {(brands.length ? brands : [brand]).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block">Condensadora (HP)</span>
          <input
            type="number"
            min={0}
            step="any"
            list="vrf-hp"
            value={systemHp || ""}
            onChange={(e) => setSystemHp(num(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={`${input} w-full text-right font-mono`}
            title="Capacidade total do sistema: dimensiona a saída da condensadora e o primeiro Y-kit"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_6rem_6rem_6rem] gap-3 text-xs text-neutral-400">
        <label className="block">
          <span className="mb-1 block">Trecho</span>
          <select
            autoFocus
            value={spec.role}
            onChange={(e) => setSpec({ ...spec, role: e.target.value as VrfRole })}
            className={`${input} w-full`}
          >
            {(Object.keys(ROLE_LABELS) as VrfRole[]).map((k) => (
              <option key={k} value={k}>
                {ROLE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block">
            {spec.role === "branch" ? "Evaporadora (HP)" : "A jusante (HP)"}
          </span>
          <input
            type="number"
            min={0}
            step="any"
            list="vrf-hp"
            disabled={spec.role === "main"}
            value={spec.role === "main" ? systemHp || "" : spec.hp || ""}
            placeholder={spec.role === "trunk" ? "menor" : "0"}
            onChange={(e) => setSpec({ ...spec, hp: num(e.target.value) })}
            onFocus={(e) => e.target.select()}
            className={`${input} w-full text-right font-mono disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block">Curvas (pç)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={spec.curves || ""}
            placeholder="0"
            onChange={(e) => setSpec({ ...spec, curves: num(e.target.value) })}
            onFocus={(e) => e.target.select()}
            className={`${input} w-full text-right font-mono`}
            title="Joelhos do trecho: um em cada tubo (gás e líquido)"
          />
        </label>
        <label className="block">
          <span className="mb-1 block">Vertical (m)</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={vertical || ""}
            placeholder="0"
            onChange={(e) => setVertical(num(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={`${input} w-full text-right font-mono`}
            title="Prumadas e descidas que a planta não mostra, somadas ao trecho"
          />
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">{ROLE_HELP[spec.role]}</p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="rounded bg-neutral-800 px-2 py-1 font-mono text-neutral-200">
          gás {pair.gas}" · líquido {pair.liquid}"
        </span>
        <span className="text-neutral-500">
          {brand.name} · {formatHp(hpForSize)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-neutral-500">
          <Kbd>Enter</Kbd> confirma · <Kbd>Esc</Kbd> cancela
        </span>
        <Button onClick={close}>Cancelar</Button>
        <Button type="submit" variant="primary">
          {editing ? "Aplicar" : "Criar trecho"}
        </Button>
      </div>
    </Dialog>
  );
}
