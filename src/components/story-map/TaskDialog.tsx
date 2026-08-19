import type { Task } from '@/types';
import { NameDialog } from './NameDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onSave: (data: { name: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

export function TaskDialog({ open, onOpenChange, task, onSave, onDelete }: Props) {
  return (
    <NameDialog
      open={open}
      onOpenChange={onOpenChange}
      itemId={task?.id ?? null}
      initialName={task?.name ?? ''}
      title={task ? 'Edit Task' : 'New Task'}
      inputId="task-name"
      placeholder="Create account"
      onSave={onSave}
      onDelete={onDelete}
      deleteTitle="Delete task?"
      deleteDescription="All stories in this task will be permanently deleted."
    />
  );
}
