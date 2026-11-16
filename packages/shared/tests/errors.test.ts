import { describe, expect, it } from "vitest";
import { appErrorData, errorCode, errorMessage } from "../src/errors";

// Forma de um ConvexError no cliente: um Error com `data`.
function convexError(data: unknown): Error {
  return Object.assign(new Error("ConvexError"), { data });
}

describe("errorMessage", () => {
  it.each([
    ["structured data", convexError({ code: "NOT_FOUND", message: "Obra não encontrada" }), "Obra não encontrada"],
    ["string data", convexError("Período inválido"), "Período inválido"],
    [
      "plain Error in development",
      new Error("[Request ID: abc] Server Error\nUncaught Error: Kit não encontrado\n    at handler"),
      "Kit não encontrado",
    ],
    ["plain Error without prefix", new Error("Falhou"), "Falhou"],
    ["structured data without message", convexError({ code: "X" }), "ConvexError"],
    ["non-error value", 42, "fallback"],
  ])("reads %s", (_case, error, expected) => {
    expect(errorMessage(error, "fallback")).toBe(expected);
  });
});

describe("appErrorData / errorCode", () => {
  it("returns code and extra fields of a structured error", () => {
    const error = convexError({ code: "FORBIDDEN", message: "Sem acesso", permission: "obras.read" });
    expect(appErrorData(error)).toEqual({ code: "FORBIDDEN", message: "Sem acesso", permission: "obras.read" });
    expect(errorCode(error)).toBe("FORBIDDEN");
  });

  it("is null for text data and plain errors", () => {
    expect(appErrorData(convexError("texto"))).toBeNull();
    expect(errorCode(new Error("x"))).toBeNull();
  });
});
