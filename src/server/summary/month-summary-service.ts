import { PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function getMonthRange(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    throw new Error("INVALID_MONTH");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error("INVALID_MONTH");
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));

  return { start, end };
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

type CategoryAccumulator = {
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
};

export async function getMonthSummary(month = getCurrentMonth()) {
  const user = await ensureDemoUser();
  const { start, end } = getMonthRange(month);

  const days = await db.dailySummary.findMany({
    where: {
      userId: user.id,
      date: {
        gte: start,
        lt: end,
      },
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  const categories = new Map<string, CategoryAccumulator>();
  let totalIncome = 0;
  let totalAllocated = 0;
  let totalLeftover = 0;
  let pendingTransferAmount = 0;
  let settledDays = 0;

  for (const day of days) {
    totalIncome += decimalToNumber(day.totalIncome);

    if (day.status === "SETTLED") {
      settledDays += 1;
    }

    if (!day.paymentBatch) {
      totalLeftover += decimalToNumber(day.totalIncome);
      continue;
    }

    const batchTotal = decimalToNumber(day.paymentBatch.totalAmount);
    const batchLeftover = decimalToNumber(day.paymentBatch.leftoverAmount);

    totalAllocated += batchTotal;
    totalLeftover += batchLeftover;

    if (day.paymentBatch.status === PaymentBatchStatus.GENERATED) {
      pendingTransferAmount += batchTotal;
    }

    for (const item of day.paymentBatch.items) {
      const key = `${item.categoryName}|${item.targetLabel}|${item.targetAccountNumber}`;
      const existing = categories.get(key) ?? {
        name: item.categoryName,
        targetLabel: item.targetLabel,
        targetAccountNumber: item.targetAccountNumber,
        totalAmount: 0,
        pendingAmount: 0,
      };

      const amount = decimalToNumber(item.amount);
      existing.totalAmount += amount;

      if (day.paymentBatch.status === PaymentBatchStatus.GENERATED) {
        existing.pendingAmount += amount;
      }

      categories.set(key, existing);
    }
  }

  return {
    month,
    totalIncome: Number(totalIncome.toFixed(2)),
    totalAllocated: Number(totalAllocated.toFixed(2)),
    totalLeftover: Number(totalLeftover.toFixed(2)),
    pendingTransferAmount: Number(pendingTransferAmount.toFixed(2)),
    daysCount: days.length,
    settledDaysCount: settledDays,
    openDaysCount: days.length - settledDays,
    categories: Array.from(categories.values())
      .map((category) => ({
        ...category,
        totalAmount: Number(category.totalAmount.toFixed(2)),
        pendingAmount: Number(category.pendingAmount.toFixed(2)),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount),
  };
}
