import { notFound } from 'next/navigation';
import { ProcessFlowScreen } from '@/components/process-flow/ProcessFlowScreen';
import { getE2EProcessFlow } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { DbErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { buildProcessFlowFull, getProcessFlowGraph } from '@/processflow/service';

export default async function ProcessFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (env.e2eTestMode()) {
    const processFlow = getE2EProcessFlow(id);
    if (!processFlow) notFound();
    return <ProcessFlowScreen initialProcessFlow={processFlow} />;
  }

  const supabase = await createClient();
  const { flowResult, nodesResult, edgesResult } = await getProcessFlowGraph(supabase, id);

  if (flowResult.error) {
    if ((flowResult.error as { code?: string }).code === DbErrorCode.NOT_FOUND) {
      notFound();
    }
    throw flowResult.error;
  }

  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  const processFlow = buildProcessFlowFull(flowResult.data, nodesResult.data ?? [], edgesResult.data ?? []);

  return <ProcessFlowScreen initialProcessFlow={processFlow} />;
}
