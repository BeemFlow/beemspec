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

// Tailwind requires full class names at compile time — no dynamic interpolation.
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
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Tabs value={activeTab} onValueChange={onTabChange} className="mt-2">
          <TabsList className={tabsGridClass(tabs.length)}>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
