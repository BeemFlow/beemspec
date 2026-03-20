'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EditorHeaderProps {
  title: string;
  backHref?: string;
  actions?: React.ReactNode;
}

export function EditorHeader({ title, backHref = '/', actions }: EditorHeaderProps) {
  return (
    <header className="flex items-center gap-2 border-b bg-background/90 px-2 py-2 backdrop-blur-sm sm:gap-4 sm:px-4 sm:py-3">
      <Link href={backHref}>
        <Button variant="ghost" size="icon">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>
      <h1 className="truncate text-base font-semibold sm:text-xl">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}
