import * as React from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  orientation?: 'horizontal' | 'vertical'
}

const AddButton = React.forwardRef<HTMLButtonElement, AddButtonProps>(
  ({ label, orientation = 'horizontal', className, ...props }, ref) => {
    const isVertical = orientation === 'vertical'

    return (
      <button
        ref={ref}
        className={cn(
          'border border-dashed border-slate-300 rounded text-slate-400',
          'hover:text-slate-600 hover:border-slate-400',
          'transition-colors text-xs flex items-center justify-center cursor-pointer',
          isVertical ? 'gap-0' : 'gap-1',
          className
        )}
        {...props}
      >
        {isVertical ? (
          <span className="flex items-center gap-1 rotate-90 whitespace-nowrap">
            <Plus className="h-3 w-3" />
            {label}
          </span>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            {label}
          </>
        )}
      </button>
    )
  }
)

AddButton.displayName = 'AddButton'

export { AddButton }
