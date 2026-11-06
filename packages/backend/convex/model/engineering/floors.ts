

export function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

export function normalizeFloors(floors: Array<{ number: number; label: string }>) {
  if (floors.length === 0) {
    throw new Error("A obra precisa de pelo menos um andar");
  }
  const seen = new Set<number>();
  for (const f of floors) {
    if (seen.has(f.number)) {
      throw new Error(`Andar ${f.number} duplicado`);
    }
    seen.add(f.number);
  }
  return floors
    .map((floor) => ({
      number: Math.floor(floor.number),
      label: floor.label.trim() || defaultFloorLabel(floor.number),
    }))
    .sort((a, b) => a.number - b.number);
}
