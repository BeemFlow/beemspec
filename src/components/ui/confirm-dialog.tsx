'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** If provided, user must type this exact text to enable confirm button */
  confirmText?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmingLabel = 'Confirming...',
  cancelLabel = 'Cancel',
  variant = 'default',
  confirmText,
  onConfirm,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConfirmEnabled = (!confirmText || inputValue === confirmText) && !isSubmitting;

  async function handleConfirm() {
    if (!isConfirmEnabled) return;

    try {
      setIsSubmitting(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    if (!nextOpen) setInputValue('');
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {confirmText && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-input" className="text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">{confirmText}</span> to confirm
            </Label>
            <Input
              id="confirm-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={confirmText}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={variant === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
          >
            {isSubmitting ? confirmingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
