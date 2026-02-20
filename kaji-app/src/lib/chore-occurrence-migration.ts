export const choreOccurrenceMigrationPlan = [
  "1) 併用読み取り: ChoreOccurrence(pending) を優先し、0件時は legacy ChoreScheduleOverride を読む",
  "2) バックフィル: 初回書き込み時に legacy override を ChoreOccurrence(status=pending, sourceType=override) へ移送",
  "3) 書き込み切替: schedule-override / chores/:id/record は ChoreOccurrence への更新・挿入・消化で運用",
  "4) 旧 override 廃止: 読み取り fallback と legacy table 書き込みを削除",
] as const;
