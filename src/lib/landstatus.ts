// PAD-US public-land lookup (USGS Protected Areas Database via ArcGIS Online — free,
// no key). Answers the road-trip question "whose land am I on, and can I camp here?"
// A point often sits in several overlapping designations (forest + roadless area +
// wilderness); we prefer the fee-ownership feature, then surface the rest as context.
// Service verified 2026-07-06; if queries start failing, re-check the service list at
// https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services?f=json (USGS org).

const SERVICE =
  'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Management_Areas/FeatureServer/0/query';

const ACCESS: Record<string, string> = { OA: 'open', RA: 'restricted', XA: 'closed', UK: 'unknown' };
const MANAGER: Record<string, string> = {
  USFS: 'US Forest Service', BLM: 'Bureau of Land Management', NPS: 'National Park Service',
  FWS: 'US Fish & Wildlife', DOD: 'Dept. of Defense', USBR: 'Bureau of Reclamation',
  SPR: 'State Parks', SDNR: 'State Dept. of Natural Resources', SFW: 'State Fish & Wildlife',
};

export interface LandStatus {
  public_land: boolean;
  managed_by: string;      // e.g. "US Forest Service"
  manager_code: string;    // raw Mang_Name, e.g. "USFS"
  manager_type: string;    // FED | STAT | LOC | DIST | TRIB | PVT | …
  unit: string;            // e.g. "Bridger National Forest"
  access: string;          // open | restricted | closed | unknown
  designations: string[];  // overlapping designation unit names (wilderness, roadless, …)
  dispersed_camping: 'likely' | 'check-rules' | 'no';
}

/** Dispersed camping heuristic: generally legal on USFS/BLM general forest/rangeland,
 *  rule-bound in parks/wildlife areas, and out on closed or private land. */
function campingHint(mangName: string, mangType: string, access: string): LandStatus['dispersed_camping'] {
  if (access === 'closed') return 'no';
  if (mangName === 'USFS' || mangName === 'BLM') return 'likely';
  if (mangType === 'FED' || mangType === 'STAT') return 'check-rules';
  return 'no';
}

/** Land status at a point, or null when the lookup fails or times out (annotate nothing). */
export async function landStatus(lat: number, lng: number): Promise<LandStatus | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Mang_Name,Mang_Type,Unit_Nm,Pub_Access,Des_Tp,Own_Name',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const res = await fetch(`${SERVICE}?${params}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = await res.json();
    if (!Array.isArray(j.features)) return null;
    // PAD-US answers some non-protected points with a filler polygon whose attributes
    // are all empty strings — treat those as no-hit, not as public land.
    const feats = j.features
      .map((f: any) => f.attributes ?? {})
      .filter((a: any) => a.Mang_Name || a.Unit_Nm);
    if (!feats.length) {
      // PAD-US maps protected/public areas; no hit usually means private land.
      return {
        public_land: false, managed_by: 'unknown (likely private)', manager_code: '', manager_type: 'PVT',
        unit: '', access: 'unknown', designations: [], dispersed_camping: 'no',
      };
    }
    // Fee-ownership rows carry the real owner; designation overlays have Own_Name === 'DESG'.
    const fee = feats.find((a: any) => a.Own_Name && a.Own_Name !== 'DESG') ?? feats[0];
    const access = ACCESS[fee.Pub_Access] ?? 'unknown';
    return {
      public_land: fee.Mang_Type !== 'PVT' && fee.Mang_Type !== 'UNK',
      managed_by: MANAGER[fee.Mang_Name] ?? fee.Mang_Name ?? 'unknown',
      manager_code: fee.Mang_Name ?? '',
      manager_type: fee.Mang_Type ?? '',
      unit: fee.Unit_Nm ?? '',
      access,
      designations: feats.filter((a: any) => a !== fee && a.Unit_Nm).map((a: any) => a.Unit_Nm),
      dispersed_camping: campingHint(fee.Mang_Name, fee.Mang_Type, access),
    };
  } catch {
    return null;
  }
}
