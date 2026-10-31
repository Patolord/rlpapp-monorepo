/** Accent- and case-insensitive key of a name: "Grelha de Insuflação" and "grelha de insuflacao" match. */
export const foldName = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
