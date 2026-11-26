import { defineTable } from "convex/server";
import { v } from "convex/values";

// Serviços de campo: as disciplinas de cada obra (definidas pela engenharia) e
// as etapas que a equipe registra pelo app.

// Como o serviço ficou depois da etapa: continua em outra etapa (o técnico
// volta depois, p.ex. quando o gesseiro fechar o forro) ou terminou.
export const serviceStageOutcome = v.union(
  v.literal("continues"),
  v.literal("concluded")
);

export const fieldServicesTables = {
  // Disciplina de uma obra (Infra AC, Exaustão de lavabos, Pressurização...).
  // A lista é da obra: a engenharia escolhe entre as mais comuns, as abas do
  // orçamento publicado ou cria na hora.
  projectDisciplines: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    // Aba do orçamento publicado pelo takeoff (takeoffItems.sheet) de onde saem
    // os locais e os materiais previstos. Sem ela, a disciplina só tem etapas.
    budgetSheet: v.optional(v.string()),
    // false: outra equipe ou terceiro executa; o técnico só acompanha.
    fieldTeam: v.boolean(),
    order: v.number(),
    archivedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Etapa de serviço registrada em campo. O serviço é o par disciplina + local;
  // a situação dele é a da última etapa. As etapas são texto livre: não há
  // lista prévia do que cada serviço exige.
  serviceStages: defineTable({
    projectId: v.id("projects"),
    disciplineId: v.id("projectDisciplines"),
    // Local (ambiente) como o técnico ou o orçamento chamam. Ausente: a etapa
    // vale para a disciplina inteira.
    location: v.optional(v.string()),
    // `location` normalizado para agrupar ("" quando não há local).
    locationKey: v.string(),
    description: v.string(),
    outcome: serviceStageOutcome,
    // O que falta para continuar (só quando `outcome` é "continues").
    pendingNote: v.optional(v.string()),
    // Quem fez: a equipe atua junta, então a etapa é de todos os marcados.
    participantIds: v.array(v.id("users")),
    photoIds: v.array(v.id("_storage")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    // Conferência da engenharia.
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
  })
    .index("by_project", ["projectId"])
    .index("by_discipline_and_locationKey", ["disciplineId", "locationKey"]),
};
