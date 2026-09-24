
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='validate_enterprise_onboarding'
  limit 1;

  if def is null then
    raise exception 'validate_enterprise_onboarding function not found';
  end if;

  if position('#variable_conflict use_column' in def)=0 then
    def:=replace(
      def,
      E'AS $function$\ndeclare',
      E'AS $function$\n#variable_conflict use_column\ndeclare'
    );
    execute def;
  end if;
end $$;
