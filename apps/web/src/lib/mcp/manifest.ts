/**
 * Manifesto de ferramentas curadas, orientadas a tarefa.
 *
 * Cada entrada liga uma ferramenta MCP a uma função pública do Convex. O schema
 * de entrada vem do validador da função (via catálogo, ver convex-schema.ts);
 * tudo o que o agente precisa para *escolher* a ferramenta (nome, descrição,
 * anotações) é escrito à mão aqui, nos arquivos de `manifest/` (um por domínio).
 *
 * Regras:
 * - Nome pela intenção (`create_customer`), não pela implementação.
 * - Diga quando usar, o que devolve e as unidades (epoch ms, centavos).
 * - Marque como `destructive` o que apaga/arquiva/revoga.
 * - Use `serverArgs` para argumentos que o agente nunca deveria informar (`now`).
 * - Nunca inclua funções que devolvam tokens de QR code, ids de storage ou
 *   URLs de upload: as 6 ferramentas de engenharia já existentes (tools.ts)
 *   removem esses campos de propósito.
 */

import { CLIENTES_TOOLS } from "./manifest/clientes";
import { COMPRAS_EXTRA_TOOLS, COMPRAS_TOOLS } from "./manifest/compras";
import { CONTRATOS_TOOLS } from "./manifest/contratos";
import { AGENT_TOKEN_TOOLS, EQUIPE_TOOLS } from "./manifest/equipe";
import { ESTOQUE_EXTRA_TOOLS, ESTOQUE_TOOLS } from "./manifest/estoque";
import { OBRAS_EXTRA_TOOLS, OBRAS_TOOLS } from "./manifest/obras";
import { PAINEL_TOOLS } from "./manifest/painel";
import { RH_TOOLS } from "./manifest/rh";

export interface ToolSpec {
  /** Nome MCP: `^[a-zA-Z0-9_-]{1,64}$`. */
  name: string;
  /** Função pública do Convex, `modulo:funcao`. */
  function: string;
  title: string;
  description: string;
  /** Mutations que removem ou alteram dados de forma irreversível. */
  destructive?: boolean;
  /** Repetir a chamada com a mesma entrada não tem efeito adicional. */
  idempotent?: boolean;
  /** Descrições por argumento que sobrepõem as dicas compartilhadas. */
  fieldDescriptions?: Record<string, string>;
  /** Argumentos preenchidos pelo servidor; saem do schema de entrada. */
  serverArgs?: () => Record<string, unknown>;
}

/** A ordem importa: é a ordem em que as ferramentas aparecem no MCP. */
export const TOOLS: readonly ToolSpec[] = [
  ...OBRAS_TOOLS,
  ...CLIENTES_TOOLS,
  ...CONTRATOS_TOOLS,
  ...PAINEL_TOOLS,
  ...EQUIPE_TOOLS,
  ...COMPRAS_TOOLS,
  ...ESTOQUE_TOOLS,
  ...RH_TOOLS,
  ...ESTOQUE_EXTRA_TOOLS,
  ...COMPRAS_EXTRA_TOOLS,
  ...OBRAS_EXTRA_TOOLS,
  ...AGENT_TOKEN_TOOLS,
];

export function isDestructive(spec: ToolSpec): boolean {
  return spec.destructive ?? /^(delete|remove|archive|revoke)_/.test(spec.name);
}
