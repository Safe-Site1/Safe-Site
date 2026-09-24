-- The RETURNS TABLE output organization_id conflicts with the ON CONFLICT column list.
-- Preserve the deployed identity-linking implementation and target its named unique constraint.
do $fix$
declare definition text;
begin
  select pg_get_functiondef('public.accept_team_invitation(uuid)'::regprocedure) into definition;
  if position('on conflict(organization_id,user_id)' in definition)=0 then
    raise exception 'Expected invitation conflict clause was not found; review the deployed function';
  end if;
  definition:=replace(definition,
    'on conflict(organization_id,user_id)',
    'on conflict on constraint organization_memberships_organization_id_user_id_key');
  execute definition;
end;
$fix$;
