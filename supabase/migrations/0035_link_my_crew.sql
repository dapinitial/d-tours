-- Slice 6: link an existing crew row (matched by email) to the auth user on first
-- login. Needed because RLS keys on crew.auth_user_id, but pre-existing crew rows
-- (David's co-owners) were created before they ever signed in. SECURITY DEFINER so a
-- user can claim their own row before they're a "writable member" (chicken-and-egg).
create or replace function link_my_crew() returns void
language sql security definer set search_path = public as $$
  update crew set auth_user_id = auth.uid()
  where email = (auth.jwt() ->> 'email') and auth_user_id is null;
$$;

revoke all on function link_my_crew() from public, anon;
grant execute on function link_my_crew() to authenticated;
