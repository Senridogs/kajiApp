export function recordDateChoiceDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
}) {
  return {
    title: "記録日を選択してください",
    description: `「${args.choreTitle}」をどの日の実施として記録しますか？`,
    detail: `対象日: ${args.sourceDateKey}`,
    confirmLabel: "対象日で記録",
    cancelLabel: "今日で記録",
  };
}

export function mergeDuplicateDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "同じ日に同じ家事があります。統合しますか？",
    description: `「${args.choreTitle}」を ${args.sourceDateKey} → ${args.targetDateKey} へ移動します。`,
    detail: "統合すると、同日の予定が1件にまとまります。",
    confirmLabel: "統合する",
    cancelLabel: "統合せず移動",
  };
}

export function rescheduleConfirmDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "後続の日程も変更しますか？",
    description: `「${args.choreTitle}」を ${args.sourceDateKey} → ${args.targetDateKey} へ移動します。`,
    detail: "「後続も変更」は以降の予定もまとめて調整します。",
    confirmLabel: "後続も変更",
    cancelLabel: "この日だけ変更",
  };
}

export function undoRecordDialogCopy(choreTitle: string) {
  return {
    title: `「${choreTitle}」の完了を取り消しますか？`,
    description: "取り消すと未完了に戻ります。",
    confirmLabel: "取り消す",
    cancelLabel: "やめる",
  };
}

export const deleteChoreDialogCopy = {
  title: "この家事を削除しますか？",
  description: "削除すると元に戻せません。",
  confirmLabel: "削除する",
  confirmLoadingLabel: "削除中...",
  cancelLabel: "キャンセル",
};

export function infoDialogCopy(message: string) {
  return {
    title: "更新完了",
    description: message,
    confirmLabel: "閉じる",
  };
}
