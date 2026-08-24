/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './settings-dialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="tabs" className={className}>
      {children}
    </div>
  ),
  TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="tabs-list" className={className}>
      {children}
    </div>
  ),
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button type="button" data-value={value}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) => (
    <div data-testid={`tab-${value}`} className={className}>
      {children}
    </div>
  ),
}));

describe('SettingsDialog', () => {
  afterEach(cleanup);

  it('uses a four-column tab layout when four tabs are provided', () => {
    render(
      <SettingsDialog
        open
        onOpenChange={vi.fn()}
        title="Team Settings"
        activeTab="general"
        onTabChange={vi.fn()}
        tabs={[
          { value: 'general', label: 'General', content: <div>General content</div> },
          { value: 'integrations', label: 'Integrations', content: <div>Integrations content</div> },
          { value: 'members', label: 'Members', content: <div>Members content</div> },
          { value: 'danger', label: 'Danger', content: <div>Danger content</div> },
        ]}
      />,
    );

    expect(screen.getByTestId('tabs-list').className).toContain('grid-cols-4');
  });

  it('uses a full-screen mobile shell with an independently scrollable tab panel', () => {
    render(
      <SettingsDialog
        open
        onOpenChange={vi.fn()}
        title="Team Settings"
        activeTab="general"
        onTabChange={vi.fn()}
        tabs={[{ value: 'general', label: 'General', content: <div>General content</div> }]}
      />,
    );

    expect(screen.getByTestId('dialog-content').className).toContain('h-dvh');
    expect(screen.getByTestId('dialog-content').className).toContain('rounded-none');
    expect(screen.getByTestId('dialog-content').className).toContain('sm:max-h-[90dvh]');
    expect(screen.getByTestId('tabs').className).toContain('min-h-0');
    expect(screen.getByTestId('tab-general').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('tab-general').className).toContain('touch-pan-y');
  });
});
