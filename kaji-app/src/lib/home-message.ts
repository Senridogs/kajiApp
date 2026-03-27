export type HomeMessageContext = {
  streak: number;
  gardenScore: number;
  gardenScoreYesterday: number | null;
  staleCount: number;
  totalChores: number;
  recentFamilyRecords: Array<{ userName: string; choreTitle: string }>;
  lastOpenedAt: Date | null;
  now: Date;
};

export function generateHomeMessage(ctx: HomeMessageContext): {
  welcome: string | null;
  message: string;
} {
  const welcome = generateWelcome(ctx);
  const message = generateDailyMessage(ctx);
  return { welcome, message };
}

function generateWelcome(ctx: HomeMessageContext): string | null {
  if (!ctx.lastOpenedAt) return null;

  const hoursSinceLastOpen =
    (ctx.now.getTime() - ctx.lastOpenedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastOpen < 1) return null;

  if (ctx.recentFamilyRecords.length > 0) {
    const latest = ctx.recentFamilyRecords[0];
    const othersCount = ctx.recentFamilyRecords.length - 1;
    if (othersCount > 0) {
      return `おかえり！${latest.userName}が${latest.choreTitle}など${ctx.recentFamilyRecords.length}件やってくれた`;
    }
    return `おかえり！${latest.userName}が${latest.choreTitle}をやってくれた`;
  }

  return "おかえり！";
}

function generateDailyMessage(ctx: HomeMessageContext): string {
  if (ctx.streak >= 30) return `${ctx.streak}日連続！すごいチームワーク`;
  if (ctx.streak >= 14) return `${ctx.streak}日連続！いい感じ`;
  if (ctx.streak >= 7) return `${ctx.streak}日連続達成！家族の力がすごい`;
  if (ctx.gardenScore === 100) return "全部の家事が周期内。最高の状態";
  if (ctx.gardenScoreYesterday !== null && ctx.gardenScore > ctx.gardenScoreYesterday) {
    return `庭スコアが${ctx.gardenScoreYesterday}→${ctx.gardenScore}にアップ`;
  }
  if (ctx.staleCount > 3) return `${ctx.staleCount}件が久しぶり。`;
  if (ctx.staleCount > 0) return `${ctx.staleCount}件そろそろかも`;
  if (ctx.totalChores === 0) return "家事を追加して庭を育てよう";
  return "今日もいい一日に";
}
