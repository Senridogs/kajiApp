import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addDays, startOfJstDay } from "@/lib/time";

type DemoChore = {
  key: string;
  title: string;
  intervalDays: number;
  icon: string;
  iconColor: string;
  bgColor: string;
};

const DEMO_CHORES: DemoChore[] = [
  {
    key: "toilet",
    title: "トイレ掃除",
    intervalDays: 4,
    icon: "flame",
    iconColor: "#FFFFFF",
    bgColor: "#EA4335",
  },
  {
    key: "dish",
    title: "食器洗い",
    intervalDays: 1,
    icon: "sparkles",
    iconColor: "#FFFFFF",
    bgColor: "#FBBC05",
  },
  {
    key: "sink",
    title: "洗面台みがき",
    intervalDays: 2,
    icon: "droplets",
    iconColor: "#FFFFFF",
    bgColor: "#4285F4",
  },
  {
    key: "fan",
    title: "換気扇掃除",
    intervalDays: 30,
    icon: "wind",
    iconColor: "#FFFFFF",
    bgColor: "#34A853",
  },
  {
    key: "washer",
    title: "洗濯槽クリーニング",
    intervalDays: 45,
    icon: "washing-machine",
    iconColor: "#FFFFFF",
    bgColor: "#34A853",
  },
  {
    key: "bath",
    title: "お風呂 防カビ",
    intervalDays: 30,
    icon: "droplets",
    iconColor: "#FFFFFF",
    bgColor: "#34A853",
  },
];

function sampleSecondName(primaryName: string) {
  if (primaryName === "せんり") return "のぞみ";
  if (primaryName === "のぞみ") return "せんり";
  return "のぞみ";
}

function atJst(dayStart: Date, dayOffset: number, hour: number, minute: number) {
  return new Date(addDays(dayStart, dayOffset).getTime() + (hour * 60 + minute) * 60 * 1000);
}

function makeRecord(
  householdId: string,
  choreId: string,
  userId: string,
  performedAt: Date,
  memo?: string,
): Prisma.ChoreRecordCreateManyInput {
  return {
    householdId,
    choreId,
    userId,
    performedAt,
    memo: memo ?? null,
  };
}

function pickAlternate(users: [User, User], index: number) {
  return index % 2 === 0 ? users[0] : users[1];
}

export async function ensureDemoDataForHousehold(householdId: string, sessionUserId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.chore.count({ where: { householdId } });
    if (existing > 0) return;

    const householdUsers = await tx.user.findMany({
      where: { householdId },
      orderBy: { createdAt: "asc" },
    });
    if (!householdUsers.length) return;

    const first = householdUsers.find((u) => u.id === sessionUserId) ?? householdUsers[0];
    let second = householdUsers.find((u) => u.id !== first.id);
    if (!second) {
      second = await tx.user.create({
        data: {
          householdId,
          name: sampleSecondName(first.name),
        },
      });
    }

    const users: [User, User] = [first, second];

    const createdChores = await Promise.all(
      DEMO_CHORES.map((item) =>
        tx.chore.create({
          data: {
            householdId,
            title: item.title,
            intervalDays: item.intervalDays,
            icon: item.icon,
            iconColor: item.iconColor,
            bgColor: item.bgColor,
          },
        }),
      ),
    );

    const choreByKey = new Map(createdChores.map((chore, idx) => [DEMO_CHORES[idx].key, chore.id]));
    const todayStart = startOfJstDay(new Date());

    const records: Prisma.ChoreRecordCreateManyInput[] = [];

    const toiletId = choreByKey.get("toilet");
    const dishId = choreByKey.get("dish");
    const sinkId = choreByKey.get("sink");
    const fanId = choreByKey.get("fan");
    const washerId = choreByKey.get("washer");
    const bathId = choreByKey.get("bath");

    if (toiletId) {
      const offsets = [-26, -22, -18, -14, -10, -6, -5, -2];
      offsets.forEach((offset, idx) => {
        const performer = pickAlternate(users, idx);
        const memo =
          offset === -5 ? "便座裏を重点的に" : offset === -2 ? "床と壁まで掃除" : undefined;
        records.push(
          makeRecord(householdId, toiletId, performer.id, atJst(todayStart, offset, 20, 12), memo),
        );
      });
    }

    if (dishId) {
      const offsets = [-12, -10, -8, -6, -4, -3, -2, -1, 0];
      offsets.forEach((offset, idx) => {
        const performer = pickAlternate(users, idx + 1);
        records.push(
          makeRecord(householdId, dishId, performer.id, atJst(todayStart, offset, 19, 40)),
        );
      });
    }

    if (sinkId) {
      const offsets = [-19, -15, -11, -9, -7, -5, -3, -1];
      offsets.forEach((offset, idx) => {
        const performer = pickAlternate(users, idx);
        records.push(
          makeRecord(householdId, sinkId, performer.id, atJst(todayStart, offset, 6, 25)),
        );
      });
    }

    if (fanId) {
      [-83, -53, -23].forEach((offset, idx) => {
        const performer = pickAlternate(users, idx);
        records.push(
          makeRecord(householdId, fanId, performer.id, atJst(todayStart, offset, 10, 0)),
        );
      });
    }

    if (washerId) {
      [-130, -85, -40].forEach((offset, idx) => {
        const performer = pickAlternate(users, idx + 1);
        records.push(
          makeRecord(householdId, washerId, performer.id, atJst(todayStart, offset, 11, 30)),
        );
      });
    }

    if (bathId) {
      [-117, -87, -57, -27].forEach((offset, idx) => {
        const performer = pickAlternate(users, idx);
        records.push(
          makeRecord(householdId, bathId, performer.id, atJst(todayStart, offset, 9, 50)),
        );
      });
    }

    if (records.length) {
      await tx.choreRecord.createMany({ data: records });
    }
  });
}
