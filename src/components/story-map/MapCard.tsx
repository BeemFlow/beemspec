import * as React from 'react';
import { CARD_HEIGHT, CARD_WIDTH } from '@/components/story-map/constants';
import { cn } from '@/lib/utils';

type MapCardVariant = 'activity' | 'task' | 'story';

const variantStyles: Record<MapCardVariant, string> = {
  activity: 'bg-amber-100 border-amber-200',
  task: 'bg-sky-100 border-sky-200',
  story: 'bg-white border-slate-200 shadow-sm',
};

interface MapCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: MapCardVariant;
  isDragging?: boolean;
}

const MapCard = React.forwardRef<HTMLDivElement, MapCardProps>(
  ({ variant, isDragging = false, className, style, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          opacity: isDragging ? 0.5 : 1,
          ...style,
        }}
        className={cn(
          'rounded border p-3 cursor-grab active:cursor-grabbing hover:shadow flex flex-col',
          variantStyles[variant],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

MapCard.displayName = 'MapCard';

export { MapCard };
export type { MapCardVariant };
