import { type Infer } from "convex/values";
import { aiIntentValidator } from "./intents";
import { asString, asNumber, asGridNumber } from "./layoutProposal";

// ============================================================================
// Sistema multi-intent (chat lateral). A IA interpreta comandos e devolve
// INTENTS estruturados. Ela NUNCA escreve no banco — quem aplica é a mutation
// `aiIntents.applyIntents` após o usuário confirmar o preview.
// ============================================================================

export const INTENT_SYSTEM_PROMPT = `Você é o assistente de engenharia de uma plataforma de gestão de obras de ar-condicionado.
A hierarquia da obra é: Obra → Torre → Andar → Ambiente → Equipamento.

Sua função é interpretar o pedido do usuário (texto, planilha, documento ou áudio transcrito) e devolver uma lista de INTENTS estruturados. Você NUNCA executa nada: apenas propõe. O usuário vai revisar e confirmar.

Responda SOMENTE com JSON válido neste formato:
{
  "reply": "frase curta em português explicando o que você vai fazer",
  "needsClarification": "pergunta ao usuário SE faltar informação essencial (senão omita ou deixe vazio)",
  "intents": [ ... ]
}

Tipos de intent disponíveis (campo "type"):

Criação:
- {"type":"update_project","client?":string,"address?":string,"status?":"planning"|"in_progress"|"completed"|"paused","startDate?":"YYYY-MM-DD","endDate?":"YYYY-MM-DD"}
- {"type":"create_tower","name":string}
- {"type":"duplicate_tower","towerName":string,"newName?":string}
- {"type":"create_floors","towerName":string,"from":number,"to":number}
- {"type":"create_environment","towerName":string,"floorNumber":number,"name":string,"envType?":string,"col?":number,"colSpan?":number,"rowSpan?":number} — col/colSpan/rowSpan definem posição e tamanho na matriz esquemática do prédio (inteiros >= 1)
- {"type":"create_system","name":string,"systemType?":string,"obs?":string} — cria um sistema de climatização na obra (ex: "VRF 1" do tipo "VRF")
- {"type":"add_equipment","towerName":string,"floorNumber":number,"environmentName":string,"system":string,"kind":"condensadora"|"evaporadora","modelo?":string,"capacidade?":string,"serialNumber?":string,"deadline?":"YYYY-MM-DD"}
- {"type":"create_checklist_template","name":string,"items":[{"label":string,"required":boolean}]}

Atualização:
- {"type":"set_floor_deadline","towerName":string,"floorNumber":number,"deadline":"YYYY-MM-DD"} — altera o prazo de TODOS os equipamentos de um andar inteiro
- {"type":"update_equipment","towerName":string,"floorNumber":number,"environmentName":string,"kind?":"condensadora"|"evaporadora","system?":string,"deadline?":"YYYY-MM-DD","modelo?":string,"capacidade?":string,"status?":"installing"|"operational"|"warning"|"error"} — atualiza equipamento(s) de um ambiente específico
- {"type":"rename_environment","towerName":string,"floorNumber":number,"oldName":string,"newName":string} — renomeia um ambiente
- {"type":"resize_environment","towerName":string,"floorNumber":number,"name":string,"col?":number,"colSpan?":number,"rowSpan?":number} — reposiciona/redimensiona um ambiente existente na matriz (col = coluna 1-based, colSpan = largura em colunas, rowSpan = altura em andares; duplex = 2, triplex = 3)
- {"type":"assign_qr","token":string,"towerName":string,"floorNumber":number,"environmentName":string,"system?":string,"kind?":"condensadora"|"evaporadora"} — vincula um QR code disponível a um equipamento planejado do ambiente

Regras:
- Sempre referencie torre/andar/ambiente por NOME/NÚMERO. Para criar equipamento num ambiente novo, gere os intents na ordem: create_tower → create_floors → create_environment → add_equipment.
- Tamanhos de ambiente: use colSpan para ambientes largos (ex: hall que ocupa 2 colunas) e rowSpan para ambientes que atravessam andares (duplex = 2, triplex = 3). Para alterar o tamanho de um ambiente que já existe, use resize_environment.
- Para criar VÁRIOS sistemas com seus equipamentos: gere um create_system por sistema e depois um add_equipment por equipamento, referenciando o sistema pelo MESMO nome. Um sistema VRF tem 1 condensadora (em "Área Técnica") e várias evaporadoras nos ambientes atendidos.
- Datas devem ser strings no formato "YYYY-MM-DD" (ex: "2026-06-23" para 23 de junho de 2026). NÃO use epoch/timestamps.
- Se faltar uma informação crítica (ex: qual torre), use "needsClarification" e NÃO invente.
- Toda condensadora normalmente fica em "Área Técnica".
- UMA ÚNICA TORRE por padrão: se a fonte NÃO mencionar explicitamente mais de uma torre/bloco, crie apenas UMA torre (ex: "Torre Única"). NUNCA crie uma torre por aba, por andar ou por apartamento.
- Planilhas costumam REPETIR os mesmos dados em várias abas (ex: uma aba "Global" com tudo + uma aba por andar como "2º Andar", "3º Andar"...). Trate todas as abas como a MESMA obra e DEDUPLIQUE: cada andar/ambiente/equipamento deve aparecer UMA única vez. Prefira a aba mais completa (geralmente "Global").
- Deduza o andar pelo número do apartamento/unidade: 201→andar 2, 305→andar 3, 1204→andar 12. O "Final" costuma ser o último dígito (ex: 204→final 4).
- QR codes: use assign_qr SOMENTE com tokens listados na seção "QR codes disponíveis" do contexto. Quando o usuário citar um lote pelo nome (ex: "lote Lorena"), use os tokens daquele lote, na ordem em que aparecem. Se não houver QR disponível compatível, use "needsClarification" — NUNCA invente tokens. O equipamento precisa existir (ou ser criado com add_equipment na mesma proposta) antes do assign_qr.
- Responda SOMENTE com o JSON, sem texto fora dele.`;

export type AiIntent = Infer<typeof aiIntentValidator>;

export function coerceDate(v: unknown): number | undefined {
  if (typeof v === "string" && v) {
    // DD/MM/YYYY → YYYY-MM-DD
    const brMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      const iso = `${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`;
      const ms = new Date(iso).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    const ms = new Date(v).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

// Coage cada intent ao formato esperado e descarta inválidos, garantindo que
// o validador de retorno da action passe mesmo com saídas imperfeitas da IA.
export function normalizeIntentResponse(parsed: unknown): {
  reply: string;
  needsClarification: string | null;
  intents: AiIntent[];
} {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply = asString(obj.reply) || "Proposta gerada.";
  const needsClarification = asString(obj.needsClarification) || null;
  const rawIntents = Array.isArray(obj.intents) ? obj.intents : [];

  const intents: AiIntent[] = [];
  for (const r of rawIntents) {
    const o = (r ?? {}) as Record<string, unknown>;
    const type = asString(o.type);
    switch (type) {
      case "update_project": {
        const intent: Record<string, unknown> = { type };
        if (typeof o.client === "string") intent.client = o.client;
        if (typeof o.address === "string") intent.address = o.address;
        if (
          o.status === "planning" ||
          o.status === "in_progress" ||
          o.status === "completed" ||
          o.status === "paused"
        )
          intent.status = o.status;
        const sd = coerceDate(o.startDate);
        if (sd !== undefined) intent.startDate = sd;
        const ed = coerceDate(o.endDate);
        if (ed !== undefined) intent.endDate = ed;
        intents.push(intent as AiIntent);
        break;
      }
      case "create_tower": {
        const name = asString(o.name);
        if (name) intents.push({ type, name } as AiIntent);
        break;
      }
      case "duplicate_tower": {
        const towerName = asString(o.towerName);
        if (!towerName) break;
        const intent: Record<string, unknown> = { type, towerName };
        if (typeof o.newName === "string") intent.newName = o.newName;
        intents.push(intent as AiIntent);
        break;
      }
      case "create_floors": {
        const towerName = asString(o.towerName);
        const from = asNumber(o.from, NaN);
        const to = asNumber(o.to, NaN);
        if (towerName && Number.isFinite(from) && Number.isFinite(to)) {
          intents.push({
            type,
            towerName,
            from: Math.floor(from),
            to: Math.floor(to),
          } as AiIntent);
        }
        break;
      }
      case "create_environment": {
        const towerName = asString(o.towerName);
        const name = asString(o.name);
        const floorNumber = asNumber(o.floorNumber, NaN);
        if (towerName && name && Number.isFinite(floorNumber)) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            name,
          };
          if (typeof o.envType === "string") intent.envType = o.envType;
          const col = asGridNumber(o.col);
          if (col !== undefined) intent.col = col;
          const colSpan = asGridNumber(o.colSpan);
          if (colSpan !== undefined) intent.colSpan = colSpan;
          const rowSpan = asGridNumber(o.rowSpan);
          if (rowSpan !== undefined) intent.rowSpan = rowSpan;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "resize_environment": {
        const towerName = asString(o.towerName);
        const name = asString(o.name);
        const floorNumber = asNumber(o.floorNumber, NaN);
        if (towerName && name && Number.isFinite(floorNumber)) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            name,
          };
          const col = asGridNumber(o.col);
          if (col !== undefined) intent.col = col;
          const colSpan = asGridNumber(o.colSpan);
          if (colSpan !== undefined) intent.colSpan = colSpan;
          const rowSpan = asGridNumber(o.rowSpan);
          if (rowSpan !== undefined) intent.rowSpan = rowSpan;
          // Sem nenhum tamanho válido o intent não faz nada; descarta.
          if (
            intent.col !== undefined ||
            intent.colSpan !== undefined ||
            intent.rowSpan !== undefined
          ) {
            intents.push(intent as AiIntent);
          }
        }
        break;
      }
      case "create_system": {
        const name = asString(o.name);
        if (name) {
          const intent: Record<string, unknown> = { type, name };
          const systemType = asString(o.systemType);
          if (systemType) intent.systemType = systemType;
          if (typeof o.obs === "string" && o.obs) intent.obs = o.obs;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "assign_qr": {
        const token = asString(o.token);
        const towerName = asString(o.towerName);
        const environmentName = asString(o.environmentName);
        const floorNumber = asNumber(o.floorNumber, NaN);
        if (
          token &&
          towerName &&
          environmentName &&
          Number.isFinite(floorNumber)
        ) {
          const intent: Record<string, unknown> = {
            type,
            token,
            towerName,
            floorNumber: Math.floor(floorNumber),
            environmentName,
          };
          if (typeof o.system === "string" && o.system)
            intent.system = o.system;
          if (o.kind === "condensadora" || o.kind === "evaporadora")
            intent.kind = o.kind;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "add_equipment": {
        const towerName = asString(o.towerName);
        const environmentName = asString(o.environmentName);
        const system = asString(o.system);
        const floorNumber = asNumber(o.floorNumber, NaN);
        const kind = o.kind === "condensadora" ? "condensadora" : "evaporadora";
        if (towerName && environmentName && system && Number.isFinite(floorNumber)) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            environmentName,
            system,
            kind,
          };
          if (typeof o.modelo === "string") intent.modelo = o.modelo;
          if (typeof o.capacidade === "string") intent.capacidade = o.capacidade;
          if (typeof o.serialNumber === "string")
            intent.serialNumber = o.serialNumber;
          const dl = coerceDate(o.deadline);
          if (dl !== undefined) intent.deadline = dl;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "create_checklist_template": {
        const name = asString(o.name);
        const rawItems = Array.isArray(o.items) ? o.items : [];
        const items = rawItems
          .map((it) => {
            const i = (it ?? {}) as Record<string, unknown>;
            return { label: asString(i.label), required: Boolean(i.required) };
          })
          .filter((i) => i.label);
        if (name && items.length > 0) {
          intents.push({ type, name, items } as AiIntent);
        }
        break;
      }
      case "set_floor_deadline": {
        const towerName = asString(o.towerName);
        const floorNumber = asNumber(o.floorNumber, NaN);
        const dl = coerceDate(o.deadline);
        if (towerName && Number.isFinite(floorNumber) && dl !== undefined) {
          intents.push({
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            deadline: dl,
          } as AiIntent);
        }
        break;
      }
      case "update_equipment": {
        const towerName = asString(o.towerName);
        const floorNumber = asNumber(o.floorNumber, NaN);
        const environmentName = asString(o.environmentName);
        if (towerName && Number.isFinite(floorNumber) && environmentName) {
          const intent: Record<string, unknown> = {
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            environmentName,
          };
          if (o.kind === "condensadora" || o.kind === "evaporadora")
            intent.kind = o.kind;
          if (typeof o.system === "string") intent.system = o.system;
          const dl = coerceDate(o.deadline);
          if (dl !== undefined) intent.deadline = dl;
          if (typeof o.modelo === "string") intent.modelo = o.modelo;
          if (typeof o.capacidade === "string") intent.capacidade = o.capacidade;
          if (
            o.status === "installing" ||
            o.status === "operational" ||
            o.status === "warning" ||
            o.status === "error"
          )
            intent.status = o.status;
          intents.push(intent as AiIntent);
        }
        break;
      }
      case "rename_environment": {
        const towerName = asString(o.towerName);
        const floorNumber = asNumber(o.floorNumber, NaN);
        const oldName = asString(o.oldName);
        const newName = asString(o.newName);
        if (
          towerName &&
          Number.isFinite(floorNumber) &&
          oldName &&
          newName
        ) {
          intents.push({
            type,
            towerName,
            floorNumber: Math.floor(floorNumber),
            oldName,
            newName,
          } as AiIntent);
        }
        break;
      }
    }
  }

  return { reply, needsClarification, intents };
}
