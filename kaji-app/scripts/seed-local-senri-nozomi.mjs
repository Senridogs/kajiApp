import { PrismaClient } from "@prisma/client";

const LOCAL_DATABASE_URL = "postgresql://ieApp:ieApp@localhost:5432/kaji_app?schema=public";
const TARGET_CHORE_COUNT = 30;
const TARGET_RECORDS_PER_USER = 30;

const CHORE_TEMPLATES = [
  { title: "食器洗い", legacyTitleEn: "Dish Washing", intervalDays: 1, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "トイレ掃除", legacyTitleEn: "Toilet Cleaning", intervalDays: 4, isBigTask: false, icon: "flame", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "シンク掃除", legacyTitleEn: "Sink Cleaning", intervalDays: 3, isBigTask: false, icon: "droplets", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "お風呂掃除", legacyTitleEn: "Bath Scrub", intervalDays: 7, isBigTask: false, icon: "droplets", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "洗濯", legacyTitleEn: "Laundry", intervalDays: 2, isBigTask: false, icon: "shirt", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "洗濯物を干す", legacyTitleEn: "Dry Laundry", intervalDays: 2, isBigTask: false, icon: "wind", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "洗濯物をたたむ", legacyTitleEn: "Fold Laundry", intervalDays: 2, isBigTask: false, icon: "shirt", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "ゴミ出し", legacyTitleEn: "Take Out Trash", intervalDays: 1, isBigTask: false, icon: "trash", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "床に掃除機をかける", legacyTitleEn: "Vacuum Floors", intervalDays: 3, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "床拭き", legacyTitleEn: "Mop Floors", intervalDays: 7, isBigTask: false, icon: "droplets", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "棚のほこり取り", legacyTitleEn: "Dust Shelves", intervalDays: 5, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "鏡を磨く", legacyTitleEn: "Clean Mirrors", intervalDays: 6, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "窓拭き", legacyTitleEn: "Window Wipe", intervalDays: 14, isBigTask: true, icon: "sun", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "シーツ交換", legacyTitleEn: "Change Bed Sheets", intervalDays: 10, isBigTask: false, icon: "moon", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "植物に水やり", legacyTitleEn: "Water Plants", intervalDays: 3, isBigTask: false, icon: "leaf", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "冷蔵庫チェック", legacyTitleEn: "Fridge Check", intervalDays: 7, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "パントリー整理", legacyTitleEn: "Pantry Organize", intervalDays: 21, isBigTask: true, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "排水口掃除", legacyTitleEn: "Bathroom Drain", intervalDays: 14, isBigTask: true, icon: "droplets", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "エアコンフィルター掃除", legacyTitleEn: "AC Filter", intervalDays: 30, isBigTask: true, icon: "wind", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "換気扇掃除", legacyTitleEn: "Range Hood", intervalDays: 30, isBigTask: true, icon: "flame", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "電子レンジ掃除", legacyTitleEn: "Microwave Clean", intervalDays: 10, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "コンロ掃除", legacyTitleEn: "Stove Top", intervalDays: 3, isBigTask: false, icon: "flame", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "玄関を掃く", legacyTitleEn: "Entryway Sweep", intervalDays: 4, isBigTask: false, icon: "wind", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "靴箱整理", legacyTitleEn: "Shoe Rack Organize", intervalDays: 14, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "タオル交換", legacyTitleEn: "Towel Replace", intervalDays: 3, isBigTask: false, icon: "shirt", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "机拭き", legacyTitleEn: "Desk Wipe", intervalDays: 3, isBigTask: false, icon: "sparkles", iconColor: "#FFFFFF", bgColor: "#4285F4" },
  { title: "ペットスペース掃除", legacyTitleEn: "Pet Area Clean", intervalDays: 2, isBigTask: false, icon: "heart", iconColor: "#FFFFFF", bgColor: "#EA4335" },
  { title: "資源ごみの分別", legacyTitleEn: "Recycle Sort", intervalDays: 2, isBigTask: false, icon: "leaf", iconColor: "#FFFFFF", bgColor: "#34A853" },
  { title: "クローゼット整理", legacyTitleEn: "Closet Organize", intervalDays: 30, isBigTask: true, icon: "shirt", iconColor: "#FFFFFF", bgColor: "#FBBC05" },
  { title: "季節の大掃除", legacyTitleEn: "Seasonal Deep Clean", intervalDays: 45, isBigTask: true, icon: "sun", iconColor: "#FFFFFF", bgColor: "#4285F4" },
];

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: LOCAL_DATABASE_URL,
    },
  },
});

function recordTime(daysAgo, hour, minute) {
  const now = new Date();
  const dt = new Date(now);
  dt.setDate(now.getDate() - daysAgo);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}

function buildAdditionalRecords({ householdId, userId, chores, label, count, startIndex }) {
  const labelJa = label === "senri" ? "せんり" : label === "nozomi" ? "のぞみ" : label;
  const records = [];
  for (let i = 0; i < count; i += 1) {
    const absolute = startIndex + i;
    const chore = chores[(absolute * 7 + (label === "senri" ? 3 : 5)) % chores.length];
    const daysAgo = absolute + (label === "senri" ? 1 : 2);
    const hour = label === "senri" ? 20 - (absolute % 3) : 21 - (absolute % 3);
    const minute = (absolute * 11) % 60;
    records.push({
      householdId,
      choreId: chore.id,
      userId,
      performedAt: recordTime(daysAgo, hour, minute),
      memo: absolute % 5 === 0 ? `${labelJa}のメモ #${absolute + 1}` : null,
    });
  }
  return records;
}

async function migrateLegacyChoreTitles(householdId) {
  for (const template of CHORE_TEMPLATES) {
    await prisma.chore.updateMany({
      where: {
        householdId,
        title: template.legacyTitleEn,
      },
      data: {
        title: template.title,
      },
    });
  }
}

async function migrateLegacyRecordMemos(householdId) {
  const legacyRecords = await prisma.choreRecord.findMany({
    where: {
      householdId,
      OR: [{ memo: { startsWith: "senri log #" } }, { memo: { startsWith: "nozomi log #" } }],
    },
    select: { id: true, memo: true },
  });

  for (const rec of legacyRecords) {
    if (!rec.memo) continue;
    let memo = rec.memo;
    memo = memo.replace("senri log #", "せんりのメモ #");
    memo = memo.replace("nozomi log #", "のぞみのメモ #");
    await prisma.choreRecord.update({
      where: { id: rec.id },
      data: { memo },
    });
  }
}

async function main() {
  const senriCandidates = await prisma.user.findMany({
    where: { name: "senri" },
    orderBy: { createdAt: "asc" },
    select: { id: true, householdId: true, name: true },
  });

  if (!senriCandidates.length) {
    throw new Error("User 'senri' was not found. Create or register 'senri' first.");
  }

  const senri = senriCandidates[0];
  const household = await prisma.household.findUnique({
    where: { id: senri.householdId },
    select: { id: true, inviteCode: true },
  });

  if (!household) {
    throw new Error("Household for user 'senri' was not found.");
  }

  const existingNozomi = await prisma.user.findFirst({
    where: {
      householdId: senri.householdId,
      name: "nozomi",
    },
  });

  const nozomi =
    existingNozomi ??
    (await prisma.user.create({
      data: {
        householdId: senri.householdId,
        name: "nozomi",
        color: "#EA4335",
      },
    }));

  const existingChores = await prisma.chore.findMany({
    where: { householdId: senri.householdId, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const choresToAdd = Math.max(0, TARGET_CHORE_COUNT - existingChores.length);
  for (let i = 0; i < choresToAdd; i += 1) {
    const template = CHORE_TEMPLATES[i % CHORE_TEMPLATES.length];
    const defaultAssigneeId = i % 2 === 0 ? senri.id : nozomi.id;
    const { legacyTitleEn: _legacyTitleEn, ...choreData } = template;
    await prisma.chore.create({
      data: {
        householdId: senri.householdId,
        defaultAssigneeId,
        ...choreData,
      },
    });
  }

  await migrateLegacyChoreTitles(senri.householdId);

  const chores = await prisma.chore.findMany({
    where: { householdId: senri.householdId, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!chores.length) {
    throw new Error("No chores available after seeding.");
  }

  const [senriRecordCount, nozomiRecordCount] = await Promise.all([
    prisma.choreRecord.count({
      where: { householdId: senri.householdId, userId: senri.id },
    }),
    prisma.choreRecord.count({
      where: { householdId: senri.householdId, userId: nozomi.id },
    }),
  ]);

  const senriNeeded = Math.max(0, TARGET_RECORDS_PER_USER - senriRecordCount);
  const nozomiNeeded = Math.max(0, TARGET_RECORDS_PER_USER - nozomiRecordCount);

  const records = [
    ...buildAdditionalRecords({
      householdId: senri.householdId,
      userId: senri.id,
      chores,
      label: "senri",
      count: senriNeeded,
      startIndex: senriRecordCount,
    }),
    ...buildAdditionalRecords({
      householdId: senri.householdId,
      userId: nozomi.id,
      chores,
      label: "nozomi",
      count: nozomiNeeded,
      startIndex: nozomiRecordCount,
    }),
  ];

  if (records.length > 0) {
    await prisma.choreRecord.createMany({ data: records });
  }

  await migrateLegacyRecordMemos(senri.householdId);

  const [senriTotal, nozomiTotal, choreTotal] = await Promise.all([
    prisma.choreRecord.count({ where: { householdId: senri.householdId, userId: senri.id } }),
    prisma.choreRecord.count({ where: { householdId: senri.householdId, userId: nozomi.id } }),
    prisma.chore.count({ where: { householdId: senri.householdId, archived: false } }),
  ]);

  console.log("Seed completed (existing 'senri' mode).");
  console.log(`householdId: ${household.id}`);
  console.log(`inviteCode: ${household.inviteCode}`);
  console.log(`senri userId: ${senri.id}`);
  console.log(`nozomi userId: ${nozomi.id}`);
  console.log(`active chores: ${choreTotal} (target: ${TARGET_CHORE_COUNT})`);
  console.log(`senri records: ${senriTotal} (target: ${TARGET_RECORDS_PER_USER})`);
  console.log(`nozomi records: ${nozomiTotal} (target: ${TARGET_RECORDS_PER_USER})`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
