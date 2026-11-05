import { notFound } from 'next/navigation';
import { ProcessFlowScreen } from '@/components/process-flow/ProcessFlowScreen';
import { DbErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { getProcessFlow } from '@/processflow/service';

export default async function ProcessFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getProcessFlow(await createClient(), id);
  if (error && error.code !== DbErrorCode.NOT_FOUND) throw error;
  if (!data) notFound();

  return <ProcessFlowScreen initialProcessFlow={data} />;
}
