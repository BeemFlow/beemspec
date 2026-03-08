'use client';

import { AlertTriangle } from 'lucide-react';

interface DangerZoneProps {
  title?: string;
  description: string;
  children: React.ReactNode;
}

export function DangerZone({ title = 'Danger Zone', description, children }: DangerZoneProps) {
  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
