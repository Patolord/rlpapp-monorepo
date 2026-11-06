import { defineTable } from "convex/server";
import { v } from "convex/values";

// Funcionários, folha de pagamento, empréstimos, pensões e ponto.

export const employeeStatus = v.union(
  v.literal("active"),
  v.literal("on_leave"),
  v.literal("terminated")
);

export const employeePaymentMethod = v.union(
  v.literal("pix"),
  v.literal("tbi"),
  v.literal("other")
);

// Equipe do funcionário (ver @rlpapp/shared/rh/staffGroups). Cada equipe tem
// padrões próprios de benefícios na folha; cadastros antigos sem equipe são obra.
export const employeeStaffGroup = v.union(
  v.literal("obra"),
  v.literal("escritorio"),
  v.literal("diretoria")
);

export const payrollRunStatus = v.union(
  v.literal("draft"),
  v.literal("closed")
);

// Tipo da marcação de ponto, derivado da posição no dia (1ª=entrada, 2ª=saída
// almoço, 3ª=retorno almoço, 4ª em diante=saída).
export const timeClockPunchKind = v.union(
  v.literal("entrada"),
  v.literal("almoco_saida"),
  v.literal("almoco_retorno"),
  v.literal("saida")
);

// Resultado da checagem da posição contra as cercas das obras.
export const timeClockGeofenceStatus = v.union(
  v.literal("not_controlled"),
  v.literal("inside"),
  v.literal("outside")
);

export const hrTables = {
  employees: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    nameNormalized: v.string(),
    cpf: v.optional(v.string()),
    cpfNormalized: v.optional(v.string()),
    // Ausente nos cadastros anteriores à equipe: tratado como "obra".
    staffGroup: v.optional(employeeStaffGroup),
    jobTitle: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    hiredAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: employeeStatus,
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    baseSalaryCents: v.number(),
    receivesFoodBasket: v.boolean(),
    dailyTransitCents: v.number(),
    defaultTransportFoodDays: v.number(),
    // Descontinuado: vínculo antigo com o usuário que batia ponto. O ponto agora
    // é do próprio usuário e nada lê este campo. A migração
    // `migrations:clearEmployeeUserLinks` o apaga; remover do schema depois
    // que ela rodar em produção.
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_name_normalized", ["nameNormalized"])
    .index("by_code", ["code"])
    .index("by_cpf_normalized", ["cpfNormalized"])
    .index("by_status", ["status"])
    .index("by_email", ["email"]),
  payrollRuns: defineTable({
    year: v.number(),
    paymentMonth: v.number(),
    referenceYear: v.number(),
    referenceMonth: v.number(),
    paymentDay: v.number(),
    status: payrollRunStatus,
    mealVoucherPerDayCents: v.number(),
    foodBasketCents: v.number(),
    defaultDailyTransitCents: v.number(),
    defaultTransportFoodDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
    closedAt: v.optional(v.number()),
    closedByUserId: v.optional(v.id("users")),
  }).index("by_year_and_payment_month", ["year", "paymentMonth"]),
  payrollLines: defineTable({
    runId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    code: v.optional(v.string()),
    name: v.string(),
    jobTitle: v.optional(v.string()),
    baseSalaryCents: v.number(),
    paymentMethod: employeePaymentMethod,
    earningsCents: v.number(),
    deductionsCents: v.number(),
    foodBasketEnabled: v.boolean(),
    transportFoodDays: v.number(),
    dailyTransitCents: v.number(),
    supplementCents: v.number(),
    thirteenthFirstCents: v.number(),
    thirteenthSecondCents: v.number(),
    manualLoanDeductionCents: v.number(),
    awayNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    mealVoucherCents: v.number(),
    transitVoucherCents: v.number(),
    foodBasketCents: v.number(),
    scheduledLoanDeductionCents: v.number(),
    totalLoanDeductionCents: v.number(),
    totalPaymentCents: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_employee", ["employeeId"])
    .index("by_run_and_employee", ["runId", "employeeId"]),
  employeeLoans: defineTable({
    employeeId: v.id("employees"),
    totalCents: v.number(),
    installmentCount: v.number(),
    installmentCents: v.number(),
    startYear: v.number(),
    startMonth: v.number(),
    description: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_employee", ["employeeId"]),
  // Pensão alimentícia: pagamento mensal a um beneficiário (ex-cônjuge, filho)
  // por conta de um funcionário. É uma linha própria da folha, paga direto ao
  // beneficiário, com valor que pode mudar mês a mês. Não se mistura com a
  // linha do funcionário: não entra nos descontos nem no total dele (a
  // retenção oficial fica no holerite da contabilidade).
  employeeAlimonies: defineTable({
    employeeId: v.id("employees"),
    beneficiaryName: v.string(),
    // Valor padrão ao abrir um mês sem histórico; a folha ajusta por mês.
    amountCents: v.number(),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_employee", ["employeeId"]),
  payrollAlimonyLines: defineTable({
    runId: v.id("payrollRuns"),
    alimonyId: v.id("employeeAlimonies"),
    employeeId: v.id("employees"),
    // Snapshots do mês, como nas linhas de funcionário.
    employeeName: v.string(),
    beneficiaryName: v.string(),
    amountCents: v.number(),
    paymentMethod: employeePaymentMethod,
    pixKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_alimony", ["alimonyId"])
    .index("by_run_and_alimony", ["runId", "alimonyId"]),

  // --- RH: Ponto ---
  //
  // Cada marcação é de um usuário do app com a permissão `ponto.registrar`,
  // feita pelo app RLP com foto e/ou localização. A obra vem da cerca
  // (`projects.geofence`) que contém a posição. O cadastro de funcionários
  // (`employees`) é só da folha e não participa do ponto.
  // Singleton (key = "default"): preferências do módulo de ponto.
  clockSettings: defineTable({
    key: v.literal("default"),
    // Custo estimado de um homem-dia (para o relatório mensal).
    manDayCostCents: v.number(),
    photoRequired: v.boolean(),
    locationRequired: v.boolean(),
    // Janela (min) em que uma nova marcação do mesmo usuário é recusada.
    duplicateWindowMinutes: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_key", ["key"]),
  // Contadores monotônicos do ponto (ex.: NSR das marcações).
  timeClockCounters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),
  // Uma linha por marcação.
  clockPunches: defineTable({
    userId: v.id("users"),
    // Nome do usuário no momento da marcação (vai no comprovante).
    personName: v.string(),
    // Chave de idempotência gerada no aparelho (reenvio da fila offline).
    clientPunchId: v.string(),
    // Dia civil em Brasília ("YYYY-MM-DD").
    date: v.string(),
    // Horário oficial, atribuído pelo servidor (offline: o do aparelho).
    punchedAt: v.number(),
    // "HH:MM" em Brasília.
    timeLabel: v.string(),
    // Posição da marcação dentro do dia (0 = primeira).
    sequence: v.number(),
    kind: timeClockPunchKind,
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracyMeters: v.optional(v.number()),
    photoStorageId: v.optional(v.id("_storage")),
    // Obra da cerca que contém a posição ou, fora de todas, a mais próxima
    // (`geofenceStatus` diz qual dos dois).
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    geofenceStatus: timeClockGeofenceStatus,
    // Relógio do aparelho no toque em "Registrar ponto".
    capturedAt: v.number(),
    offline: v.boolean(),
    deviceModel: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    // Comprovante: número sequencial e hash SHA-256 da marcação.
    nsr: v.number(),
    hash: v.string(),
  })
    .index("by_date", ["date"])
    .index("by_user_and_date", ["userId", "date"])
    .index("by_client_punch_id", ["clientPunchId"]),
  // Resumo diário por usuário (só dias com marcação), recalculado a cada
  // marcação. Base do relatório mensal de homem-dia.
  clockDays: defineTable({
    date: v.string(),
    userId: v.id("users"),
    personName: v.string(),
    // Obra do dia: a da primeira marcação dentro de uma cerca.
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    firstPunchAt: v.number(),
    lastPunchAt: v.number(),
    lastKind: timeClockPunchKind,
    punchCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_user_and_date", ["userId", "date"]),
};
