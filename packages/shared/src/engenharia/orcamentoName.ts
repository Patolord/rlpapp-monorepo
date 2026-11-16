/**
 * Partes do nome da pasta de um orçamento na TRELLO do SharePoint. O padrão é
 * "26.37108PRC - Tegra Incorporadora - Obra ARVO" (número da proposta,
 * cliente, obra), mas as pastas novas ainda não têm número ("Rocontec -
 * Bailarinas") e algumas não seguem padrão nenhum ("Observatório").
 */
export interface OrcamentoName {
  /** Número da proposta ("26.37108PRC"), quando a pasta já tem. */
  code: string | null;
  /** Linha principal: o cliente, ou o nome inteiro sem padrão. */
  title: string;
  /** A obra, quando o nome tem cliente e obra. */
  subtitle: string | null;
}

const CODE = /^(\d{2}\.\d{4,6}\s*PRC)\s*-\s*/i;

export function parseOrcamentoName(name: string): OrcamentoName {
  const match = CODE.exec(name);
  const code = match ? match[1]!.replace(/\s+/g, "") : null;
  const rest = (match ? name.slice(match[0].length) : name).trim();
  const [first, ...others] = rest.split(/\s+-\s+/);
  const subtitle = others.join(" - ").trim();
  return { code, title: first!.trim() || name, subtitle: subtitle || null };
}

/** Nome da etapa sem o parêntese explicativo ("Obsoletos (Mais de 60 dias...)"). */
export function stageLabel(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").trim() || name;
}
