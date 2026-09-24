-- Recover a lost acceptance response without granting or restoring any access.
-- Retain the existing audited identity-linking implementation and grants.
do $fix$
declare
  definition text;
  marker text := '  if v_inv.status<>''pending'' then';
  recovery text := $recovery$
  -- An accepted token is a receipt only for its original authenticated recipient.
  if v_inv.status='accepted' then
    if v_inv.accepted_by is distinct from auth.uid()
       or lower(v_inv.email)<>v_email then
      raise exception 'Invitation is no longer active';
    end if;
    if not exists (
      select 1 from public.organization_memberships om
      where om.organization_id=v_inv.organization_id
        and om.user_id=auth.uid() and om.active=true and om.role=v_inv.role
    ) or (v_inv.site_id is not null and not exists (
      select 1 from public.site_memberships sm
      where sm.site_id=v_inv.site_id and sm.user_id=auth.uid()
    )) then
      raise exception 'Invitation access has changed. Contact your administrator.';
    end if;
    return query select v_inv.organization_id,v_inv.role,v_inv.site_id;
    return;
  end if;

$recovery$;
begin
  select pg_get_functiondef('public.accept_team_invitation(uuid)'::regprocedure) into definition;
  if position(marker in definition)=0 or position('-- An accepted token is a receipt' in definition)>0 then
    raise exception 'Unexpected invitation implementation; review before applying';
  end if;
  execute replace(definition,marker,recovery||marker);
end;
$fix$;
