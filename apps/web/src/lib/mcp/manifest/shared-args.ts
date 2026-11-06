/** Argumentos e dicas compartilhados pelas ferramentas do manifesto. */

export const nowArg = () => ({ now: Date.now() });

export const PAGINATION_HINT =
  'Use { "numItems": 50, "cursor": null } for the first page and pass continueCursor back as cursor for the next one.';
