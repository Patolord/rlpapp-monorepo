export function urgencyRailClass(
  state: "unconfigured" | "healthy" | "reorder" | "below_minimum"
): string | undefined {
  if (state === "below_minimum") {
    return "border-l-[3px] border-l-destructive";
  }
  if (state === "reorder") {
    return "border-l-[3px] border-l-amber-500";
  }
  return undefined;
}
