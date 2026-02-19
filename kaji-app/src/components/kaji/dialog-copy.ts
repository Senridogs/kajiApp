export function mergeDuplicateDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "A matching chore already exists on that date. Merge it?",
    description: `"${args.choreTitle}"`,
    detail: `${args.sourceDateKey} -> ${args.targetDateKey}`,
    confirmLabel: "Merge",
    cancelLabel: "Move without merge",
  };
}

export function rescheduleConfirmDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "Apply this move to future schedules as well?",
    description: `"${args.choreTitle}"`,
    detail: `${args.sourceDateKey} -> ${args.targetDateKey}`,
    confirmLabel: "Apply to future",
    cancelLabel: "Only this date",
  };
}

export function undoRecordDialogCopy(choreTitle: string) {
  return {
    title: `Undo completion for "${choreTitle}"?`,
    description: "This will mark the chore as not completed.",
    confirmLabel: "Undo",
    cancelLabel: "Cancel",
  };
}

export const deleteChoreDialogCopy = {
  title: "Delete this chore?",
  description: "This action cannot be undone.",
  confirmLabel: "Delete",
  confirmLoadingLabel: "Deleting...",
  cancelLabel: "Cancel",
};

export function infoDialogCopy(message: string) {
  return {
    title: "Updated",
    description: message,
    confirmLabel: "Close",
  };
}

export function recordDateChoiceDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
}) {
  return {
    title: "完了日付を選択",
    description: `「${args.choreTitle}」をいつ実施した扱いにしますか？`,
    detail: `対象日: ${args.sourceDateKey}`,
    confirmLabel: "その日実施にする",
    cancelLabel: "今日実施にする",
  };
}
