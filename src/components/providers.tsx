'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { TeamProvider } from '@/lib/contexts/team-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <TeamProvider>{children}</TeamProvider>
    </TooltipProvider>
  );
}
