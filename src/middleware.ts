import { defineMiddleware, sequence } from 'astro:middleware';
import { supabaseServer, authConfigured } from './lib/supabaseServer';
import { requestCtx } from './lib/requestContext';

// Security headers on every response, and the cross-site guard Astro's own checkOrigin would
// give us if it read the public host behind the proxy (it doesn't, so it's off in astro.config).
// A state-changing request must come from this site: an Origin naming another host, or a browser
// labelling the fetch cross-site, is refused. Cron and server-to-server callers send neither and
// pass to their own token checks. No CSP yet: the map tiles, embeds and inline scripts need their
// own careful pass.
const guardAndHeaders = defineMiddleware(async (ctx, next) => {
  if (!/^(GET|HEAD|OPTIONS)$/.test(ctx.request.method)) {
    const h = ctx.request.headers;
    const ours = [h.get('x-forwarded-host'), h.get('host'), ctx.url.host].filter(Boolean).map((x) => x!.split(',')[0].trim());
    const origin = h.get('origin');
    let originHost: string | null = null;
    if (origin) { try { originHost = new URL(origin).host; } catch { originHost = '!'; } }
    if ((originHost && !ours.includes(originHost)) || h.get('sec-fetch-site') === 'cross-site') {
      return new Response('Forbidden', { status: 403 });
    }
  }
  const res = await next();
  const headers = res.headers;
  const proto = ctx.request.headers.get('x-forwarded-proto') ?? ctx.url.protocol.replace(':', '');
  if (proto === 'https') headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // drive mode reads the phone's location; nobody else's page gets it
  headers.set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(self), payment=()');
  return res;
});

// Gate the CMS: must be signed in AND an owner. Sets locals.tenantId so CMS pages
// only ever see the owner's own trip. Everything else stays public. Also seeds the
// per-request RLS-bound client so the data layer reads as the signed-in user.
const gate = defineMiddleware(async (ctx, next) => {
  // Safety net: if an auth ?code lands anywhere other than /auth/callback (e.g.
  // Supabase fell back to the Site URL root), exchange it here and move on.
  const code = ctx.url.searchParams.get('code');
  if (code && authConfigured && ctx.url.pathname !== '/auth/callback') {
    const supabase = supabaseServer(ctx.cookies, ctx.request.headers);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return ctx.redirect(error ? '/login?denied=1' : '/cms');
  }

  // One RLS-bound client for the whole request. Anonymous → public branch; signed-in
  // owner → their own (possibly private) tenant. Reused by the CMS gate below.
  const sb = authConfigured ? supabaseServer(ctx.cookies, ctx.request.headers) : null;
  ctx.locals.sb = sb;

  if (ctx.url.pathname.startsWith('/cms')) {
    if (!authConfigured) return requestCtx.run({ sb }, () => next()); // local/mock: CMS open

    const { data: { user } } = await sb!.auth.getUser();
    if (!user) return ctx.redirect('/login?next=' + encodeURIComponent(ctx.url.pathname));

    // Owner check via the user's own crew row (RLS-allowed self-read).
    const { data: crew } = await sb!
      .from('crew').select('tenant_id, display_name')
      .eq('email', user.email).eq('is_owner', true).maybeSingle();
    // Signed in but no trip yet → send to onboarding to create one (multi-user front door).
    if (!crew) return ctx.redirect('/welcome');

    ctx.locals.user = { email: user.email, name: crew.display_name };
    ctx.locals.tenantId = crew.tenant_id;
  }
  return requestCtx.run({ sb }, () => next());
});

export const onRequest = sequence(guardAndHeaders, gate);
