import { z } from "zod";

import type { ValidatorField, ValidatorJson } from "./catalog";

/**
 * Converte o JSON de validadores do Convex (`exportArgs()`, servido pelo
 * catálogo) em schemas zod usados como `inputSchema` das ferramentas MCP, e em
 * assinaturas compactas legíveis para a ferramenta `search_functions`.
 */

/**
 * Dicas por nome de campo válidas para a API inteira. Validadores Convex têm
 * tipo mas não prosa, e agentes acertam muito mais quando um `number` vem
 * rotulado como "epoch em milissegundos". A dica só se aplica quando o tipo do
 * campo bate (`date` é número na maioria dos módulos, mas string no ponto).
 */
const COMMON_FIELD_HINTS: Array<{
  names: readonly string[];
  type: ValidatorJson["type"] | "*";
  hint: string;
}> = [
  {
    names: [
      "date",
      "startDate",
      "endDate",
      "referenceDate",
      "occurredAt",
      "validUntil",
      "signedAt",
      "hiredAt",
      "deadline",
      "scheduledDate",
      "completedAt",
      "createdAt",
    ],
    type: "number",
    hint: "Unix epoch in milliseconds (e.g. Date.now()).",
  },
  {
    names: ["date", "from", "to"],
    type: "string",
    hint: "Calendar date as YYYY-MM-DD.",
  },
  { names: ["now"], type: "number", hint: "Current time as Unix epoch ms." },
  {
    names: [
      "amountCents",
      "unitPriceCents",
      "estimatedUnitPriceCents",
      "baseSalaryCents",
      "dailyTransitCents",
      "contractTotalCents",
    ],
    type: "number",
    hint: "Amount in BRL cents (integer, e.g. R$ 12,50 = 1250).",
  },
  { names: ["percent"], type: "number", hint: "Percentage 0-100." },
  { names: ["year"], type: "number", hint: "Four-digit year, e.g. 2026." },
  {
    names: ["month", "paymentMonth"],
    type: "number",
    hint: "Month number 1-12.",
  },
  {
    names: ["search", "term"],
    type: "string",
    hint: "Case-insensitive free-text filter.",
  },
  { names: ["limit"], type: "number", hint: "Maximum number of rows to return." },
  {
    names: ["paginationOpts"],
    type: "*",
    hint: 'Pagination: { "numItems": 50, "cursor": null } for the first page; pass the returned continueCursor as cursor for the next page.',
  },
  {
    names: ["legacyNumber"],
    type: "number",
    hint: "Internal obra number used by the office.",
  },
  {
    names: ["taxId"],
    type: "string",
    hint: "CPF or CNPJ (digits only or formatted).",
  },
  {
    names: ["slug"],
    type: "string",
    hint: "URL-friendly identifier shown in the app address bar.",
  },
];

function idHint(tableName: string): string {
  return `Convex document id of a \`${tableName}\` row (as returned by list/get tools).`;
}

function commonHint(name: string, type: ValidatorJson["type"]): string | undefined {
  return COMMON_FIELD_HINTS.find(
    (rule) => rule.names.includes(name) && (rule.type === "*" || rule.type === type)
  )?.hint;
}

export interface ToZodOptions {
  /** Descrições por campo que sobrepõem as dicas compartilhadas. */
  fieldDescriptions?: Record<string, string>;
  /** Campos que o servidor preenche sozinho; saem do schema de entrada. */
  omit?: readonly string[];
}

export function validatorToZod(validator: ValidatorJson): z.ZodType {
  switch (validator.type) {
    case "string":
      return z.string();
    case "number":
    case "int64":
    case "bigint":
      return z.number();
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    case "any":
      return z.unknown();
    case "bytes":
      return z.string().describe("Base64-encoded bytes.");
    case "id":
      return z.string().min(1).describe(idHint(validator.tableName));
    case "literal":
      return z.literal(validator.value);
    case "array":
      return z.array(validatorToZod(validator.value));
    case "union": {
      const literals = validator.value.filter(
        (member): member is Extract<ValidatorJson, { type: "literal" }> =>
          member.type === "literal" && typeof member.value === "string"
      );
      if (literals.length === validator.value.length && literals.length > 0) {
        return z.enum(
          literals.map((member) => member.value as string) as [string, ...string[]]
        );
      }
      const members = validator.value.map((member) => validatorToZod(member));
      if (members.length === 1) return members[0] as z.ZodType;
      return z.union(members as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
    case "record":
      return z.record(z.string(), validatorToZod(validator.values));
    case "object":
      return z.object(objectToShape(validator.value));
  }
}

export function objectToShape(
  fields: Record<string, ValidatorField>,
  options: ToZodOptions = {}
): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  const omit = new Set(options.omit ?? []);
  for (const [name, field] of Object.entries(fields)) {
    if (omit.has(name)) continue;
    let schema = validatorToZod(field.fieldType);
    const description =
      options.fieldDescriptions?.[name] ??
      commonHint(name, field.fieldType.type) ??
      (field.fieldType.type === "id" ? idHint(field.fieldType.tableName) : undefined);
    if (description) schema = schema.describe(description);
    shape[name] = field.optional ? schema.optional() : schema;
  }
  return shape;
}

/**
 * Schema de entrada de uma ferramenta a partir do validador da função.
 * Validador ausente (actions em módulos Node) ou não-objeto → objeto livre.
 */
export function argsToInputSchema(
  validator: ValidatorJson | null,
  options: ToZodOptions = {}
): z.ZodObject<Record<string, z.ZodType>> {
  if (!validator || validator.type !== "object") {
    return z.object({}).catchall(z.unknown()) as unknown as z.ZodObject<
      Record<string, z.ZodType>
    >;
  }
  return z.object(objectToShape(validator.value, options));
}

/** Assinatura compacta estilo TypeScript, ex.: `{ id: Id<tasks>, status: "a" | "b" }`. */
export function describeValidator(validator: ValidatorJson): string {
  switch (validator.type) {
    case "id":
      return `Id<${validator.tableName}>`;
    case "literal":
      return JSON.stringify(validator.value);
    case "array":
      return `${describeValidator(validator.value)}[]`;
    case "union":
      return validator.value.map(describeValidator).join(" | ");
    case "record":
      return `Record<${describeValidator(validator.keys)}, ${describeValidator(validator.values)}>`;
    case "object": {
      const entries = Object.entries(validator.value).map(
        ([name, field]) =>
          `${name}${field.optional ? "?" : ""}: ${describeValidator(field.fieldType)}`
      );
      return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
    }
    case "bigint":
      return "int64";
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "any":
    case "bytes":
    case "int64":
      return validator.type;
  }
}
