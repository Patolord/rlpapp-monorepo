/** Distância em metros entre duas coordenadas (haversine), igual ao backend. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type NearbyWorksite<W> = {
  worksite: W;
  distanceMeters: number;
  inside: boolean;
};

/** Obra mais próxima da posição (prévia na tela; a decisão oficial é do servidor). */
export function nearestWorksite<W extends { latitude: number; longitude: number; radius: number }>(
  position: { latitude: number; longitude: number },
  worksites: W[]
): NearbyWorksite<W> | null {
  let best: NearbyWorksite<W> | null = null;
  for (const worksite of worksites) {
    const distance = distanceMeters(
      position.latitude,
      position.longitude,
      worksite.latitude,
      worksite.longitude
    );
    const inside = distance <= worksite.radius;
    if (!best || (inside && !best.inside) || (inside === best.inside && distance < best.distanceMeters)) {
      best = { worksite, distanceMeters: Math.round(distance), inside };
    }
  }
  return best;
}
