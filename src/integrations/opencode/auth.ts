export function isAuthorizedByOpenCodeToken(request: Request): boolean {
  const token = process.env.BEEMSPEC_OPENCODE_TOKEN;
  if (!token) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${token}`;
}
