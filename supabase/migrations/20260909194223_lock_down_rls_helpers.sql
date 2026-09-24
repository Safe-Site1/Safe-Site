revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.has_org_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
