-- Papu_store: opciones de combos_populares agrupadas; desactivar combos_explosivos_2; reapuntar referencias.
-- Idempotente: solo afecta filas que coincidan con flow_code / node_code.

CREATE OR REPLACE FUNCTION pg_temp.neura_papu_group_combos(schema_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I.chat_flow_nodes SET is_active = false
     WHERE flow_code = ''Papu_store'' AND node_code = ''combos_explosivos_2''',
    schema_name
  );

  EXECUTE format(
    'UPDATE %I.chat_flow_nodes SET next_node_code = ''combos_populares''
     WHERE flow_code = ''Papu_store'' AND next_node_code = ''combos_explosivos_2''',
    schema_name
  );

  EXECUTE format(
    'UPDATE %I.chat_flow_options o SET next_node_code = ''combos_populares''
     FROM %I.chat_flow_nodes n
     WHERE o.node_id = n.id AND n.flow_code = ''Papu_store''
       AND o.next_node_code = ''combos_explosivos_2''',
    schema_name,
    schema_name
  );

  EXECUTE format(
    'UPDATE %I.chat_flow_options o
       SET group_title = d.gt,
           group_order = d.go,
           sort_order = d.so
     FROM %I.chat_flow_nodes n,
     LATERAL (
       VALUES
         (''Combos populares''::text, 0::int, 1::int, 3::int),
         (''Combos populares'', 0, 2, 5),
         (''Aumentá tus Chances'', 1, 1, 10),
         (''Aumentá tus Chances'', 1, 2, 50),
         (''Opción estándar'', 2, 1, 1)
     ) AS d(gt, go, so, cantidad)
     WHERE o.node_id = n.id
       AND n.flow_code = ''Papu_store''
       AND n.node_code = ''combos_populares''
       AND (
         CASE jsonb_typeof(o.option_payload -> ''cantidad'')
           WHEN ''number'' THEN (o.option_payload -> ''cantidad'')::text::int
           ELSE (nullif(trim(o.option_payload ->> ''cantidad''), ''''))::int
         END
       ) = d.cantidad',
    schema_name,
    schema_name
  );
END;
$$;

DO $$
DECLARE
  sch text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'chat_flow_nodes'
  ) THEN
    PERFORM pg_temp.neura_papu_group_combos('zentra_erp');
  END IF;

  FOR sch IN
    SELECT n.nspname
    FROM pg_namespace n
    JOIN pg_class c ON c.relnamespace = n.oid
    WHERE c.relkind = 'r'
      AND c.relname = 'chat_flow_nodes'
      AND (
        n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname ~ '^erp_[a-zA-Z0-9_]+$'
      )
  LOOP
    PERFORM pg_temp.neura_papu_group_combos(sch);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS pg_temp.neura_papu_group_combos(text);
