import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { ValidatorJson } from "./catalog";
import { argsToInputSchema, describeValidator } from "./convex-schema";

const createMedicaoArgs: ValidatorJson = {
  type: "object",
  value: {
    contractId: { fieldType: { type: "id", tableName: "contracts" }, optional: false },
    description: { fieldType: { type: "string" }, optional: true },
    basis: {
      fieldType: {
        type: "union",
        value: [
          { type: "literal", value: "percent" },
          { type: "literal", value: "amount" },
        ],
      },
      optional: false,
    },
    percent: { fieldType: { type: "number" }, optional: true },
    amountCents: { fieldType: { type: "number" }, optional: true },
    referenceDate: { fieldType: { type: "number" }, optional: false },
    now: { fieldType: { type: "number" }, optional: false },
  },
};

describe("validador Convex → zod", () => {
  test("gera schema com enums, opcionais, ids e omite argumentos do servidor", () => {
    const schema = argsToInputSchema(createMedicaoArgs, { omit: ["now"] });
    expect(schema.shape).not.toHaveProperty("now");
    expect(
      schema.safeParse({
        contractId: "jd7contract",
        basis: "percent",
        percent: 30,
        referenceDate: 1_700_000_000_000,
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({ contractId: "jd7contract", basis: "weight", referenceDate: 1 })
        .success
    ).toBe(false);
    expect(schema.safeParse({ basis: "amount", referenceDate: 1 }).success).toBe(false);

    // O que os clientes MCP recebem é o JSON Schema; as descrições precisam
    // sobreviver inclusive aos campos opcionais.
    const json = z.toJSONSchema(schema) as {
      properties: Record<string, { description?: string }>;
      required?: string[];
    };
    expect(json.required).toEqual(["contractId", "basis", "referenceDate"]);
    expect(json.properties.referenceDate?.description).toContain("epoch");
    expect(json.properties.amountCents?.description).toContain("BRL cents");
    expect(json.properties.contractId?.description).toContain("`contracts`");
  });

  test("dicas por nome respeitam o tipo do campo", () => {
    const schema = argsToInputSchema({
      type: "object",
      value: { date: { fieldType: { type: "string" }, optional: false } },
    });
    const json = z.toJSONSchema(schema) as {
      properties: Record<string, { description?: string }>;
    };
    expect(json.properties.date?.description).toContain("YYYY-MM-DD");
  });

  test("validador ausente vira objeto livre", () => {
    const schema = argsToInputSchema(null);
    expect(schema.safeParse({ anything: 1 }).success).toBe(true);
  });

  test("describeValidator produz assinatura compacta", () => {
    expect(describeValidator(createMedicaoArgs)).toBe(
      '{ contractId: Id<contracts>, description?: string, basis: "percent" | "amount", percent?: number, amountCents?: number, referenceDate: number, now: number }'
    );
  });
});
