import type {
  EstimateTemplate,
  ParamValue,
  TemplateValues,
} from "@rlpapp/shared/takeoff/estimateTemplates";
import type { Kit } from "../lib/kits";
import { ScalarInput, TableParam } from "./EstimateParamInputs";

interface Props {
  template: EstimateTemplate;
  values: TemplateValues;
  onChange(next: TemplateValues): void;
  kits: readonly Kit[];
}

/** The parameters of a service calculator: a row each, a table across the whole width. */
export function EstimateParams({ template, values, onChange, kits }: Props) {
  const set = (key: string, v: ParamValue) => onChange({ ...values, [key]: v });
  return (
    <section className="space-y-1.5">
      <p className="text-neutral-400">{template.description}</p>
      <div className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        {template.params
          .filter((p) => !p.when || p.when(values))
          .map((p) => {
            const id = `estimate-${template.id}-${p.key}`;
            if (p.type === "table") {
              const rows = values[p.key];
              return (
                <div key={p.key} className="col-span-2 space-y-1">
                  <h4 className="text-neutral-300">{p.label}</h4>
                  <TableParam
                    param={p}
                    rows={Array.isArray(rows) ? rows : []}
                    onChange={(next) => set(p.key, next)}
                    values={values}
                    kits={kits}
                  />
                </div>
              );
            }
            const value = values[p.key];
            return (
              <div key={p.key} className="contents">
                <label htmlFor={id} className="text-neutral-300" title={p.hint}>
                  {p.label}
                </label>
                <div className="flex min-w-0 items-center gap-1.5">
                  {p.type === "toggle" ? (
                    <input
                      id={id}
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) => set(p.key, e.target.checked)}
                      className="h-4 w-4 accent-orange-500"
                    />
                  ) : (
                    <ScalarInput
                      id={id}
                      param={p}
                      value={
                        typeof value === "number" || typeof value === "string" ? value : undefined
                      }
                      onChange={(v) => set(p.key, v)}
                      kits={kits}
                    />
                  )}
                  {p.hint && (
                    <span className="min-w-0 truncate text-[11px] text-neutral-500" title={p.hint}>
                      {p.hint}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
