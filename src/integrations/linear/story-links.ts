interface StoryLinearLinkRecord {
  story_id: string;
  linear_issue_id: string;
  linear_issue_identifier: string | null;
}

type SupabaseLike = {
  from: (table: string) => unknown;
};

interface StoryLinearLinksTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      maybeSingle(): Promise<{ data: StoryLinearLinkRecord | null; error: unknown }>;
    };
  };
  upsert(
    values: {
      story_id: string;
      linear_issue_id: string;
      linear_issue_identifier: string | null;
      sync_state: 'synced';
      sync_error: null;
      last_synced_at: string;
      updated_at: string;
    },
    options: { onConflict: 'story_id' },
  ): {
    select(columns: string): {
      single(): Promise<{ data: StoryLinearLinkRecord | null; error: unknown }>;
    };
  };
}

export interface StoryLinearLink {
  storyId: string;
  linearIssueId: string;
  linearIssueIdentifier: string | null;
}

function toStoryLinearLink(record: StoryLinearLinkRecord): StoryLinearLink {
  return {
    storyId: record.story_id,
    linearIssueId: record.linear_issue_id,
    linearIssueIdentifier: record.linear_issue_identifier,
  };
}

export async function getStoryLinearLink(supabase: SupabaseLike, storyId: string): Promise<StoryLinearLink | null> {
  const table = supabase.from('story_linear_links') as StoryLinearLinksTable;
  const { data, error } = await table
    .select('story_id, linear_issue_id, linear_issue_identifier')
    .eq('story_id', storyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return toStoryLinearLink(data);
}

export async function getStoryLinearLinkByLinearIssueId(
  supabase: SupabaseLike,
  linearIssueId: string,
): Promise<StoryLinearLink | null> {
  const table = supabase.from('story_linear_links') as StoryLinearLinksTable;
  const { data, error } = await table
    .select('story_id, linear_issue_id, linear_issue_identifier')
    .eq('linear_issue_id', linearIssueId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return toStoryLinearLink(data);
}

export async function upsertStoryLinearLink(
  supabase: SupabaseLike,
  input: {
    storyId: string;
    linearIssueId: string;
    linearIssueIdentifier: string | null;
  },
): Promise<StoryLinearLink> {
  const table = supabase.from('story_linear_links') as StoryLinearLinksTable;
  const now = new Date().toISOString();
  const { data, error } = await table
    .upsert(
      {
        story_id: input.storyId,
        linear_issue_id: input.linearIssueId,
        linear_issue_identifier: input.linearIssueIdentifier,
        sync_state: 'synced',
        sync_error: null,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: 'story_id' },
    )
    .select('story_id, linear_issue_id, linear_issue_identifier')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to upsert story linear link');
  }

  return toStoryLinearLink(data);
}
