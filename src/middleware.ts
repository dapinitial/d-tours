import { defineMiddleware } from 'astro:middleware';
import { supabaseServer, authConfigured } from './lib/supabaseServer';

// Gate the CMS: must be signed in AND an owner. Sets locals.tenantId so CMS pages
// only ever see the owner's own trip. Everything else stays public.
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.url.pathname.startsWith('/cms')) {
    if (!authConfigured) return next(); // local/mock mode: leave CMS open

    const supabase = supabaseServer(ctx.cookies, ctx.request.headers);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ctx.redirect('/login?next=' + encodeURIComponent(ctx.url.pathname));

    // Owner check via the user's own crew row (RLS-allowed self-read).
    const { data: crew } = await supabase
      .from('crew').select('tenant_id, display_name')
      .eq('email', user.email).eq('is_owner', true).maybeSingle();
    if (!crew) return ctx.redirect('/login?denied=1');

    ctx.locals.user = { email: user.email, name: crew.display_name };
    ctx.locals.tenantId = crew.tenant_id;
  }
  return next();
});
