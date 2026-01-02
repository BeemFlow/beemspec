'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DeleteButtonProps {
  onDelete: () => void;
  /** If provided, shows confirmation dialog before deleting */
  confirmTitle?: string;
  confirmDescription?: string;
  /** If provided, user must type this text to enable delete (for high-impact deletions) */
  confirmText?: string;
  /** Button label (default: "Delete", ignored for icon variant) */
  label?: string;
  /** Icon-only button (for inline usage) */
  iconOnly?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  className?: string;
  disabled?: boolean;
}

export function DeleteButton({
  onDelete,
  confirmTitle,
  confirmDescription,
  confirmText,
  label = 'Delete',
  iconOnly = false,
  loading = false,
  className,
  disabled,
}: DeleteButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  function handleClick() {
    if (confirmTitle) {
      setShowConfirm(true);
    } else {
      onDelete();
    }
  }

  function handleConfirm() {
    onDelete();
    setShowConfirm(false);
  }

  const icon = loading ? (
    <Loader2 className={iconOnly ? 'h-3 w-3 animate-spin' : 'mr-2 h-4 w-4 animate-spin'} />
  ) : (
    <Trash2 className={iconOnly ? 'h-3 w-3' : 'mr-2 h-4 w-4'} />
  );

  return (
    <>
      <Button
        type="button"
        variant={iconOnly ? 'ghost' : 'destructive'}
        size={iconOnly ? 'icon' : 'default'}
        className={iconOnly ? `h-5 w-5 hover:text-destructive ${className ?? ''}` : className}
        onClick={handleClick}
        disabled={disabled || loading}
      >
        {icon}
        {!iconOnly && label}
      </Button>

      {confirmTitle && (
        <ConfirmDialog
          open={showConfirm}
          onOpenChange={setShowConfirm}
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel="Delete"
          variant="destructive"
          confirmText={confirmText}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
