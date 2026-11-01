import { signatureOf, type ValidatorJson } from "../mcpCatalog";

/**
 * Validação de argumentos no gateway (`/api/v1`), antes de chamar o deployment.
 *
 * Existe porque deployments de produção redigem toda mensagem que não venha
 * de `ConvexError` para "Server Error", o que esconde o
 * `ArgumentValidationError` dos clientes da API; validar aqui mantém o
 * `VALIDATION_ERROR` preciso em qualquer ambiente. Espelha as regras do
 * Convex: opcional significa "pode faltar", campo extra é rejeitado.
 */

/**
 * Um problema encontrado ao conferir os args contra um validador. `field` é um
 * caminho pontilhado (`items[2].status`); ausente quando a raiz está errada.
 */
export interface ArgsIssue {
  message: string;
  field?: string;
  expected: string;
  received?: string;
}

/**
 * Um argumento tipado como ID cuja tabela ainda precisa ser conferida. A
 * caminhada só checa a forma; `mcpCatalog.checkIds` decodifica com
 * `db.normalizeId`, que exige um contexto de função.
 */
export interface IdCheck {
  field: string;
  /** Tabelas aceitas nessa posição (várias em `v.union(v.id(a), v.id(b))`). */
  tables: string[];
  value: string;
}

const RECEIVED_PREVIEW_LIMIT = 120;

function preview(value: unknown): string {
  if (value === undefined) return "undefined";
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > RECEIVED_PREVIEW_LIMIT
    ? `${text.slice(0, RECEIVED_PREVIEW_LIMIT)}…`
    : text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Confere args JSON contra o validador `exportArgs()` de uma função e devolve
 * a primeira divergência, ou `null` quando os args passariam na validação do
 * Convex. `v.id` só exige string não vazia aqui; cada ID visto entra em `ids`
 * para o chamador verificar a tabela depois.
 */
export function validateArgs(
  validator: ValidatorJson,
  value: unknown,
  ids: IdCheck[] = []
): ArgsIssue | null {
  return check(validator, value, "", ids);
}

function check(
  validator: ValidatorJson,
  value: unknown,
  path: string,
  ids: IdCheck[]
): ArgsIssue | null {
  const mismatch = (expected: string): ArgsIssue => ({
    message: path
      ? `Field \`${path}\` does not match the expected type (${expected}).`
      : `Arguments do not match the expected type (${expected}).`,
    ...(path ? { field: path } : {}),
    expected,
    received: preview(value),
  });

  switch (validator.type) {
    case "any":
      return null;
    case "null":
      return value === null ? null : mismatch("null");
    case "string":
      return typeof value === "string" ? null : mismatch("string");
    case "boolean":
      return typeof value === "boolean" ? null : mismatch("boolean");
    case "number":
      // O JSON do Convex codifica NaN/Infinity como { "$float": base64 }.
      return typeof value === "number" ||
        (isPlainObject(value) && "$float" in value)
        ? null
        : mismatch("number");
    case "int64":
    case "bigint":
      return (typeof value === "number" && Number.isInteger(value)) ||
        (isPlainObject(value) && "$integer" in value)
        ? null
        : mismatch("int64");
    case "bytes":
      return isPlainObject(value) && "$bytes" in value ? null : mismatch("bytes");
    case "id":
      if (typeof value !== "string" || value.length === 0) {
        return mismatch(`Id<${validator.tableName}>`);
      }
      ids.push({ field: path, tables: [validator.tableName], value });
      return null;
    case "literal":
      return value === validator.value
        ? null
        : mismatch(JSON.stringify(validator.value));
    case "array": {
      if (!Array.isArray(value)) return mismatch(signatureOf(validator));
      for (let index = 0; index < value.length; index++) {
        const issue = check(validator.value, value[index], `${path}[${index}]`, ids);
        if (issue) return issue;
      }
      return null;
    }
    case "union": {
      // `v.union(v.id("a"), v.id("b"))` aceita ID de qualquer das tabelas,
      // então elas são coletadas juntas; se a união também aceita qualquer
      // string, a tabela do ID não importa.
      const idTables: string[] = [];
      let acceptsAnyString = false;
      for (const member of validator.value) {
        if (member.type === "id") idTables.push(member.tableName);
        if (member.type === "string" || member.type === "any") {
          acceptsAnyString = true;
        }
      }
      for (const member of validator.value) {
        const scratch: IdCheck[] = [];
        if (check(member, value, path, scratch) !== null) continue;
        if (member.type === "id") {
          if (!acceptsAnyString) {
            ids.push({ field: path, tables: idTables, value: value as string });
          }
        } else {
          ids.push(...scratch);
        }
        return null;
      }
      return mismatch(signatureOf(validator));
    }
    case "record": {
      if (!isPlainObject(value)) return mismatch(signatureOf(validator));
      for (const [key, entry] of Object.entries(value)) {
        const nested = path ? `${path}.${key}` : key;
        const keyIssue = check(validator.keys, key, nested, ids);
        if (keyIssue) return keyIssue;
        const valueIssue = check(validator.values, entry, nested, ids);
        if (valueIssue) return valueIssue;
      }
      return null;
    }
    case "object": {
      if (!isPlainObject(value)) return mismatch(signatureOf(validator));
      for (const [name, field] of Object.entries(validator.value)) {
        const nested = path ? `${path}.${name}` : name;
        const entry = value[name];
        if (entry === undefined) {
          if (field.optional) continue;
          return {
            message: `Object is missing the required field \`${nested}\`.`,
            field: nested,
            expected: signatureOf(field.fieldType),
            received: "undefined",
          };
        }
        const issue = check(field.fieldType, entry, nested, ids);
        if (issue) return issue;
      }
      for (const name of Object.keys(value)) {
        if (!(name in validator.value)) {
          const nested = path ? `${path}.${name}` : name;
          return {
            message: `Object contains extra field \`${nested}\` that is not in the validator.`,
            field: nested,
            expected: signatureOf(validator),
            received: preview(value[name]),
          };
        }
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Sugestões para caminhos inexistentes
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
    }
  }
  return previous[b.length]!;
}

/** Caminhos do catálogo mais próximos de um que não existe (typo, módulo errado). */
export function suggestPaths(
  requested: string,
  paths: readonly string[],
  limit = 3
): string[] {
  const [targetModule = "", targetName = ""] = requested.toLowerCase().split(":");
  const distance = (a: string, b: string) =>
    a === b ? 0 : levenshtein(a, b) / Math.max(a.length, b.length, 1);
  const scored: Array<{ path: string; score: number }> = [];
  for (const path of paths) {
    const [module = "", name = ""] = path.toLowerCase().split(":");
    const moduleScore = distance(targetModule, module);
    const nameScore = distance(targetName, name);
    // Ou módulo quase igual com nome plausível (typo na função), ou nome
    // exato num módulo próximo (typo/módulo errado).
    const closeName = moduleScore <= 0.25 && nameScore <= 0.5;
    const sameName = nameScore === 0 && moduleScore <= 0.6;
    if (closeName || sameName) scored.push({ path, score: moduleScore + nameScore });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((entry) => entry.path);
}

// ---------------------------------------------------------------------------
// Descrição legível dos argumentos (para `GET /api/v1/functions`)
// ---------------------------------------------------------------------------

/** Versão achatada de um validador, com enums explícitos. */
export type TypeDescriptor =
  | { type: "string" | "number" | "boolean" | "null" | "any" | "bytes" | "int64" }
  | { type: "id"; table: string }
  | { type: "literal"; value: string | number | boolean }
  | { type: "enum"; values: Array<string | number | boolean> }
  | { type: "array"; items: TypeDescriptor }
  | { type: "union"; options: TypeDescriptor[] }
  | { type: "record"; keys: TypeDescriptor; values: TypeDescriptor }
  | { type: "object"; fields: ArgDescriptor[] };

export type ArgDescriptor = TypeDescriptor & { name: string; required: boolean };

export function describe(validator: ValidatorJson): TypeDescriptor {
  switch (validator.type) {
    case "id":
      return { type: "id", table: validator.tableName };
    case "literal":
      return { type: "literal", value: validator.value };
    case "array":
      return { type: "array", items: describe(validator.value) };
    case "union": {
      const literals = validator.value.filter(
        (member): member is Extract<ValidatorJson, { type: "literal" }> =>
          member.type === "literal"
      );
      if (literals.length > 0 && literals.length === validator.value.length) {
        return { type: "enum", values: literals.map((member) => member.value) };
      }
      return { type: "union", options: validator.value.map(describe) };
    }
    case "record":
      return {
        type: "record",
        keys: describe(validator.keys),
        values: describe(validator.values),
      };
    case "object":
      return { type: "object", fields: describeFields(validator.value) };
    case "bigint":
      return { type: "int64" };
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "any":
    case "bytes":
    case "int64":
      return { type: validator.type };
  }
}

export function describeFields(
  fields: Record<string, { fieldType: ValidatorJson; optional: boolean }>
): ArgDescriptor[] {
  return Object.entries(fields).map(([name, field]) => ({
    name,
    required: !field.optional,
    ...describe(field.fieldType),
  }));
}

/** Lista de argumentos de uma função, ou `null` quando o validador não é um objeto legível. */
export function describeArgs(validator: ValidatorJson | null): ArgDescriptor[] | null {
  return validator && validator.type === "object" ? describeFields(validator.value) : null;
}
