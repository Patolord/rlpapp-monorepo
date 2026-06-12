import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

const DIA = 24 * 60 * 60 * 1000;

describe("fluxo financeiro", () => {
  test("conta a pagar: criar, aprovar e pagar", async () => {
    const t = setup();
    const asFinance = await withUser(t, {
      clerkId: "fin1",
      role: "operator",
      department: "financeiro",
    });

    const id = await asFinance.mutation(api.contasPagar.create, {
      descricao: "Aluguel",
      valor: 150000,
      dataVencimento: Date.now() + 7 * DIA,
      dataCompetencia: Date.now(),
    });

    await asFinance.mutation(api.contasPagar.aprovar, { id });
    let conta = await t.run(async (ctx) => ctx.db.get("contasPagar", id));
    expect(conta?.status).toBe("Aprovado");

    await asFinance.mutation(api.contasPagar.registrarPagamento, { id });
    conta = await t.run(async (ctx) => ctx.db.get("contasPagar", id));
    expect(conta?.status).toBe("Pago");

    // pagar duas vezes é bloqueado
    await expect(
      asFinance.mutation(api.contasPagar.registrarPagamento, { id })
    ).rejects.toThrow("Esta conta já foi paga");
  });

  test("conta a receber: recebimento parcial e total", async () => {
    const t = setup();
    const asFinance = await withUser(t, {
      clerkId: "fin1",
      role: "admin",
    });

    const id = await asFinance.mutation(api.contasReceber.create, {
      descricao: "Medição obra X",
      valor: 100000,
      dataVencimento: Date.now() + 30 * DIA,
      dataCompetencia: Date.now(),
      dataEmissao: Date.now(),
    });

    await asFinance.mutation(api.contasReceber.registrarRecebimento, {
      id,
      valorRecebido: 40000,
    });
    let conta = await t.run(async (ctx) => ctx.db.get("contasReceber", id));
    expect(conta?.status).toBe("Parcial");
    expect(conta?.valorRecebido).toBe(40000);

    await asFinance.mutation(api.contasReceber.registrarRecebimento, {
      id,
      valorRecebido: 60000,
    });
    conta = await t.run(async (ctx) => ctx.db.get("contasReceber", id));
    expect(conta?.status).toBe("Recebido");
    expect(conta?.valorRecebido).toBe(100000);
  });

  test("cron marca contas vencidas", async () => {
    const t = setup();
    const asFinance = await withUser(t, { clerkId: "fin1", role: "admin" });

    const vencida = await asFinance.mutation(api.contasPagar.create, {
      descricao: "Atrasada",
      valor: 1000,
      dataVencimento: Date.now() - DIA,
      dataCompetencia: Date.now() - 30 * DIA,
    });
    const futura = await asFinance.mutation(api.contasPagar.create, {
      descricao: "Futura",
      valor: 1000,
      dataVencimento: Date.now() + 30 * DIA,
      dataCompetencia: Date.now(),
    });

    await t.mutation(internal.crons.marcarContasVencidas, {});

    const contaVencida = await t.run(async (ctx) =>
      ctx.db.get("contasPagar", vencida)
    );
    const contaFutura = await t.run(async (ctx) =>
      ctx.db.get("contasPagar", futura)
    );
    expect(contaVencida?.status).toBe("Vencido");
    expect(contaFutura?.status).toBe("Pendente");
  });
});
