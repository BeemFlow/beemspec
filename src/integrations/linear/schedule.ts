import { after } from 'next/server';
import { processLinearSyncBatch } from '@/integrations/linear/jobs';

export function scheduleLinearSyncWorker(): void {
  after(async () => {
    try {
      await processLinearSyncBatch({ limit: 1 });
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: the durable queue will retry; retain operational visibility
      console.error('[linear-sync] Immediate queue drain failed', error);
    }
  });
}
