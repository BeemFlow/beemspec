BEGIN;

-- The app and MCP switch together. Hold the legacy graph still during backfill.
LOCK TABLE public.process_flows, public.process_flow_nodes, public.process_flow_edges IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA process_flow_v1_archive;
REVOKE ALL ON SCHEMA process_flow_v1_archive FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE process_flow_v1_archive.flows AS TABLE public.process_flows;
CREATE TABLE process_flow_v1_archive.nodes AS TABLE public.process_flow_nodes;
CREATE TABLE process_flow_v1_archive.edges AS TABLE public.process_flow_edges;

ALTER TABLE public.process_flows
  ADD COLUMN mermaid_source TEXT NOT NULL DEFAULT 'flowchart LR',
  ADD COLUMN diagram_revision INTEGER NOT NULL DEFAULT 1 CHECK (diagram_revision > 0),
  ADD COLUMN diagram_metadata JSONB NOT NULL DEFAULT '{"nodes":{},"edges":{}}'::jsonb;

-- Match the application codec. Encode syntax-sensitive characters and preserve
-- whitespace that Mermaid trims. PostgreSQL strings cannot contain a NUL.
CREATE FUNCTION pg_temp.mermaid_label(label TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(string_agg(
    CASE WHEN ascii(character) NOT BETWEEN 32 AND 126
      OR character IN ('"', '#', '&', '<', '>', '|', chr(92), chr(96))
      OR (character = ' ' AND position IN (1, char_length(label)))
    THEN '#' || ascii(character) || ';' ELSE character END,
    '' ORDER BY position), '#0;')
  FROM regexp_split_to_table(label, '') WITH ORDINALITY AS letters(character, position)
  WHERE character <> '';
$$;

ALTER TABLE public.process_flows DISABLE TRIGGER trg_process_flows_updated_at;

WITH nodes AS (
  SELECT process_flow_id,
    string_agg(
      '  n_' || id || CASE type
        WHEN 'decision' THEN '{"'
        WHEN 'subprocess' THEN '[["'
        WHEN 'actor' THEN '("'
        WHEN 'system' THEN '[("'
        WHEN 'note' THEN '(["'
        ELSE '["'
      END || pg_temp.mermaid_label(COALESCE(data->>'label', 'Untitled')) || CASE type
        WHEN 'decision' THEN '"}'
        WHEN 'subprocess' THEN '"]]'
        WHEN 'actor' THEN '")'
        WHEN 'system' THEN '")]'
        WHEN 'note' THEN '"])'
        ELSE '"]'
      END,
      E'\n' ORDER BY created_at, id
    ) AS source,
    jsonb_object_agg('n_' || id, jsonb_build_object(
      'position', jsonb_build_object('x', position_x, 'y', position_y),
      'size', CASE WHEN width IS NULL AND height IS NULL THEN NULL
        ELSE jsonb_strip_nulls(jsonb_build_object('width', width, 'height', height)) END,
      'data', data - 'label'
    )) AS metadata
  FROM public.process_flow_nodes GROUP BY process_flow_id
), edges AS (
  SELECT process_flow_id,
    string_agg(
      '  n_' || source_node_id || ' e_' || id || '@' || CASE type
        WHEN 'exception' THEN '-.->'
        WHEN 'handoff' THEN '==>'
        ELSE '-->'
      END || CASE WHEN jsonb_typeof(data->'label') = 'string'
        THEN '|"' || pg_temp.mermaid_label(data->>'label') || '"|' ELSE '' END ||
      ' n_' || target_node_id,
      E'\n' ORDER BY created_at, id
    ) AS source,
    jsonb_object_agg('e_' || id,
      jsonb_build_object('data', CASE WHEN jsonb_typeof(data->'label') = 'string' THEN data - 'label' ELSE data END)
      || CASE WHEN type = 'dependency' THEN '{"type":"dependency"}'::jsonb ELSE '{}'::jsonb END
    ) AS metadata
  FROM public.process_flow_edges GROUP BY process_flow_id
)
UPDATE public.process_flows AS flow
SET mermaid_source = concat_ws(E'\n', 'flowchart LR', nodes.source, edges.source),
    diagram_metadata = jsonb_build_object('nodes', COALESCE(nodes.metadata, '{}'::jsonb),
                                         'edges', COALESCE(edges.metadata, '{}'::jsonb))
FROM public.process_flows AS original
LEFT JOIN nodes ON nodes.process_flow_id = original.id
LEFT JOIN edges ON edges.process_flow_id = original.id
WHERE flow.id = original.id;

ALTER TABLE public.process_flows ENABLE TRIGGER trg_process_flows_updated_at;

DROP FUNCTION public.batch_mutate_process_flow_nodes(UUID, JSONB);
DROP FUNCTION public.batch_mutate_process_flow_edges(UUID, JSONB);
DROP FUNCTION public.apply_process_flow_layout(UUID, JSONB);
DROP TABLE public.process_flow_edges;
DROP TABLE public.process_flow_nodes;
DROP FUNCTION public.update_process_flow_nodes_updated_at();
DROP FUNCTION public.update_process_flow_edges_updated_at();

COMMIT;
