import { supabaseServer, authConfigured } from './supabaseServer';

// Shared auth layer for the membership model.
//   owner     → full CMS (approve join requests, edit everything)
//   driver    → own rig + route, self-declare, and can admit join requests
//   passenger → rides legs, self-declares own participation only
// is_owner remains the legacy full-CMS gate (existing endpoints use it); role layers
// the finer driver/passenger tiers for the self-declare panel + join pipeline.

export type CrewRole = 'owner' | 'driver' | 'passenger';
export interface CrewMember {
  email: string;
  tenantId: string | null;
  isOwner: boolean;
  role: CrewRole;
  displayName?: string | null;
}

/** The logged-in user's crew membership, or null if not authenticated / not crew.
 *  When auth isn't configured (local/dev), returns a synthetic owner so the CMS stays usable. */
export async function currentCrew(cookies: any, headers: Headers): Promise<CrewMember | null> {
  if (!authConfigured) return { email: 'dev@local', tenantId: null, isOwner: true, role: 'owner' };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from('crew')
    .select('email, tenant_id, is_owner, role, display_name')
    .eq('email', user.email)
    .maybeSingle();
  if (!data) return null;
  return {
    email: data.email,
    tenantId: data.tenant_id,
    isOwner: !!data.is_owner,
    role: (data.role ?? 'passenger') as CrewRole,
    displayName: data.display_name,
  };
}

/** Full-CMS / edit-everything tier. */
export const isOwner = (c: CrewMember | null): c is CrewMember => !!c && (c.isOwner || c.role === 'owner');
/** Can admit join requests — owners AND drivers ("drivers approve"). */
export const canApprove = (c: CrewMember | null): c is CrewMember => !!c && (c.isOwner || c.role === 'owner' || c.role === 'driver');
/** Any crew member — gate for the self-declare panel. */
export const isCrew = (c: CrewMember | null): c is CrewMember => !!c;
