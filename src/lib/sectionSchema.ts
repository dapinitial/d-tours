// Per-trip dossier "section schema": what sections a trip's day-dossiers show and how
// they're labelled. A climbing trip gets ROUTES / GEAR / SKILLS; a road trip gets
// PACKING LIST / EATS / STAYS; a World Cup trip gets MATCH DAY / TICKETS. The schema is
// data — owner-editable in the CMS and (slice 8) first-drafted by Sonnet from the trip's
// declared intent. This module is the single source of truth for its shape + presets.

export interface DossierSection {
  key: string;
  label: string;
  icon: string;
  fields: string[];
}
export interface SectionSchema {
  sections: DossierSection[];
}

// Generic never-break fallback — also what provision_trip() stamps before Sonnet runs.
export const DEFAULT_SCHEMA: SectionSchema = {
  sections: [
    { key: 'plan', label: 'Day Plan', icon: '📍', fields: ['plan', 'timing'] },
    { key: 'packing', label: 'Packing List', icon: '🎒', fields: ['essentials', 'layers', 'docs'] },
    { key: 'eats', label: 'Eats & Fuel', icon: '🍔', fields: ['food', 'coffee', 'gas'] },
    { key: 'stay', label: 'Where to Sleep', icon: '🛏️', fields: ['sleep', 'resupply'] },
    { key: 'notes', label: 'Notes', icon: '📝', fields: ['misc'] },
  ],
};

export const CLIMBING_SCHEMA: SectionSchema = {
  sections: [
    { key: 'routes', label: 'Routes', icon: '🧗', fields: ['routes'] },
    { key: 'approach', label: 'Approach · Descent · Season', icon: '🥾', fields: ['approach', 'descent', 'season'] },
    { key: 'gear', label: 'Gear & Food', icon: '🎒', fields: ['rack', 'ropes', 'footwear', 'mountaineering', 'food'] },
    { key: 'skills', label: 'Skills Needed', icon: '🪢', fields: ['skills'] },
    { key: 'hazards', label: 'Hazards · Bail', icon: '⚠️', fields: ['hazards', 'bail'] },
  ],
};

export const ROADTRIP_SCHEMA: SectionSchema = {
  sections: [
    { key: 'plan', label: 'Day Plan', icon: '📍', fields: ['plan', 'timing'] },
    { key: 'packing', label: 'Packing List', icon: '🎒', fields: ['essentials', 'layers', 'docs'] },
    { key: 'eats', label: 'Eats & Coffee', icon: '🍔', fields: ['food', 'coffee'] },
    { key: 'fuel', label: 'Fuel & Range', icon: '⛽', fields: ['gas', 'charging'] },
    { key: 'stay', label: 'Where to Sleep', icon: '🛏️', fields: ['sleep', 'resupply'] },
  ],
};

export const WORLDCUP_SCHEMA: SectionSchema = {
  sections: [
    { key: 'matchday', label: 'Match Day', icon: '⚽', fields: ['plan', 'timing'] },
    { key: 'tickets', label: 'Tickets & Entry', icon: '🎟️', fields: ['tickets', 'docs'] },
    { key: 'transit', label: 'Getting There', icon: '🚇', fields: ['transit', 'parking'] },
    { key: 'fanzones', label: 'Fan Zones & Eats', icon: '🍻', fields: ['fanzones', 'food'] },
    { key: 'packing', label: 'Packing List', icon: '🎒', fields: ['essentials', 'layers'] },
  ],
};

/** True when the value is a well-formed SectionSchema (used to gate Sonnet output + DB reads). */
export function isValidSchema(v: any): v is SectionSchema {
  return !!v && Array.isArray(v.sections) && v.sections.length > 0 &&
    v.sections.every((s: any) =>
      s && typeof s.key === 'string' && typeof s.label === 'string' &&
      typeof s.icon === 'string' && Array.isArray(s.fields));
}

/** A tenant's schema, falling back to the generic default when missing/malformed. */
export function resolveSchema(tenant: { section_schema?: any } | null | undefined): SectionSchema {
  return isValidSchema(tenant?.section_schema) ? tenant!.section_schema : DEFAULT_SCHEMA;
}

/** Climbing trips keep the bespoke climbing dossier renderer; everything else is schema-driven. */
export function isClimbingTrip(tenant: { interests?: string[] | null } | null | undefined): boolean {
  return (tenant?.interests ?? []).includes('climbing');
}
