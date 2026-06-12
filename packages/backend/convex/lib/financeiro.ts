/** Remove campos undefined — padrão dos updates parciais (ctx.db.patch). */
export function filterDefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/** Anexa a nota de cancelamento às observações existentes (AP/AR). */
export function appendCancelamento(
  observacoes: string | undefined,
  observacao: string | undefined
): string | undefined {
  if (!observacao) return observacoes;
  return `${observacoes ? observacoes + " | " : ""}Cancelado: ${observacao}`;
}
