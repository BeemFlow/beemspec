function parseFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const integrationFlags = {
  linear: parseFlag(process.env.BEEMSPEC_ENABLE_LINEAR),
  opencode: parseFlag(process.env.BEEMSPEC_ENABLE_OPENCODE),
  releaseRunner: parseFlag(process.env.BEEMSPEC_ENABLE_RELEASE_RUNNER),
};
