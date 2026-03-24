import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface ResourceItem {
  id: string;
  name: string;
  description?: string | null;
}

interface ResourceCollectionSectionProps {
  title: string;
  createButton: React.ReactNode;
  items: ResourceItem[];
  hrefBase: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyCreateButton: React.ReactNode;
  icon: LucideIcon;
}

export function ResourceCollectionSection({
  title,
  createButton,
  items,
  hrefBase,
  emptyTitle,
  emptyDescription,
  emptyCreateButton,
  icon: Icon,
}: ResourceCollectionSectionProps) {
  const showEmpty = items.length === 0;

  return (
    <section>
      <div className="mb-8 flex items-center justify-between gap-6">
        <h2 className="text-3xl font-bold">{title}</h2>
        {createButton}
      </div>

      {showEmpty ? (
        <Card className="border-dashed p-8 text-center">
          <Icon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
          {emptyCreateButton}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link key={item.id} href={`${hrefBase}/${item.id}`} className="block">
              <Card className="w-full flex-row items-stretch gap-0 overflow-hidden py-0 transition-colors hover:bg-muted/50">
                <div className="flex w-16 shrink-0 items-center justify-center bg-muted/60">
                  <Icon className="size-8 text-muted-foreground" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-4">
                  <span className="text-base font-semibold leading-tight">{item.name}</span>
                  {item.description ? (
                    <span className="line-clamp-1 text-sm text-muted-foreground">{item.description}</span>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
