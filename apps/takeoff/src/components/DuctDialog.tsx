import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_DUCT_SETTINGS,
  type DuctFlange,
  type DuctInner,
  type DuctInsulation,
  type DuctSettings,
  type DuctSpec,
  FLANGE_LABELS,
  gaugeName,
  INNER_LABELS,
  INSULATION_LABELS,
  NORMA_LABELS,
} from "../lib/ducts";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

const input =
  "h-7 rounded bg-neutral-800 px-1.5 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/**
 * Asked after a duct run is drawn (or when editing selected runs): section, insulation, lining,
 * flange and rechapeamento. The duct settings (norma, allowances, labour) live in the project.
 */
export function DuctDialog() {
  const pending = useStore((s) => s.pendingDuct);
  const editIds = useStore((s) => s.ductEditIds);
  const lastSpec = useStore((s) => s.lastDuctSpec);
  const project = useStore((s) => s.project);
  const { setPendingDuct, setDuctEditIds, addDuctRun, updateDuctSpec, setDuctSettings } =
    useStore.getState();
  const open = pending !== null || editIds !== null;
  const [spec, setSpec] = useState<DuctSpec>(lastSpec);
  const [showSettings, setShowSettings] = useState(false);
  const settings: DuctSettings = project.duct ?? DEFAULT_DUCT_SETTINGS;

  useEffect(() => {
    if (!open) return;
    if (editIds) {
      const first = project.measurements.find((m) => editIds.includes(m.id) && m.duct);
      setSpec(first?.duct ?? lastSpec);
    } else {
      setSpec(lastSpec);
    }
    setShowSettings(false);
  }, [open, editIds, lastSpec, project.measurements]);

  if (!open) return null;
  const editing = editIds !== null;
  const valid = spec.a > 0 && spec.b > 0;
  const close = () => {
    setPendingDuct(null);
    setDuctEditIds(null);
  };
  const submit = () => {
    if (!valid) return;
    const norm: DuctSpec = {
      ...spec,
      a: Math.max(spec.a, spec.b),
      b: Math.min(spec.a, spec.b),
      paintRechap: spec.rechapeado && spec.paintRechap,
    };
    if (editIds) updateDuctSpec(editIds, norm);
    else if (pending) addDuctRun(norm, pending.page, pending.points);
    close();
  };
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const patchSettings = (p: Partial<DuctSettings>) => setDuctSettings({ ...settings, ...p });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click cancels
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={close}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-[30rem] rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-neutral-100">
          {editing ? "Editar duto" : "Duto medido"}
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Chapa, isolamento, flanges, fitas, suportes e mão de obra são calculados para todos os
          dutos do takeoff, conforme a NBR 16401 ({NORMA_LABELS[settings.norma]}).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-400">
          <label className="block">
            <span className="mb-1 block">Lado maior (cm)</span>
            <input
              // biome-ignore lint/a11y/noAutofocus: the dimensions are what the user types first
              autoFocus
              type="number"
              min={1}
              step={1}
              value={spec.a || ""}
              onChange={(e) => setSpec({ ...spec, a: num(e.target.value) })}
              onFocus={(e) => e.target.select()}
              className={`${input} w-full text-right font-mono`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">Lado menor (cm)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={spec.b || ""}
              onChange={(e) => setSpec({ ...spec, b: num(e.target.value) })}
              onFocus={(e) => e.target.select()}
              className={`${input} w-full text-right font-mono`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">Isolamento externo</span>
            <select
              value={spec.insulation}
              onChange={(e) => setSpec({ ...spec, insulation: e.target.value as DuctInsulation })}
              className={`${input} w-full`}
            >
              {(Object.keys(INSULATION_LABELS) as DuctInsulation[]).map((k) => (
                <option key={k} value={k}>
                  {INSULATION_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block">Revestimento interno</span>
            <select
              value={spec.inner}
              onChange={(e) => setSpec({ ...spec, inner: e.target.value as DuctInner })}
              className={`${input} w-full`}
            >
              {(Object.keys(INNER_LABELS) as DuctInner[]).map((k) => (
                <option key={k} value={k}>
                  {INNER_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block">Flange</span>
            <select
              value={spec.flange}
              onChange={(e) => setSpec({ ...spec, flange: e.target.value as DuctFlange })}
              className={`${input} w-full`}
            >
              {(Object.keys(FLANGE_LABELS) as DuctFlange[]).map((k) => (
                <option key={k} value={k}>
                  {FLANGE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={spec.rechapeado}
                onChange={(e) => setSpec({ ...spec, rechapeado: e.target.checked })}
              />
              Rechapeado (# 26)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={!spec.rechapeado}
                checked={spec.rechapeado && spec.paintRechap}
                onChange={(e) => setSpec({ ...spec, paintRechap: e.target.checked })}
              />
              Pintura no rechapeado
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="rounded bg-neutral-800 px-2 py-1 font-mono text-neutral-200">
            {valid ? `chapa ${gaugeName(Math.max(spec.a, spec.b), settings.norma)}` : "—"}
          </span>
          <span className="text-neutral-500">
            perímetro {valid ? (((spec.a + spec.b) * 2) / 100).toFixed(2) : "—"} m
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="ml-auto flex items-center gap-1 text-neutral-400 hover:text-neutral-100"
          >
            <Settings2 size={13} /> Parâmetros do cálculo
          </button>
        </div>

        {showSettings && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-neutral-800 bg-neutral-800/40 p-3 text-[11px] text-neutral-400">
            <label className="col-span-3 block">
              <span className="mb-0.5 block">Norma (bitola da chapa pelo lado maior)</span>
              <select
                value={settings.norma}
                onChange={(e) => patchSettings({ norma: Number(e.target.value) as 1 | 2 | 3 })}
                className={`${input} w-full`}
              >
                {([1, 2, 3] as const).map((n) => (
                  <option key={n} value={n}>
                    {NORMA_LABELS[n]}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["insulThickness", "Isolamento (mm)"],
                ["flangeSpacing", "Flange a cada (m)"],
                ["rechapThickness", "Rechapeado (mm)"],
                ["insulSlackPct", "Folga isolamento %"],
                ["supportsPct", "Suportes % do peso"],
                ["laborPerKg", "M. obra R$/kg"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-0.5 block">{label}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={settings[key]}
                  onChange={(e) => patchSettings({ [key]: num(e.target.value) })}
                  className={`${input} w-full text-right font-mono`}
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-0.5 block">Folga chapa %</span>
              <input
                type="number"
                min={0}
                step="any"
                value={settings.sheetSlackPct ?? ""}
                placeholder="auto"
                title="Vazio = regra da planilha: 20 %, ou 15 % acima de 10 000 kg"
                onChange={(e) =>
                  patchSettings({
                    sheetSlackPct: e.target.value === "" ? null : num(e.target.value),
                  })
                }
                className={`${input} w-full text-right font-mono`}
              />
            </label>
            <p className="col-span-2 self-end text-neutral-500">
              Mão de obra dobra abaixo de 500 kg, como na planilha.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-neutral-500">
            <Kbd>Enter</Kbd> confirma · <Kbd>Esc</Kbd> cancela
          </span>
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {editing ? "Aplicar" : "Criar duto"}
          </Button>
        </div>
      </form>
    </div>
  );
}
