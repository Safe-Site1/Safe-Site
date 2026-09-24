revoke execute on function public.accept_team_invitation(uuid) from public, anon;
revoke execute on function public.create_team_invitation(text,text,text,uuid) from public, anon;
revoke execute on function public.list_team_members() from public, anon;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.create_team_invitation(text,text,text,uuid) to authenticated;
grant execute on function public.list_team_members() to authenticated;
