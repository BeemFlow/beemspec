interface IntegrationSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Titled section wrapper for integration settings.
 *
 * Stack multiple `<IntegrationSection>` instances inside an integrations
 * tab. Each section renders as its own bordered panel with a dedicated
 * header area so additional integrations read as clearly separate blocks.
 *
 * ```tsx
 * <div className="space-y-6">
 *   <IntegrationSection title="Linear" description="...">
 *     ...
 *   </IntegrationSection>
 *   <IntegrationSection title="GitHub" description="...">
 *     ...
 *   </IntegrationSection>
 * </div>
 * ```
 */
export function IntegrationSection({ title, description, children }: IntegrationSectionProps) {
  return (
    <section className="overflow-hidden rounded-lg border bg-muted/10">
      <div className="space-y-1 border-b bg-muted/30 px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Integration</p>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}
