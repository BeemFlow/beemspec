import { z } from 'zod';

const teamName = z.string().min(1, 'Team name is required').max(100, 'Team name too long');

export const createTeamSchema = z.object({
  name: teamName,
});

export const updateTeamSchema = z.object({
  name: teamName,
});

export const inviteEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type CreateTeam = z.infer<typeof createTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;
export type InviteEmail = z.infer<typeof inviteEmailSchema>;
