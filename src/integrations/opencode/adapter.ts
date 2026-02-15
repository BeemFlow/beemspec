import type { OpenCodePluginPort } from '@/integrations/opencode/contracts';
import { createBeemSpecPlugin } from '../../../packages/opencode-beemspec/src';

export function createOpenCodePluginAdapter(enabled: boolean): OpenCodePluginPort | null {
  if (!enabled) return null;

  return createBeemSpecPlugin({ async onLifecycleEvent(_event) {} });
}
