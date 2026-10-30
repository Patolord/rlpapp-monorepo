import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedPurchasing() {
  const t = setup();
  const purchasing = await withUser(t, {
    name: "Compras",
    clerkId: "purchasing",
    role: "operator",
    department: "compras",
  });
  return { t, purchasing };
}

describe("suppliers register", () => {
  test("creates a supplier with full identity, contact and commercial fields", async () => {
    const { purchasing } = await seedPurchasing();

    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Distribuidora XYZ",
      personType: "pj",
      legalName: "XYZ Comércio de Materiais LTDA",
      taxId: "11.222.333/0001-81",
      stateRegistration: "123.456.789.000",
      email: "vendas@xyz.com.br",
      phone: "(11) 4000-0000",
      website: "xyz.com.br",
      address: "Rua A, 100 - São Paulo/SP",
      paymentTerms: "28 DDL",
      defaultLeadTimeDays: 7,
      categories: ["Dutos", " Cobre "],
      notes: "Entrega própria",
    });

    const detail = await purchasing.query(api.suppliers.get, { supplierId });
    expect(detail).not.toBeNull();
    const supplier = detail!.supplier;
    expect(supplier.name).toBe("Distribuidora XYZ");
    expect(supplier.personType).toBe("pj");
    expect(supplier.legalName).toBe("XYZ Comércio de Materiais LTDA");
    expect(supplier.taxId).toBe("11222333000181");
    expect(supplier.stateRegistration).toBe("123.456.789.000");
    expect(supplier.email).toBe("vendas@xyz.com.br");
    expect(supplier.phone).toBe("(11) 4000-0000");
    expect(supplier.website).toBe("https://xyz.com.br");
    expect(supplier.address).toBe("Rua A, 100 - São Paulo/SP");
    expect(supplier.paymentTerms).toBe("28 DDL");
    expect(supplier.defaultLeadTimeDays).toBe(7);
    expect(supplier.categories).toEqual(["Dutos", "Cobre"]);
    expect(supplier.notes).toBe("Entrega própria");
    expect(supplier.active).toBe(true);
  });

  test("rejects an invalid CNPJ and a duplicated tax id", async () => {
    const { purchasing } = await seedPurchasing();

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Inválida",
        personType: "pj",
        taxId: "11.111.111/1111-11",
      })
    ).rejects.toThrow(/CNPJ inválido/);

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Curto",
        personType: "pj",
        taxId: "123",
      })
    ).rejects.toThrow(/14 dígitos/);

    await purchasing.mutation(api.suppliers.create, {
      name: "Primeira",
      personType: "pj",
      taxId: "11.222.333/0001-81",
    });
    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Segunda",
        personType: "pj",
        taxId: "11222333000181",
      })
    ).rejects.toThrow(/Já existe um fornecedor com este CNPJ\/CPF/);
  });

  test("validates the tax id even without a person type", async () => {
    const { purchasing } = await seedPurchasing();

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Sem tipo",
        taxId: "123",
      })
    ).rejects.toThrow(/11 \(CPF\) ou 14 \(CNPJ\)/);

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "CNPJ ruim sem tipo",
        taxId: "11.111.111/1111-11",
      })
    ).rejects.toThrow(/CNPJ inválido/);

    // CPF válido (dígitos verificadores corretos) é aceito e inferido como PF.
    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "CPF sem tipo",
      taxId: "529.982.247-25",
    });
    const detail = await purchasing.query(api.suppliers.get, { supplierId });
    expect(detail!.supplier.taxId).toBe("52998224725");
    expect(detail!.supplier.personType).toBeNull();

    await expect(
      purchasing.mutation(api.suppliers.update, {
        supplierId,
        taxId: "12345",
      })
    ).rejects.toThrow(/11 \(CPF\) ou 14 \(CNPJ\)/);
  });

  test("validates e-mail and lead time", async () => {
    const { purchasing } = await seedPurchasing();

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Email ruim",
        email: "nao-e-email",
      })
    ).rejects.toThrow(/E-mail inválido/);

    await expect(
      purchasing.mutation(api.suppliers.create, {
        name: "Prazo ruim",
        defaultLeadTimeDays: -1,
      })
    ).rejects.toThrow(/Prazo padrão/);
  });

  test("update changes, clears and validates fields", async () => {
    const { purchasing } = await seedPurchasing();
    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Fornecedor",
      personType: "pj",
      taxId: "11.222.333/0001-81",
      paymentTerms: "à vista",
      defaultLeadTimeDays: 3,
    });

    await purchasing.mutation(api.suppliers.update, {
      supplierId,
      legalName: "Fornecedor LTDA",
      paymentTerms: "30/60 DDL",
      defaultLeadTimeDays: null,
      website: "http://fornecedor.com",
    });
    let detail = await purchasing.query(api.suppliers.get, { supplierId });
    expect(detail!.supplier.legalName).toBe("Fornecedor LTDA");
    expect(detail!.supplier.paymentTerms).toBe("30/60 DDL");
    expect(detail!.supplier.defaultLeadTimeDays).toBeNull();
    expect(detail!.supplier.website).toBe("http://fornecedor.com");
    expect(detail!.supplier.taxId).toBe("11222333000181");

    // Switching to PF keeps the CNPJ only if it is cleared in the same call.
    await expect(
      purchasing.mutation(api.suppliers.update, {
        supplierId,
        personType: "pf",
      })
    ).rejects.toThrow(/CPF deve conter 11 dígitos/);

    await purchasing.mutation(api.suppliers.update, {
      supplierId,
      personType: "pf",
      taxId: null,
    });
    detail = await purchasing.query(api.suppliers.get, { supplierId });
    expect(detail!.supplier.personType).toBe("pf");
    expect(detail!.supplier.taxId).toBeNull();
  });

  test("list searches by legal name, category and tax id digits", async () => {
    const { purchasing } = await seedPurchasing();
    await purchasing.mutation(api.suppliers.create, {
      name: "Casa do Duto",
      legalName: "Ventilação Industrial LTDA",
      taxId: "11.222.333/0001-81",
      categories: ["Dutos"],
    });
    await purchasing.mutation(api.suppliers.create, {
      name: "Cobre & Cia",
      categories: ["Cobre"],
    });

    const byLegal = await purchasing.query(api.suppliers.list, {
      search: "ventilacao",
    });
    expect(byLegal.map((s) => s.name)).toEqual(["Casa do Duto"]);

    const byCategory = await purchasing.query(api.suppliers.list, {
      search: "cobre",
    });
    expect(byCategory.map((s) => s.name)).toEqual(["Cobre & Cia"]);

    const byTaxId = await purchasing.query(api.suppliers.list, {
      search: "11.222.333",
    });
    expect(byTaxId.map((s) => s.name)).toEqual(["Casa do Duto"]);
  });

  test("bulk import accepts the new columns and skips duplicated tax ids", async () => {
    const { purchasing } = await seedPurchasing();
    const result = await purchasing.mutation(api.suppliers.bulkCreate, {
      items: [
        {
          name: "Alpha",
          personType: "pj",
          taxId: "11.222.333/0001-81",
          email: "a@alpha.com",
          paymentTerms: "28 DDL",
          defaultLeadTimeDays: 5,
          contact: { name: "Ana", whatsapp: "5511999999999" },
        },
        {
          name: "Alpha Filial",
          personType: "pj",
          taxId: "11222333000181",
        },
        {
          name: "Beta",
          personType: "pj",
          taxId: "00.000.000/0000-00",
        },
      ],
    });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([
      { row: 3, message: "CNPJ inválido" },
    ]);

    const suppliers = await purchasing.query(api.suppliers.list, {});
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0]!.paymentTerms).toBe("28 DDL");
    expect(suppliers[0]!.defaultLeadTimeDays).toBe(5);
  });
});
