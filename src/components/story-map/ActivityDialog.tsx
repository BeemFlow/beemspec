import type { Activity } from '@/types';
import { NameDialog } from './NameDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  onSave: (data: { name: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

export function ActivityDialog({ open, onOpenChange, activity, onSave, onDelete }: Props) {
  return (
    <NameDialog
      open={open}
      onOpenChange={onOpenChange}
      itemId={activity?.id ?? null}
      initialName={activity?.name ?? ''}
      title={activity ? 'Edit Activity' : 'New Activity'}
      inputId="activity-name"
      placeholder="User Registration"
      onSave={onSave}
      onDelete={onDelete}
      deleteTitle="Delete activity?"
      deleteDescription="All tasks and stories in this activity will be permanently deleted."
    />
  );
}
