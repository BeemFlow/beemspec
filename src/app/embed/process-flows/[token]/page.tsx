import { notFound } from 'next/navigation';
import { toCanvasFlow } from '@/components/process-flow/adapters';
import { ProcessFlowCanvas } from '@/components/process-flow/ProcessFlowCanvas';
import { DbErrorCode } from '@/lib/errors';
import { verifyShareToken } from '@/lib/share-links';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProcessFlow } from '@/processflow/service';

export default async function ProcessFlowEmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verification = verifyShareToken(token);
  if (!verification.ok || verification.resource !== 'process-flow') {
    notFound();
  }

  const { data, error } = await getProcessFlow(createAdminClient(), verification.resourceId);
  if (error && error.code !== DbErrorCode.NOT_FOUND) throw error;
  if (!data) notFound();

  const canvas = toCanvasFlow(data);

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
