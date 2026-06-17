// Public-facing location privacy. A trip owner picks how precise their live dot is to
// the PUBLIC; the owner's own CMS view always uses the raw position and never calls this.
//   precise      → exact point (legacy behavior)
//   approximate  → rounded to 1 decimal (~11 km, city-level) — the safe default
//   off          → no public dot at all
export type Pos = { lat: number; lng: number; when?: string; live?: boolean } | null | undefined;
export type LocationSharing = 'precise' | 'approximate' | 'off';

export function publicPosition(pos: Pos, sharing: LocationSharing | string | null | undefined): Pos {
  if (!pos) return null;
  switch (sharing) {
    case 'off':
      return null;
    case 'precise':
      return pos;
    case 'approximate':
    default: // unknown / unset → safe default (never leak precise)
      return { ...pos, lat: Math.round(pos.lat * 10) / 10, lng: Math.round(pos.lng * 10) / 10 };
  }
}
