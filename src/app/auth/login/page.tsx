import { resolveSafeRedirectPath } from '@/lib/request-url';
import { AuthForm } from './AuthForm';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function resolveNextParam(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return resolveSafeRedirectPath(next);
}

export default async function AuthPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <AuthForm next={resolveNextParam(params.next)} />;
}
