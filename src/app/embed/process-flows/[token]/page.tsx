import { notFound } from 'next/navigation';
import { ProcessFlowCanvas } from '@/components/process-flow/ProcessFlowCanvas';
import { toCanvasFlow } from '@/components/process-flow/adapters';
import { DbErrorCode } from '@/lib/errors';
import { verifyShareToken } from '@/lib/share-links';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildProcessFlowFull, getProcessFlowGraph } from '@/processflow/service';

export default async function ProcessFlowEmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verification = verifyShareToken(token);
  if (!verification.ok || verification.resource !== 'process-flow') {
    notFound();
  }

  const supabase = createAdminClient();
  const { flowResult, nodesResult, edgesResult } = await getProcessFlowGraph(supabase, verification.resourceId);

  if (!flowResult.data) {
    if ((flowResult.error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND || !flowResult.error) {
      notFound();
    }
    throw flowResult.error;
  }

  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  const processFlow = buildProcessFlowFull(flowResult.data, nodesResult.data ?? [], edgesResult.data ?? []);
  const canvas = toCanvasFlow(processFlow);

  return (
    <main className="flex h-screen min-h-0 flex-col bg-background">
      <ProcessFlowCanvas
        mode="viewer"
        framed={false}
        showMiniMap
        showControls
        nodes={canvas.nodes}
        edges={canvas.edges}
      />
    </main>
  );
}
