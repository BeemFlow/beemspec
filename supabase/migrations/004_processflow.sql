-- =============================================================================
-- BeemSpec Schema: Process Flows
-- Depends on: 001_schema.sql, 003_functions.sql
-- =============================================================================


-- =============================================================================
-- Process Flows
-- =============================================================================

CREATE TABLE process_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  context_markdown TEXT,
  viewport JSONB,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_process_flows_team ON process_flows(team_id);
CREATE UNIQUE INDEX uq_process_flows_id_team ON process_flows(id, team_id);


-- =============================================================================
-- Process Flow Nodes
-- =============================================================================

CREATE TABLE process_flow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id UUID NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('step', 'decision', 'subprocess', 'actor', 'system', 'note')),
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  data JSONB NOT NULL DEFAULT '{"label": "Untitled"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_process_flow_nodes_flow ON process_flow_nodes(process_flow_id);
CREATE UNIQUE INDEX uq_process_flow_nodes_id_flow ON process_flow_nodes(id, process_flow_id);


-- =============================================================================
-- Process Flow Edges
-- =============================================================================

CREATE TABLE process_flow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_flow_id UUID NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flow', 'handoff', 'exception', 'dependency')),
  source_node_id UUID NOT NULL,
  target_node_id UUID NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_process_flow_edges_source_target_distinct CHECK (source_node_id <> target_node_id),
  CONSTRAINT fk_process_flow_edges_source_in_flow
    FOREIGN KEY (source_node_id, process_flow_id)
    REFERENCES process_flow_nodes(id, process_flow_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_process_flow_edges_target_in_flow
    FOREIGN KEY (target_node_id, process_flow_id)
    REFERENCES process_flow_nodes(id, process_flow_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_process_flow_edges_flow ON process_flow_edges(process_flow_id);
CREATE INDEX idx_process_flow_edges_source ON process_flow_edges(source_node_id);
CREATE INDEX idx_process_flow_edges_target ON process_flow_edges(target_node_id);
CREATE UNIQUE INDEX uq_process_flow_edges_unique_connection
  ON process_flow_edges(process_flow_id, type, source_node_id, target_node_id);


-- =============================================================================
-- Transactional Mutation Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION batch_mutate_process_flow_nodes(
  p_process_flow_id UUID,
  p_mutations JSONB
)
RETURNS JSONB AS $$
DECLARE
  mutation JSONB;
  payload JSONB;
  node_row process_flow_nodes%ROWTYPE;
  created_rows JSONB := '[]'::jsonb;
  updated_rows JSONB := '[]'::jsonb;
  deleted_rows JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_mutations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_mutations must be a JSON array';
  END IF;

  FOR mutation IN SELECT value FROM jsonb_array_elements(p_mutations) LOOP
    payload := mutation->'payload';

    CASE mutation->>'action'
      WHEN 'create' THEN
        INSERT INTO process_flow_nodes (
          process_flow_id,
          type,
          position_x,
          position_y,
          width,
          height,
          data
        ) VALUES (
          p_process_flow_id,
          payload->>'type',
          (payload->'position'->>'x')::double precision,
          (payload->'position'->>'y')::double precision,
          CASE
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' AND payload->'size' ? 'width'
              THEN (payload->'size'->>'width')::double precision
            ELSE NULL
          END,
          CASE
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' AND payload->'size' ? 'height'
              THEN (payload->'size'->>'height')::double precision
            ELSE NULL
          END,
          COALESCE(payload->'data', '{"label": "Untitled"}'::jsonb)
        )
        RETURNING * INTO node_row;

        created_rows := created_rows || jsonb_build_array(to_jsonb(node_row));

      WHEN 'update' THEN
        UPDATE process_flow_nodes
        SET
          type = COALESCE(payload->>'type', type),
          position_x = CASE
            WHEN payload ? 'position' AND jsonb_typeof(payload->'position') = 'object' AND payload->'position' ? 'x'
              THEN (payload->'position'->>'x')::double precision
            ELSE position_x
          END,
          position_y = CASE
            WHEN payload ? 'position' AND jsonb_typeof(payload->'position') = 'object' AND payload->'position' ? 'y'
              THEN (payload->'position'->>'y')::double precision
            ELSE position_y
          END,
          width = CASE
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'null' THEN NULL
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' AND payload->'size' ? 'width'
              THEN (payload->'size'->>'width')::double precision
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' THEN NULL
            ELSE width
          END,
          height = CASE
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'null' THEN NULL
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' AND payload->'size' ? 'height'
              THEN (payload->'size'->>'height')::double precision
            WHEN payload ? 'size' AND jsonb_typeof(payload->'size') = 'object' THEN NULL
            ELSE height
          END,
          data = CASE
            WHEN payload ? 'data' THEN payload->'data'
            ELSE data
          END
        WHERE id = (mutation->>'id')::uuid
          AND process_flow_id = p_process_flow_id
        RETURNING * INTO node_row;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Process flow node % not found in flow %', mutation->>'id', p_process_flow_id;
        END IF;

        updated_rows := updated_rows || jsonb_build_array(to_jsonb(node_row));

      WHEN 'delete' THEN
        DELETE FROM process_flow_nodes
        WHERE id = (mutation->>'id')::uuid
          AND process_flow_id = p_process_flow_id
        RETURNING * INTO node_row;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Process flow node % not found in flow %', mutation->>'id', p_process_flow_id;
        END IF;

        deleted_rows := deleted_rows || jsonb_build_array(to_jsonb(node_row));

      ELSE
        RAISE EXCEPTION 'Unsupported node mutation action: %', mutation->>'action';
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'created', created_rows,
    'updated', updated_rows,
    'deleted', deleted_rows
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION batch_mutate_process_flow_edges(
  p_process_flow_id UUID,
  p_mutations JSONB
)
RETURNS JSONB AS $$
DECLARE
  mutation JSONB;
  payload JSONB;
  edge_row process_flow_edges%ROWTYPE;
  created_rows JSONB := '[]'::jsonb;
  updated_rows JSONB := '[]'::jsonb;
  deleted_rows JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_mutations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_mutations must be a JSON array';
  END IF;

  FOR mutation IN SELECT value FROM jsonb_array_elements(p_mutations) LOOP
    payload := mutation->'payload';

    CASE mutation->>'action'
      WHEN 'create' THEN
        INSERT INTO process_flow_edges (
          process_flow_id,
          type,
          source_node_id,
          target_node_id,
          data
        ) VALUES (
          p_process_flow_id,
          payload->>'type',
          (payload->>'source_node_id')::uuid,
          (payload->>'target_node_id')::uuid,
          payload->'data'
        )
        RETURNING * INTO edge_row;

        created_rows := created_rows || jsonb_build_array(to_jsonb(edge_row));

      WHEN 'update' THEN
        UPDATE process_flow_edges
        SET
          type = COALESCE(payload->>'type', type),
          data = CASE
            WHEN payload ? 'data' THEN payload->'data'
            ELSE data
          END
        WHERE id = (mutation->>'id')::uuid
          AND process_flow_id = p_process_flow_id
        RETURNING * INTO edge_row;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Process flow edge % not found in flow %', mutation->>'id', p_process_flow_id;
        END IF;

        updated_rows := updated_rows || jsonb_build_array(to_jsonb(edge_row));

      WHEN 'delete' THEN
        DELETE FROM process_flow_edges
        WHERE id = (mutation->>'id')::uuid
          AND process_flow_id = p_process_flow_id
        RETURNING * INTO edge_row;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Process flow edge % not found in flow %', mutation->>'id', p_process_flow_id;
        END IF;

        deleted_rows := deleted_rows || jsonb_build_array(to_jsonb(edge_row));

      ELSE
        RAISE EXCEPTION 'Unsupported edge mutation action: %', mutation->>'action';
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'created', created_rows,
    'updated', updated_rows,
    'deleted', deleted_rows
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_process_flow_layout(
  p_process_flow_id UUID,
  p_positions JSONB
)
RETURNS VOID AS $$
DECLARE
  expected_count INTEGER;
  updated_count INTEGER;
BEGIN
  IF jsonb_typeof(p_positions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_positions must be a JSON array';
  END IF;

  expected_count := jsonb_array_length(p_positions);

  UPDATE process_flow_nodes AS n
  SET
    position_x = p.x,
    position_y = p.y
  FROM jsonb_to_recordset(p_positions) AS p(id uuid, x double precision, y double precision)
  WHERE n.id = p.id
    AND n.process_flow_id = p_process_flow_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> expected_count THEN
    RAISE EXCEPTION 'Layout update expected % nodes but updated % nodes for flow %', expected_count, updated_count, p_process_flow_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Updated-at Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION update_process_flows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_flows_updated_at
  BEFORE UPDATE ON process_flows
  FOR EACH ROW EXECUTE FUNCTION update_process_flows_updated_at();

CREATE OR REPLACE FUNCTION update_process_flow_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_flow_nodes_updated_at
  BEFORE UPDATE ON process_flow_nodes
  FOR EACH ROW EXECUTE FUNCTION update_process_flow_nodes_updated_at();

CREATE OR REPLACE FUNCTION update_process_flow_edges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_flow_edges_updated_at
  BEFORE UPDATE ON process_flow_edges
  FOR EACH ROW EXECUTE FUNCTION update_process_flow_edges_updated_at();
