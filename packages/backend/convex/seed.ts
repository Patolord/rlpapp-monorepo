import { internalMutation } from "./_generated/server";

const SEED_USER_ID = "seed-user";

function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // ──────────────────────────────────────────────
    // 1. PRODUCTS
    // ──────────────────────────────────────────────
    const productsData = [
      { name: "Cimento CP-II 50kg", description: "Cimento Portland composto", unit: "saco", minQuantity: 50 },
      { name: "Areia Média m³", description: "Areia média para construção", unit: "m³", minQuantity: 10 },
      { name: "Brita 1 m³", description: "Brita graduada nº 1", unit: "m³", minQuantity: 10 },
      { name: "Vergalhão CA-50 10mm", description: "Barra de aço 12m", unit: "barra", minQuantity: 100 },
      { name: "Vergalhão CA-50 8mm", description: "Barra de aço 12m", unit: "barra", minQuantity: 100 },
      { name: "Tijolo Cerâmico 9x19x19", description: "Tijolo 6 furos", unit: "milheiro", minQuantity: 5 },
      { name: "Tubo PVC 100mm 6m", description: "Tubo esgoto", unit: "barra", minQuantity: 20 },
      { name: "Fio Elétrico 2.5mm²", description: "Rolo 100m", unit: "rolo", minQuantity: 10 },
      { name: "Tinta Acrílica 18L", description: "Tinta branca para parede", unit: "lata", minQuantity: 5 },
      { name: "Argamassa AC-III 20kg", description: "Argamassa colante", unit: "saco", minQuantity: 30 },
      { name: "Prego 17x27 1kg", description: "Prego com cabeça", unit: "kg", minQuantity: 20 },
      { name: "Arame Recozido 18 1kg", description: "Arame para amarração", unit: "kg", minQuantity: 15 },
      { name: "Mangueira Cristal 3/4", description: "Rolo 50m", unit: "rolo", minQuantity: 5 },
      { name: "Chapa Compensado 15mm", description: "Compensado naval 2.20x1.60", unit: "chapa", minQuantity: 10 },
      { name: "Bloco de Concreto 14x19x39", description: "Bloco estrutural", unit: "un", minQuantity: 200 },
    ];

    const productIds = [];
    for (const p of productsData) {
      const id = await ctx.db.insert("products", { ...p, isActive: true });
      productIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 2. SUPPLIERS
    // ──────────────────────────────────────────────
    const suppliersData = [
      { name: "Votorantim Cimentos", contactName: "Carlos Silva", email: "vendas@votorantim.com.br", phone: "(11) 3456-7890", address: "Av. Industrial, 1500 - SP" },
      { name: "Gerdau Aços", contactName: "Ana Costa", email: "comercial@gerdau.com.br", phone: "(51) 3323-4500", address: "Av. Farrapos, 1800 - RS" },
      { name: "Tigre Tubos", contactName: "Roberto Lima", email: "vendas@tigre.com.br", phone: "(47) 3441-5100", address: "R. Xavantes, 54 - SC" },
      { name: "Suvinil Tintas", contactName: "Marina Souza", email: "atendimento@suvinil.com.br", phone: "(11) 2101-3030", address: "R. do Manifesto, 2313 - SP" },
      { name: "Quartzolit", contactName: "Pedro Santos", email: "vendas@quartzolit.com.br", phone: "(11) 4133-0100", address: "R. Haddock Lobo, 337 - SP" },
      { name: "Madeireira São Paulo", contactName: "João Pereira", email: "contato@madeiraspsp.com.br", phone: "(11) 2222-3333", address: "R. da Madeira, 100 - SP" },
      { name: "Elétrica Nacional", contactName: "Fernanda Oliveira", email: "vendas@eletricanacional.com.br", phone: "(21) 3333-4444", address: "Av. Brasil, 5000 - RJ" },
      { name: "Areeiro Bom Jesus", contactName: "Marcos Almeida", email: "vendas@areeirobomjesus.com.br", phone: "(11) 4444-5555", address: "Rod. Raposo Tavares km 30 - SP" },
    ];

    const supplierIds = [];
    for (const s of suppliersData) {
      const id = await ctx.db.insert("suppliers", { ...s, isActive: true });
      supplierIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 3. SITES
    // ──────────────────────────────────────────────
    const sitesData = [
      { name: "Obra Alphaville", address: "Al. Tocantins, 350 - Barueri/SP", responsibleName: "Eng. Ricardo", responsiblePhone: "(11) 98765-4321" },
      { name: "Obra Vila Olímpia", address: "R. Funchal, 200 - São Paulo/SP", responsibleName: "Eng. Patrícia", responsiblePhone: "(11) 97654-3210" },
      { name: "Obra Campinas", address: "Av. Norte-Sul, 1200 - Campinas/SP", responsibleName: "Eng. Marcos", responsiblePhone: "(19) 99876-5432" },
      { name: "Depósito Central", address: "R. dos Armazéns, 50 - Osasco/SP", responsibleName: "Gerente Fábio", responsiblePhone: "(11) 96543-2100" },
    ];

    const siteIds = [];
    for (const s of sitesData) {
      const id = await ctx.db.insert("sites", { ...s, isActive: true });
      siteIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 4. CLIENTES
    // ──────────────────────────────────────────────
    const clientesData = [
      { nome: "Construtora Horizonte Ltda", email: "financeiro@horizonte.com.br", phone: "(11) 3111-2222", documento: "12.345.678/0001-90", endereco: "Av. Paulista, 1000 - SP" },
      { nome: "Incorporadora Sunset S/A", email: "contas@sunset.com.br", phone: "(11) 3222-3333", documento: "23.456.789/0001-01", endereco: "R. Faria Lima, 500 - SP" },
      { nome: "Empreiteira Delta", email: "pagamentos@delta.eng.br", phone: "(21) 3333-4444", documento: "34.567.890/0001-12", endereco: "Av. Rio Branco, 200 - RJ" },
      { nome: "Prefeitura Municipal de Campinas", email: "licitacoes@campinas.sp.gov.br", phone: "(19) 3236-5000", documento: "51.885.242/0001-40", endereco: "Av. Anchieta, 200 - Campinas/SP" },
      { nome: "Condomínio Parque das Flores", email: "sindico@parqueflores.com.br", phone: "(11) 4555-6666", documento: "45.678.901/0001-23", endereco: "R. das Rosas, 150 - SP" },
      { nome: "Shopping Center Norte", email: "engenharia@centernorte.com.br", phone: "(11) 2277-8800", documento: "56.789.012/0001-34", endereco: "Av. Otto Baumgart, 500 - SP" },
      { nome: "Hospital São Lucas", email: "infra@saolucas.org.br", phone: "(11) 3088-0000", documento: "67.890.123/0001-45", endereco: "R. Dr. Arnaldo, 450 - SP" },
      { nome: "Universidade Estadual", email: "obras@uesp.edu.br", phone: "(11) 5576-4000", documento: "78.901.234/0001-56", endereco: "Cidade Universitária - SP" },
    ];

    const clienteIds = [];
    for (const c of clientesData) {
      const id = await ctx.db.insert("clientes", { ...c, isActive: true });
      clienteIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 5. CONTAS BANCÁRIAS
    // ──────────────────────────────────────────────
    const contasBancariasData = [
      { nome: "Conta Principal", banco: "Itaú", agencia: "0123", conta: "45678-9", tipo: "corrente" as const, saldoInicial: 50000000 },
      { nome: "Conta Operacional", banco: "Bradesco", agencia: "0456", conta: "12345-6", tipo: "corrente" as const, saldoInicial: 15000000 },
      { nome: "Poupança Reserva", banco: "Caixa", agencia: "0789", conta: "98765-4", tipo: "poupanca" as const, saldoInicial: 30000000 },
    ];

    const contaBancariaIds = [];
    for (const cb of contasBancariasData) {
      const id = await ctx.db.insert("contasBancarias", { ...cb, isActive: true });
      contaBancariaIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 6. CATEGORIAS FINANCEIRAS
    // ──────────────────────────────────────────────
    const categoriasData = [
      { nome: "Materiais de Construção", tipo: "despesa" as const, cor: "#ef4444" },
      { nome: "Mão de Obra", tipo: "despesa" as const, cor: "#f97316" },
      { nome: "Aluguel e Infraestrutura", tipo: "despesa" as const, cor: "#a855f7" },
      { nome: "Equipamentos", tipo: "despesa" as const, cor: "#3b82f6" },
      { nome: "Energia e Água", tipo: "despesa" as const, cor: "#eab308" },
      { nome: "Transporte e Frete", tipo: "despesa" as const, cor: "#6366f1" },
      { nome: "Impostos e Taxas", tipo: "despesa" as const, cor: "#dc2626" },
      { nome: "Serviços de Engenharia", tipo: "receita" as const, cor: "#10b981" },
      { nome: "Empreitada", tipo: "receita" as const, cor: "#06b6d4" },
      { nome: "Consultoria", tipo: "receita" as const, cor: "#8b5cf6" },
      { nome: "Venda de Material Excedente", tipo: "receita" as const, cor: "#14b8a6" },
      { nome: "Manutenção Predial", tipo: "ambos" as const, cor: "#f59e0b" },
    ];

    const categoriaIds = [];
    for (const cat of categoriasData) {
      const id = await ctx.db.insert("categoriasFinanceiras", { ...cat, isActive: true });
      categoriaIds.push(id);
    }

    const catDespesa = categoriaIds.slice(0, 7);
    const catReceita = categoriaIds.slice(7, 11);

    // ──────────────────────────────────────────────
    // 7. CONTAS A PAGAR
    // ──────────────────────────────────────────────
    type ContaPagarStatus = "Pendente" | "Aprovado" | "Pago" | "Vencido" | "Cancelado";
    type FormaPagamento = "pix" | "ted" | "boleto" | "dinheiro" | "cartao";
    const formasPgto: FormaPagamento[] = ["pix", "ted", "boleto", "dinheiro", "cartao"];

    const contasPagarData: {
      descricao: string;
      valor: number;
      daysOffset: number;
      status: ContaPagarStatus;
      catIdx: number;
      fornIdx: number;
    }[] = [
      // Pagas (passado)
      { descricao: "Cimento CP-II - Lote Janeiro", valor: 1250000, daysOffset: -60, status: "Pago", catIdx: 0, fornIdx: 0 },
      { descricao: "Vergalhões CA-50 - Obra Alphaville", valor: 3450000, daysOffset: -55, status: "Pago", catIdx: 0, fornIdx: 1 },
      { descricao: "Folha de pagamento - Janeiro", valor: 8500000, daysOffset: -50, status: "Pago", catIdx: 1, fornIdx: 0 },
      { descricao: "Aluguel galpão Osasco - Jan", valor: 1200000, daysOffset: -45, status: "Pago", catIdx: 2, fornIdx: 5 },
      { descricao: "Energia elétrica - Jan", valor: 350000, daysOffset: -42, status: "Pago", catIdx: 4, fornIdx: 6 },
      { descricao: "Tubos PVC - Obra Vila Olímpia", valor: 780000, daysOffset: -40, status: "Pago", catIdx: 0, fornIdx: 2 },
      { descricao: "Tinta acrílica - Acabamento", valor: 420000, daysOffset: -38, status: "Pago", catIdx: 0, fornIdx: 3 },
      { descricao: "Frete materiais - Campinas", valor: 185000, daysOffset: -35, status: "Pago", catIdx: 5, fornIdx: 7 },
      { descricao: "Folha de pagamento - Fevereiro", valor: 8750000, daysOffset: -30, status: "Pago", catIdx: 1, fornIdx: 0 },
      { descricao: "Aluguel galpão Osasco - Fev", valor: 1200000, daysOffset: -28, status: "Pago", catIdx: 2, fornIdx: 5 },
      { descricao: "Areia e Brita - Obra Campinas", valor: 560000, daysOffset: -25, status: "Pago", catIdx: 0, fornIdx: 7 },
      { descricao: "Argamassa AC-III - Lote Março", valor: 340000, daysOffset: -20, status: "Pago", catIdx: 0, fornIdx: 4 },
      { descricao: "Aluguel betoneira - Março", valor: 450000, daysOffset: -18, status: "Pago", catIdx: 3, fornIdx: 5 },
      { descricao: "INSS competência Fev", valor: 2100000, daysOffset: -15, status: "Pago", catIdx: 6, fornIdx: 0 },
      { descricao: "Energia elétrica - Fev", valor: 380000, daysOffset: -12, status: "Pago", catIdx: 4, fornIdx: 6 },
      // Vencidas
      { descricao: "Aluguel galpão Osasco - Mar", valor: 1200000, daysOffset: -10, status: "Vencido", catIdx: 2, fornIdx: 5 },
      { descricao: "Folha de pagamento - Março", valor: 9000000, daysOffset: -8, status: "Vencido", catIdx: 1, fornIdx: 0 },
      { descricao: "Frete materiais - Alphaville", valor: 220000, daysOffset: -5, status: "Vencido", catIdx: 5, fornIdx: 7 },
      // Pendentes / Aprovadas
      { descricao: "Cimento CP-II - Lote Abril", valor: 1380000, daysOffset: 2, status: "Pendente", catIdx: 0, fornIdx: 0 },
      { descricao: "Madeira compensado - Formas", valor: 670000, daysOffset: 3, status: "Aprovado", catIdx: 0, fornIdx: 5 },
      { descricao: "Vergalhões CA-50 - Obra Campinas", valor: 2800000, daysOffset: 5, status: "Pendente", catIdx: 0, fornIdx: 1 },
      { descricao: "FGTS competência Mar", valor: 1800000, daysOffset: 7, status: "Aprovado", catIdx: 6, fornIdx: 0 },
      { descricao: "Energia elétrica - Março", valor: 410000, daysOffset: 10, status: "Pendente", catIdx: 4, fornIdx: 6 },
      { descricao: "Aluguel galpão Osasco - Abr", valor: 1200000, daysOffset: 15, status: "Pendente", catIdx: 2, fornIdx: 5 },
      { descricao: "Blocos de concreto - Obra VL Olímpia", valor: 520000, daysOffset: 18, status: "Pendente", catIdx: 0, fornIdx: 7 },
      { descricao: "Folha de pagamento - Abril", valor: 9200000, daysOffset: 25, status: "Pendente", catIdx: 1, fornIdx: 0 },
      // Cancelada
      { descricao: "Pedido cancelado - Tigre", valor: 150000, daysOffset: -3, status: "Cancelado", catIdx: 0, fornIdx: 2 },
    ];

    const contaPagarIds = [];
    for (const cp of contasPagarData) {
      const vencimento = cp.daysOffset >= 0 ? daysFromNow(cp.daysOffset) : daysAgo(-cp.daysOffset);
      const id = await ctx.db.insert("contasPagar", {
        descricao: cp.descricao,
        valor: cp.valor,
        dataVencimento: vencimento,
        dataPagamento: cp.status === "Pago" ? vencimento - 2 * 24 * 60 * 60 * 1000 : undefined,
        dataCompetencia: vencimento,
        status: cp.status,
        categoriaId: catDespesa[cp.catIdx % catDespesa.length],
        fornecedorId: supplierIds[cp.fornIdx % supplierIds.length],
        contaBancariaId: pick(contaBancariaIds),
        formaPagamento: pick(formasPgto),
        observacoes: cp.status === "Cancelado" ? "Cancelado: Pedido duplicado" : undefined,
        userId: SEED_USER_ID,
        createdAt: vencimento - 10 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
      contaPagarIds.push(id);
    }

    // ──────────────────────────────────────────────
    // 8. CONTAS A RECEBER
    // ──────────────────────────────────────────────
    type ContaReceberStatus = "Emitido" | "Parcial" | "Recebido" | "Vencido" | "Cancelado";

    const contasReceberData: {
      descricao: string;
      valor: number;
      valorRecebido: number;
      daysOffset: number;
      status: ContaReceberStatus;
      catIdx: number;
      clienteIdx: number;
    }[] = [
      // Recebidos
      { descricao: "Medição #1 Obra Alphaville", valor: 15000000, valorRecebido: 15000000, daysOffset: -55, status: "Recebido", catIdx: 0, clienteIdx: 0 },
      { descricao: "Consultoria estrutural - Sunset", valor: 5000000, valorRecebido: 5000000, daysOffset: -50, status: "Recebido", catIdx: 2, clienteIdx: 1 },
      { descricao: "Medição #1 Obra Vila Olímpia", valor: 12000000, valorRecebido: 12000000, daysOffset: -40, status: "Recebido", catIdx: 0, clienteIdx: 1 },
      { descricao: "Empreitada piso - Shopping", valor: 8000000, valorRecebido: 8000000, daysOffset: -35, status: "Recebido", catIdx: 1, clienteIdx: 5 },
      { descricao: "Medição #2 Obra Alphaville", valor: 18000000, valorRecebido: 18000000, daysOffset: -25, status: "Recebido", catIdx: 0, clienteIdx: 0 },
      { descricao: "Manutenção predial - Condomínio", valor: 3500000, valorRecebido: 3500000, daysOffset: -20, status: "Recebido", catIdx: 3, clienteIdx: 4 },
      { descricao: "Venda material excedente - Aço", valor: 900000, valorRecebido: 900000, daysOffset: -15, status: "Recebido", catIdx: 3, clienteIdx: 2 },
      { descricao: "Medição #2 Obra Vila Olímpia", valor: 14000000, valorRecebido: 14000000, daysOffset: -10, status: "Recebido", catIdx: 0, clienteIdx: 1 },
      // Parciais
      { descricao: "Empreitada elétrica - Hospital", valor: 6000000, valorRecebido: 3000000, daysOffset: -8, status: "Parcial", catIdx: 1, clienteIdx: 6 },
      { descricao: "Consultoria fundações - Universidade", valor: 4000000, valorRecebido: 2000000, daysOffset: -5, status: "Parcial", catIdx: 2, clienteIdx: 7 },
      // Vencidos
      { descricao: "Medição #1 Obra Campinas", valor: 10000000, valorRecebido: 0, daysOffset: -12, status: "Vencido", catIdx: 0, clienteIdx: 3 },
      { descricao: "Reforma escritório - Delta", valor: 2500000, valorRecebido: 0, daysOffset: -7, status: "Vencido", catIdx: 0, clienteIdx: 2 },
      // Emitidos (a vencer)
      { descricao: "Medição #3 Obra Alphaville", valor: 20000000, valorRecebido: 0, daysOffset: 3, status: "Emitido", catIdx: 0, clienteIdx: 0 },
      { descricao: "Empreitada hidráulica - Shopping", valor: 7500000, valorRecebido: 0, daysOffset: 5, status: "Emitido", catIdx: 1, clienteIdx: 5 },
      { descricao: "Medição #3 Obra Vila Olímpia", valor: 16000000, valorRecebido: 0, daysOffset: 10, status: "Emitido", catIdx: 0, clienteIdx: 1 },
      { descricao: "Manutenção predial - Hospital", valor: 4500000, valorRecebido: 0, daysOffset: 15, status: "Emitido", catIdx: 3, clienteIdx: 6 },
      { descricao: "Medição #2 Obra Campinas", valor: 12000000, valorRecebido: 0, daysOffset: 20, status: "Emitido", catIdx: 0, clienteIdx: 3 },
      { descricao: "Consultoria solo - Sunset", valor: 3000000, valorRecebido: 0, daysOffset: 25, status: "Emitido", catIdx: 2, clienteIdx: 1 },
      // Cancelado
      { descricao: "Proposta rejeitada - Condomínio", valor: 1500000, valorRecebido: 0, daysOffset: -3, status: "Cancelado", catIdx: 0, clienteIdx: 4 },
    ];

    const contaReceberId = [];
    for (const cr of contasReceberData) {
      const vencimento = cr.daysOffset >= 0 ? daysFromNow(cr.daysOffset) : daysAgo(-cr.daysOffset);
      const emissao = vencimento - 15 * 24 * 60 * 60 * 1000;
      const id = await ctx.db.insert("contasReceber", {
        descricao: cr.descricao,
        valor: cr.valor,
        valorRecebido: cr.valorRecebido,
        dataVencimento: vencimento,
        dataRecebimento: cr.status === "Recebido" ? vencimento - 1 * 24 * 60 * 60 * 1000 : undefined,
        dataCompetencia: vencimento,
        dataEmissao: emissao,
        status: cr.status,
        categoriaId: catReceita[cr.catIdx % catReceita.length],
        clienteId: clienteIds[cr.clienteIdx % clienteIds.length],
        contaBancariaId: pick(contaBancariaIds),
        formaPagamento: pick(formasPgto),
        notaFiscal: `NF-${Math.floor(1000 + Math.random() * 9000)}`,
        observacoes: cr.status === "Cancelado" ? "Cancelado: proposta não aprovada pelo cliente" : undefined,
        userId: SEED_USER_ID,
        createdAt: emissao,
        updatedAt: Date.now(),
      });
      contaReceberId.push(id);
    }

    // ──────────────────────────────────────────────
    // 9. TRANSAÇÕES BANCÁRIAS + CONCILIAÇÕES
    // ──────────────────────────────────────────────
    // Transações conciliadas (matching contas pagas)
    for (let i = 0; i < 10; i++) {
      const contaBancId = pick(contaBancariaIds);
      const valor = contasPagarData[i].valor;
      const data = daysAgo(60 - i * 5);

      const tId = await ctx.db.insert("transacoesBancarias", {
        contaBancariaId: contaBancId,
        data,
        descricao: `DÉB - ${contasPagarData[i].descricao.substring(0, 40)}`,
        valor,
        tipo: "debito",
        conciliacaoStatus: "conciliado",
        userId: SEED_USER_ID,
        createdAt: data,
      });

      await ctx.db.insert("conciliacoes", {
        transacaoBancariaId: tId,
        contaPagarId: contaPagarIds[i],
        userId: SEED_USER_ID,
        createdAt: data,
      });
    }

    // Transações conciliadas (matching contas recebidas)
    for (let i = 0; i < 6; i++) {
      const contaBancId = pick(contaBancariaIds);
      const valor = contasReceberData[i].valor;
      const data = daysAgo(55 - i * 8);

      const tId = await ctx.db.insert("transacoesBancarias", {
        contaBancariaId: contaBancId,
        data,
        descricao: `CRÉD - ${contasReceberData[i].descricao.substring(0, 40)}`,
        valor,
        tipo: "credito",
        conciliacaoStatus: "conciliado",
        userId: SEED_USER_ID,
        createdAt: data,
      });

      await ctx.db.insert("conciliacoes", {
        transacaoBancariaId: tId,
        contaReceberId: contaReceberId[i],
        userId: SEED_USER_ID,
        createdAt: data,
      });
    }

    // Transações pendentes (não conciliadas ainda)
    const pendentesData = [
      { desc: "DÉB - TAR MANUT CONTA", valor: 4500, tipo: "debito" as const, daysAgo: 3 },
      { desc: "DÉB - PGTO BOLETO CEMIG", valor: 380000, tipo: "debito" as const, daysAgo: 4 },
      { desc: "CRÉD - TED RECEBIDO 045.678", valor: 6000000, tipo: "credito" as const, daysAgo: 5 },
      { desc: "DÉB - PIX ENVIADO JOAO SILVA", valor: 150000, tipo: "debito" as const, daysAgo: 2 },
      { desc: "CRÉD - PIX RECEBIDO CONSTRUTORA HOR", valor: 20000000, tipo: "credito" as const, daysAgo: 1 },
      { desc: "DÉB - PGTO BOLETO VOTORANTIM", valor: 1380000, tipo: "debito" as const, daysAgo: 2 },
      { desc: "CRÉD - DEP CHEQUE 003456", valor: 3500000, tipo: "credito" as const, daysAgo: 6 },
      { desc: "DÉB - IOF S/OPER CRÉD", valor: 12000, tipo: "debito" as const, daysAgo: 7 },
      { desc: "CRÉD - TED RECEBIDO SUNSET", valor: 16000000, tipo: "credito" as const, daysAgo: 3 },
      { desc: "DÉB - PGTO GPS INSS", valor: 2100000, tipo: "debito" as const, daysAgo: 5 },
      { desc: "DÉB - PGTO FGTS", valor: 1800000, tipo: "debito" as const, daysAgo: 5 },
      { desc: "CRÉD - ESTORNO DUPLICIDADE", valor: 150000, tipo: "credito" as const, daysAgo: 1 },
    ];

    for (const t of pendentesData) {
      const data = daysAgo(t.daysAgo);
      await ctx.db.insert("transacoesBancarias", {
        contaBancariaId: pick(contaBancariaIds),
        data,
        descricao: t.desc,
        valor: t.valor,
        tipo: t.tipo,
        conciliacaoStatus: "pendente",
        userId: SEED_USER_ID,
        createdAt: data,
      });
    }

    // Transações ignoradas
    const ignoradasData = [
      { desc: "DÉB - TAR DOC/TED", valor: 1200, tipo: "debito" as const, daysAgo: 10 },
      { desc: "DÉB - TAR SMS", valor: 800, tipo: "debito" as const, daysAgo: 15 },
      { desc: "CRÉD - REND POUPANÇA", valor: 25000, tipo: "credito" as const, daysAgo: 5 },
    ];

    for (const t of ignoradasData) {
      const data = daysAgo(t.daysAgo);
      await ctx.db.insert("transacoesBancarias", {
        contaBancariaId: contaBancariaIds[2],
        data,
        descricao: t.desc,
        valor: t.valor,
        tipo: t.tipo,
        conciliacaoStatus: "ignorado",
        userId: SEED_USER_ID,
        createdAt: data,
      });
    }

    // ──────────────────────────────────────────────
    // 10. INVENTORY SNAPSHOTS (basic)
    // ──────────────────────────────────────────────
    const quantities = [320, 45, 38, 850, 650, 12, 95, 40, 18, 120, 80, 55, 15, 32, 500];
    const costs = [3500, 12000, 9500, 4200, 3800, 95000, 2800, 15000, 28000, 1500, 800, 1200, 4500, 8500, 550];

    for (let i = 0; i < productIds.length; i++) {
      const qty = quantities[i];
      const cost = costs[i];
      await ctx.db.insert("inventorySnapshot", {
        productId: productIds[i],
        qtyOnHand: qty,
        avgCost: cost,
        totalValue: qty * cost,
        updatedAt: Date.now(),
      });
    }

    // ──────────────────────────────────────────────
    // 10b. SHIPMENTS WITH QR CODES
    // ──────────────────────────────────────────────
    const shipmentSeedData: {
      toSiteIdx: number;
      status: "RegisteredOut" | "PendingShipment" | "DeliveredConfirmed" | "CanceledBeforeLeave";
      daysOffset: number;
      lines: { prodIdx: number; qty: number }[];
      notes?: string;
    }[] = [
      {
        toSiteIdx: 0, status: "DeliveredConfirmed", daysOffset: -15,
        lines: [{ prodIdx: 0, qty: 100 }, { prodIdx: 3, qty: 50 }, { prodIdx: 10, qty: 10 }],
        notes: "Entrega concluída - Alphaville fase 1",
      },
      {
        toSiteIdx: 1, status: "DeliveredConfirmed", daysOffset: -10,
        lines: [{ prodIdx: 1, qty: 8 }, { prodIdx: 2, qty: 5 }, { prodIdx: 5, qty: 2 }],
        notes: "Entrega concluída - Vila Olímpia fundação",
      },
      {
        toSiteIdx: 2, status: "DeliveredConfirmed", daysOffset: -7,
        lines: [{ prodIdx: 6, qty: 20 }, { prodIdx: 7, qty: 5 }],
        notes: "Entrega concluída - Campinas instalações",
      },
      {
        toSiteIdx: 0, status: "PendingShipment", daysOffset: -2,
        lines: [{ prodIdx: 0, qty: 80 }, { prodIdx: 9, qty: 40 }, { prodIdx: 14, qty: 100 }],
        notes: "Em trânsito para Alphaville",
      },
      {
        toSiteIdx: 1, status: "PendingShipment", daysOffset: -1,
        lines: [{ prodIdx: 8, qty: 6 }, { prodIdx: 11, qty: 8 }],
        notes: "Em trânsito para Vila Olímpia",
      },
      {
        toSiteIdx: 2, status: "RegisteredOut", daysOffset: 0,
        lines: [{ prodIdx: 3, qty: 80 }, { prodIdx: 4, qty: 60 }, { prodIdx: 13, qty: 15 }],
        notes: "Preparando envio - Campinas estrutural",
      },
      {
        toSiteIdx: 0, status: "RegisteredOut", daysOffset: 0,
        lines: [{ prodIdx: 12, qty: 3 }, { prodIdx: 7, qty: 4 }],
        notes: "Preparando envio - Alphaville elétrica",
      },
      {
        toSiteIdx: 3, status: "CanceledBeforeLeave", daysOffset: -5,
        lines: [{ prodIdx: 0, qty: 20 }],
        notes: "Cancelado - depósito não precisa mais",
      },
    ];

    const shipmentIds = [];
    for (const s of shipmentSeedData) {
      const toSiteId = siteIds[s.toSiteIdx];
      const site = sitesData[s.toSiteIdx];
      const created = s.daysOffset >= 0 ? daysFromNow(s.daysOffset) : daysAgo(-s.daysOffset);

      const qrProducts = s.lines.map((l) => ({
        name: productsData[l.prodIdx].name,
        qty: l.qty,
        unit: productsData[l.prodIdx].unit,
      }));

      const shipmentId = await ctx.db.insert("shipments", {
        status: s.status,
        toSiteId,
        notes: s.notes,
        qrCodeData: JSON.stringify({
          shipmentId: "pending",
          toSiteId,
          siteName: site.name,
          products: qrProducts,
          createdAt: created,
        }),
        userId: SEED_USER_ID,
        createdAt: created,
        updatedAt: created,
      });

      await ctx.db.patch("shipments", shipmentId, {
        qrCodeData: JSON.stringify({
          shipmentId,
          toSiteId,
          siteName: site.name,
          products: qrProducts,
          createdAt: created,
        }),
      });

      for (const line of s.lines) {
        await ctx.db.insert("shipmentLines", {
          shipmentId,
          productId: productIds[line.prodIdx],
          qty: line.qty,
        });
      }

      shipmentIds.push(shipmentId);
    }

    // ──────────────────────────────────────────────
    // 10c. DELIVERY CONFIRMATIONS (for delivered shipments)
    // ──────────────────────────────────────────────
    const deliveryReceivers = [
      "João Silva - Mestre de Obras",
      "Carlos Mendes - Encarregado",
      "Ana Paula Ribeiro - Engenheira",
    ];

    for (let i = 0; i < 3; i++) {
      const shipment = shipmentSeedData[i];
      await ctx.db.insert("deliveryConfirmations", {
        shipmentId: shipmentIds[i],
        receiverName: deliveryReceivers[i],
        receivedAtSiteId: siteIds[shipment.toSiteIdx],
        confirmedByUserId: SEED_USER_ID,
        confirmedAt: daysAgo(-shipment.daysOffset - 1),
        notes: `Materiais conferidos e recebidos em ${sitesData[shipment.toSiteIdx].name}`,
      });
    }

    // ──────────────────────────────────────────────
    // 10d. MATERIAL REQUESTS (various states)
    // ──────────────────────────────────────────────
    type ReqStatus = "Pendente" | "Aprovado" | "Rejeitado" | "Convertido";
    type Urgency = "normal" | "urgente" | "critico";

    const materialRequestsData: {
      status: ReqStatus;
      siteIdx: number;
      reason: string;
      urgency: Urgency;
      daysNeeded: number;
      daysCreated: number;
      reviewNotes?: string;
      lines: { prodIdx: number; qty: number; approvedQty?: number }[];
    }[] = [
      {
        status: "Pendente", siteIdx: 0, urgency: "critico", daysNeeded: 2, daysCreated: -1,
        reason: "Obra parada - acabou cimento e vergalhão na fase de concretagem da laje do 3o andar. Urgente!",
        lines: [
          { prodIdx: 0, qty: 200 },
          { prodIdx: 3, qty: 100 },
          { prodIdx: 11, qty: 20 },
        ],
      },
      {
        status: "Pendente", siteIdx: 1, urgency: "urgente", daysNeeded: 5, daysCreated: -2,
        reason: "Etapa de acabamento precisa de tinta e argamassa para conclusão da fachada.",
        lines: [
          { prodIdx: 8, qty: 12 },
          { prodIdx: 9, qty: 50 },
        ],
      },
      {
        status: "Pendente", siteIdx: 2, urgency: "normal", daysNeeded: 10, daysCreated: -3,
        reason: "Reposição de estoque da obra para próxima semana. Tubulação e fios para parte elétrica/hidráulica.",
        lines: [
          { prodIdx: 6, qty: 30 },
          { prodIdx: 7, qty: 10 },
          { prodIdx: 12, qty: 5 },
        ],
      },
      {
        status: "Aprovado", siteIdx: 0, urgency: "urgente", daysNeeded: 3, daysCreated: -5,
        reason: "Blocos e tijolos para alvenaria do 2o pavimento.",
        reviewNotes: "Aprovado - reduzido tijolos de 5 para 3 milheiros conforme estoque disponível.",
        lines: [
          { prodIdx: 14, qty: 300, approvedQty: 250 },
          { prodIdx: 5, qty: 5, approvedQty: 3 },
        ],
      },
      {
        status: "Aprovado", siteIdx: 2, urgency: "normal", daysNeeded: 7, daysCreated: -4,
        reason: "Pregos e arame para fase de formas da fundação.",
        reviewNotes: "Aprovado integralmente.",
        lines: [
          { prodIdx: 10, qty: 30, approvedQty: 30 },
          { prodIdx: 11, qty: 15, approvedQty: 15 },
          { prodIdx: 13, qty: 20, approvedQty: 20 },
        ],
      },
      {
        status: "Rejeitado", siteIdx: 1, urgency: "normal", daysNeeded: 15, daysCreated: -10,
        reason: "Solicitação de 500 sacos de cimento para reserva futura.",
        reviewNotes: "Rejeitado: quantidade acima do necessário e do orçamento mensal. Refazer com quantidade reduzida.",
        lines: [
          { prodIdx: 0, qty: 500 },
        ],
      },
      {
        status: "Convertido", siteIdx: 0, urgency: "urgente", daysNeeded: -12, daysCreated: -14,
        reason: "Areia e brita para concretagem da fundação - 1a etapa.",
        reviewNotes: "Aprovado e convertido em remessa.",
        lines: [
          { prodIdx: 1, qty: 10, approvedQty: 10 },
          { prodIdx: 2, qty: 8, approvedQty: 8 },
        ],
      },
    ];

    const materialRequestIds = [];
    for (const mr of materialRequestsData) {
      const created = daysAgo(-mr.daysCreated);
      const requestId = await ctx.db.insert("materialRequests", {
        status: mr.status,
        siteId: siteIds[mr.siteIdx],
        reason: mr.reason,
        urgency: mr.urgency,
        dateNeeded: mr.daysNeeded >= 0 ? daysFromNow(mr.daysNeeded) : daysAgo(-mr.daysNeeded),
        requestedByUserId: SEED_USER_ID,
        reviewedByUserId: mr.reviewNotes ? SEED_USER_ID : undefined,
        reviewNotes: mr.reviewNotes,
        resultingShipmentId: mr.status === "Convertido" ? shipmentIds[0] : undefined,
        createdAt: created,
        updatedAt: mr.reviewNotes ? created + 24 * 60 * 60 * 1000 : created,
      });

      for (const line of mr.lines) {
        await ctx.db.insert("materialRequestLines", {
          requestId,
          productId: productIds[line.prodIdx],
          qty: line.qty,
          approvedQty: line.approvedQty,
        });
      }

      materialRequestIds.push(requestId);
    }

    // ──────────────────────────────────────────────
    // 11. APROVAÇÕES (para contas aprovadas/pagas)
    // ──────────────────────────────────────────────
    for (let i = 0; i < contaPagarIds.length; i++) {
      const status = contasPagarData[i].status;
      if (status === "Aprovado" || status === "Pago") {
        await ctx.db.insert("aprovacoes", {
          contaPagarId: contaPagarIds[i],
          aprovadorId: SEED_USER_ID,
          status: "aprovado",
          observacao: "Aprovado conforme orçamento",
          createdAt: daysAgo(60 - i * 2),
        });
      }
    }

    return {
      products: productIds.length,
      suppliers: supplierIds.length,
      sites: siteIds.length,
      clientes: clienteIds.length,
      contasBancarias: contaBancariaIds.length,
      categorias: categoriaIds.length,
      contasPagar: contaPagarIds.length,
      contasReceber: contaReceberId.length,
      transacoesBancarias: 10 + 6 + pendentesData.length + ignoradasData.length,
      conciliacoes: 16,
      inventorySnapshots: productIds.length,
      shipments: shipmentIds.length,
      deliveryConfirmations: 3,
      materialRequests: materialRequestIds.length,
    };
  },
});
