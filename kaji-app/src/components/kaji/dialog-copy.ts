export function recordDateChoiceDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
}) {
  return {
    title: "\u8a18\u9332\u65e5\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044",
    description: `\u300c${args.choreTitle}\u300d\u3092\u3069\u306e\u65e5\u306e\u5b9f\u65bd\u3068\u3057\u3066\u8a18\u9332\u3057\u307e\u3059\u304b\uff1f`,
    detail: `\u5bfe\u8c61\u65e5: ${args.sourceDateKey}`,
    confirmLabel: "\u5bfe\u8c61\u65e5\u3067\u8a18\u9332",
    cancelLabel: "\u4eca\u65e5\u3067\u8a18\u9332",
  };
}

export function mergeDuplicateDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "\u540c\u3058\u65e5\u306b\u540c\u3058\u5bb6\u4e8b\u304c\u3042\u308a\u307e\u3059\u3002\u7d71\u5408\u3057\u307e\u3059\u304b\uff1f",
    description: `\u300c${args.choreTitle}\u300d\u3092 ${args.sourceDateKey} \u2192 ${args.targetDateKey} \u3078\u79fb\u52d5\u3057\u307e\u3059\u3002`,
    detail: "\u7d71\u5408\u3059\u308b\u3068\u3001\u540c\u65e5\u306e\u4e88\u5b9a\u304c1\u4ef6\u306b\u307e\u3068\u307e\u308a\u307e\u3059\u3002",
    confirmLabel: "\u7d71\u5408\u3059\u308b",
    cancelLabel: "\u7d71\u5408\u305b\u305a\u79fb\u52d5",
  };
}

export function rescheduleConfirmDialogCopy(args: {
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
}) {
  return {
    title: "\u5f8c\u7d9a\u306e\u65e5\u7a0b\u3082\u5909\u66f4\u3057\u307e\u3059\u304b\uff1f",
    description: `\u300c${args.choreTitle}\u300d\u3092 ${args.sourceDateKey} \u2192 ${args.targetDateKey} \u3078\u79fb\u52d5\u3057\u307e\u3059\u3002`,
    detail: "\u300c\u5f8c\u7d9a\u3082\u5909\u66f4\u300d\u306f\u4ee5\u964d\u306e\u4e88\u5b9a\u3082\u307e\u3068\u3081\u3066\u8abf\u6574\u3057\u307e\u3059\u3002",
    confirmLabel: "\u5f8c\u7d9a\u3082\u5909\u66f4",
    cancelLabel: "\u3053\u306e\u65e5\u3060\u3051\u5909\u66f4",
  };
}

export function undoRecordDialogCopy(choreTitle: string) {
  return {
    title: `\u300c${choreTitle}\u300d\u306e\u5b8c\u4e86\u3092\u53d6\u308a\u6d88\u3057\u307e\u3059\u304b\uff1f`,
    description: "\u53d6\u308a\u6d88\u3059\u3068\u672a\u5b8c\u4e86\u306b\u623b\u308a\u307e\u3059\u3002",
    confirmLabel: "\u53d6\u308a\u6d88\u3059",
    cancelLabel: "\u3084\u3081\u308b",
  };
}

export const deleteChoreDialogCopy = {
  title: "\u3053\u306e\u5bb6\u4e8b\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f",
  description: "\u524a\u9664\u3059\u308b\u3068\u5143\u306b\u623b\u305b\u307e\u305b\u3093\u3002",
  confirmLabel: "\u524a\u9664\u3059\u308b",
  confirmLoadingLabel: "\u524a\u9664\u4e2d...",
  cancelLabel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
};

export function infoDialogCopy(message: string) {
  return {
    title: "\u66f4\u65b0\u5b8c\u4e86",
    description: message,
    confirmLabel: "\u9589\u3058\u308b",
  };
}
