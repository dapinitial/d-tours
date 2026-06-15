import { defineMiddleware } from 'astro:middleware';
import { supabaseServer, authConfigured } from './lib/supabaseServer';
import { requestCtx } from './lib/requestContext';

// Gate the CMS: must be signed in AND an owner. Sets locals.tenantId so CMS pages
// only ever see the owner's own trip. Everything else stays public. Also seeds the
// per-request RLS-bound client so the data layer reads as the signed-in user.
export const onRequest = defineMiddleware(async (ctx, next) => {
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
    if (!crew) return ctx.redirect('/login?denied=1');

    ctx.locals.user = { email: user.email, name: crew.display_name };
    ctx.locals.tenantId = crew.tenant_id;
  }
  return requestCtx.run({ sb }, () => next());
});
