/** Title as users speak it: family + variant when both exist. */
export function formatMaterialTitle(
  name: string,
  variantLabel?: string | null
): string {
  const variant = variantLabel?.trim();
  if (!variant) return name;
  return `${name} · ${variant}`;
}
