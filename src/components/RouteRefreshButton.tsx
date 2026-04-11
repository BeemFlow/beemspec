'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RouteRefreshButtonProps {
  onRefresh: () => void;
  label: string;
}

export function RouteRefreshButton({ onRefresh, label }: RouteRefreshButtonProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onRefresh} aria-label={label}>
      <RefreshCw className="size-4" />
    </Button>
  );
}
