import { z } from 'zod';

const uuid = z.string().uuid();

export const opencodeMarkBlockedSchema = z.object({
  story_id: uuid,
  reason: z.string().min(1).max(2000),
});

export type OpenCodeMarkBlockedRequest = z.infer<typeof opencodeMarkBlockedSchema>;
