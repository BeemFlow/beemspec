import * as React from 'react';
import { CARD_HEIGHT, CARD_WIDTH } from '@/components/story-map/constants';
import { cn } from '@/components/ui/utils';

type MapCardVariant = 'activity' | 'task' | 'story';

const variantStyles: Record<MapCardVariant, string> = {
  activity: 'bg-accent-hover-subtle border-border-accent',
  task: 'bg-input-bg border-border',
  story: 'bg-card border shadow-sm',
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

export type { MapCardVariant };
export { MapCard };
