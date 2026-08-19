BEGIN;

SELECT plan(5);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN (VALUES ('authenticated'), ('service_role')) AS api_role(name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS permission(name)
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND NOT has_table_privilege(
        api_role.name,
        format('%I.%I', namespace.nspname, relation.relname),
        permission.name
      )
  ),
  'authenticated and service roles have CRUD privileges on every public table'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND NOT relation.relrowsecurity
  ),
  'RLS is enabled on every public table'
);

SELECT ok(
  has_table_privilege('service_role', 'public.teams', 'INSERT'),
  'service_role can seed teams through PostgREST'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.teams', 'SELECT'),
  'authenticated users can reach table RLS policies'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.teams', 'SELECT'),
  'anonymous requests cannot bypass the authenticated application boundary'
);

SELECT * FROM finish();

ROLLBACK;
