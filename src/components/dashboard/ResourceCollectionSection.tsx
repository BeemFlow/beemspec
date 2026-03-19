import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

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
  emptyIcon: LucideIcon;
}

export function ResourceCollectionSection({
  title,
  createButton,
  items,
  hrefBase,
  emptyTitle,
  emptyDescription,
  emptyCreateButton,
  emptyIcon: EmptyIcon,
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
          <EmptyIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
          {emptyCreateButton}
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,280px))] justify-center gap-6">
          {items.map((item) => (
            <Link key={item.id} href={`${hrefBase}/${item.id}`} className="block w-[280px] max-w-full">
              <Card className="h-full min-h-[192px] w-full transition-colors hover:bg-muted/50">
                <CardHeader className="h-full content-start">
                  <CardTitle className="line-clamp-2 text-xl leading-tight">{item.name}</CardTitle>
                  {item.description ? (
                    <CardDescription className="line-clamp-4 text-sm">{item.description}</CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
