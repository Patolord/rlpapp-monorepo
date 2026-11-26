/**
 * Scores a takeoff made by the AI agent against the one a person closed for the same drawings
 * (src/lib/eval). Two ways to run it, from apps/takeoff:
 *
 *   pnpm eval <referencia.takeoff.json> <candidato.takeoff.json> [--diff saida.takeoff.json]
 *   pnpm eval --set <casos.json>
 *
 * A set file lists cases, with paths relative to it, and tags naming what is hard about each
 * PDF (the totals come per tag too):
 *
 *   { "cases": [ { "id": "obra-a", "tags": ["escaneado"],
 *                  "reference": "obra-a/referencia.takeoff.json",
 *                  "candidate": "obra-a/candidato.takeoff.json" } ] }
 *
 * Options: --json <file> writes the full comparison; --tol <pt> is how far apart two count
 * marks may be and still match (default 15 page points); --iou <0..1> the least overlap for two
 * outlines to be the same location (default 0.5); --out <file> writes the report instead of
 * printing it; --diff <file> (one pair only) writes a takeoff that shows right / missed / extra
 * on the reference's drawings, to open in the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compareTakeoffs } from "../src/lib/eval/compare";
import { diffProject } from "../src/lib/eval/diffProject";
import { type CaseResult, formatReport, formatSet } from "../src/lib/eval/report";
import { migrateProject, type Project } from "../src/lib/types";

interface SetFile {
  cases?: { id?: unknown; tags?: unknown; reference?: unknown; candidate?: unknown }[];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function loadProject(path: string): Project {
  try {
    return migrateProject(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    return fail(`${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const args = process.argv.slice(2);
const positional: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`${args[i]} precisa de um valor`);
    flags.set(args[i].slice(2), value);
    i++;
  } else {
    positional.push(args[i]);
  }
}

const number = (name: string): number | undefined => {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) fail(`--${name} precisa ser um número maior que zero`);
  return v;
};
const options = { tolerancePt: number("tol"), minIoU: number("iou") };

function emit(text: string, data: unknown) {
  const out = flags.get("out");
  if (out) {
    writeFileSync(out, text);
    console.log(`Relatório: ${out}`);
  } else {
    console.log(text);
  }
  const json = flags.get("json");
  if (json) {
    writeFileSync(json, JSON.stringify(data, null, 2));
    console.log(`Comparação completa: ${json}`);
  }
}

const setPath = flags.get("set");
if (setPath) {
  let file: SetFile;
  try {
    file = JSON.parse(readFileSync(setPath, "utf8")) as SetFile;
  } catch (e) {
    fail(`${setPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const base = dirname(resolve(setPath));
  const results: CaseResult[] = (file.cases ?? []).map((c, i) => {
    if (typeof c.reference !== "string" || typeof c.candidate !== "string") {
      fail(`${setPath}: o caso ${i + 1} precisa de "reference" e "candidate"`);
    }
    return {
      id: typeof c.id === "string" && c.id ? c.id : `caso-${i + 1}`,
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string") : [],
      report: compareTakeoffs(
        loadProject(resolve(base, c.reference)),
        loadProject(resolve(base, c.candidate)),
        options,
      ),
    };
  });
  if (results.length === 0) fail(`${setPath}: nenhum caso em "cases"`);
  emit(formatSet(results), results);
} else if (positional.length === 2) {
  const reference = loadProject(positional[0]);
  const report = compareTakeoffs(reference, loadProject(positional[1]), options);
  emit(formatReport(report), report);
  const diff = flags.get("diff");
  if (diff) {
    writeFileSync(diff, JSON.stringify(diffProject(reference, report), null, 2));
    console.log(`Diferenças para abrir no app: ${diff}`);
  }
} else {
  fail(
    "Uso: pnpm eval <referencia.takeoff.json> <candidato.takeoff.json> [--diff saida.takeoff.json]\n" +
      "     pnpm eval --set <casos.json>\n" +
      "Opções: --tol <pt>  --iou <0..1>  --json <arquivo>  --out <arquivo>",
  );
}
