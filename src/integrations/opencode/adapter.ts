import type { OpenCodePluginPort } from '@/integrations/opencode/contracts';
import { createBeemSpecPlugin, createBeemSpecTools } from '../../../packages/opencode-beemspec/src';

export function createOpenCodePluginAdapter(enabled: boolean): OpenCodePluginPort | null {
  if (!enabled) return null;

  const plugin = createBeemSpecPlugin({
    async loadStoryById(_input) {
      throw new Error('beemspec_story is not wired to datastore yet');
    },
    async markStoryBlocked(_input) {
      throw new Error('beemspec_blocked is not wired to datastore yet');
    },
    async onLifecycleEvent(_event) {},
  });

  createBeemSpecTools({
    async loadStoryById(_input) {
      throw new Error('beemspec_story is not wired to datastore yet');
    },
    async markStoryBlocked(_input) {
      throw new Error('beemspec_blocked is not wired to datastore yet');
    },
  });

  return plugin;
}
