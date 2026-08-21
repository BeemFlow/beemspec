import { after } from 'next/server';
import { drainLinearSyncQueue } from '@/integrations/linear/jobs';

export function scheduleLinearSyncDrain(): void {
  after(async () => {
    try {
      await drainLinearSyncQueue({ limit: 1 });
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: the durable queue will retry; retain operational visibility
      console.error('[linear-sync] Immediate queue drain failed', error);
    }
  });
}
