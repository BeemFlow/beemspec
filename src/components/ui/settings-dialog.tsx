'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface SettingsTabItem {
  value: string;
  label: string;
  content: React.ReactNode;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tabs: SettingsTabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  error?: string | null;
}

const GRID_COLS: Record<number, string> = {
  2: 'grid w-full grid-cols-2',
  3: 'grid w-full grid-cols-3',
  4: 'grid w-full grid-cols-4',
};

function tabsGridClass(count: number): string {
  return GRID_COLS[count] ?? 'grid w-full';
}

export function SettingsDialog({
  open,
  onOpenChange,
  title,
  tabs,
  activeTab,
  onTabChange,
  error,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 flex h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-4 sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[90dvh] sm:max-w-[540px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:gap-4 sm:rounded-lg sm:border sm:p-6">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="mt-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mt-0">
            {error}
          </p>
        )}

        <Tabs value={activeTab} onValueChange={onTabChange} className="mt-4 min-h-0 flex-1 sm:mt-2">
          <TabsList className={`${tabsGridClass(tabs.length)} shrink-0`}>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="mt-4 min-h-0 touch-pan-y overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0"
            >
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
