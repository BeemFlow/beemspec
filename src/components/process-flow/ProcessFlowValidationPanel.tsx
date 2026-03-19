'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ProcessFlowValidationResult } from '@/types';

export function ProcessFlowValidationPanel({ validation }: { validation: ProcessFlowValidationResult | null }) {
  const warnings = validation?.warnings ?? [];

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warning-foreground" />
          Validation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {warnings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            No warnings right now.
          </div>
        ) : (
          warnings.map((warning, index) => (
            <div
              key={`${warning.code}-${warning.message}-${warning.node_ids?.join(',') ?? 'no-nodes'}-${warning.edge_ids?.join(',') ?? 'no-edges'}-${index}`}
              className="rounded-lg border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.08em]">
                  {warning.code}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{warning.message}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
