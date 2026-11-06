export const SYSTEM_PROMPT = `Você é um assistente que estrutura dados de instalação de ar-condicionado em obras de prédios, a partir de texto livre, planilhas, documentos ou transcrições de áudio.

Sua tarefa: ler o conteúdo fornecido e devolver um JSON com a lista de apartamentos e seus equipamentos, seguindo EXATAMENTE este formato:

{
  "reply": "uma frase curta em português explicando o que você entendeu",
  "units": [
    {
      "floor": number,            // número do andar (ex: 2 para 2º andar). Térreo = 0.
      "final": number,            // posição do apto no andar (1 a N), na ordem
      "label": string,            // ex: "201" (se não souber, deixe vazio)
      "type": "vrf" | "split",    // VRF ou Split
      "floorSpan": number,        // 1 normal, 2 duplex, 3 triplex
      "equipment": [
        {
          "system": string,       // ex: "VRF 1", "VRF 2", "Split"
          "ambiente": string,     // ex: "Sala de Estar", "Suíte 1", "Área Técnica"
          "kind": "condensadora" | "evaporadora",
          "modelo": string,       // ex: "AM040", "AJ100" (vazio se desconhecido)
          "capacidade": string,   // ex: "4HP", "15.000 BTU/h" (vazio se desconhecido)
          "obs": string           // observações (vazio se nenhuma)
        }
      ]
    }
  ]
}

Regras:
- Toda condensadora fica em "Área Técnica" salvo indicação contrária.
- Cada sistema VRF tem 1 condensadora e várias evaporadoras; Split costuma ter 1 condensadora e 1+ evaporadoras.
- Se o conteúdo descrever vários andares idênticos, gere uma unidade para cada andar.
- Responda SOMENTE com o JSON válido, sem texto extra.`;

export type ProposalUnit = {
  floor: number;
  final: number;
  label?: string;
  type: "vrf" | "split";
  floorSpan?: number;
  deadline?: number;
  equipment: Array<{
    system: string;
    ambiente: string;
    kind: "condensadora" | "evaporadora";
    modelo?: string;
    capacidade?: string;
    obs?: string;
  }>;
};

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Posição/tamanho na matriz: inteiro >= 1 ou undefined. */
export function asGridNumber(v: unknown): number | undefined {
  const n = Math.floor(asNumber(v, NaN));
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

export function normalizeProposal(parsed: unknown): {
  reply: string;
  units: ProposalUnit[];
} {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply = asString(obj.reply) || "Proposta gerada a partir do conteúdo.";
  const rawUnits = Array.isArray(obj.units) ? obj.units : [];

  const units: ProposalUnit[] = rawUnits.map((u) => {
    const unit = (u ?? {}) as Record<string, unknown>;
    const rawEquip = Array.isArray(unit.equipment) ? unit.equipment : [];
    const type = unit.type === "vrf" ? "vrf" : "split";
    let deadline: number | undefined;
    if (typeof unit.deadline === "string" && unit.deadline) {
      const ms = new Date(unit.deadline).getTime();
      if (Number.isFinite(ms)) deadline = ms;
    } else if (typeof unit.deadline === "number") {
      deadline = unit.deadline;
    }

    return {
      floor: Math.floor(asNumber(unit.floor, 0)),
      final: Math.max(1, Math.floor(asNumber(unit.final, 1))),
      label: asString(unit.label) || undefined,
      type,
      floorSpan: Math.max(1, Math.floor(asNumber(unit.floorSpan, 1))),
      deadline,
      equipment: rawEquip.map((e) => {
        const item = (e ?? {}) as Record<string, unknown>;
        return {
          system: asString(item.system) || "Split",
          ambiente: asString(item.ambiente) || "Ambiente",
          kind: item.kind === "condensadora" ? "condensadora" : "evaporadora",
          modelo: asString(item.modelo) || undefined,
          capacidade: asString(item.capacidade) || undefined,
          obs: asString(item.obs) || undefined,
        };
      }),
    };
  });

  return { reply, units };
}
