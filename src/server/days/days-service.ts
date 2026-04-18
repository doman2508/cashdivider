import { DailySummaryStatus, PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function toUtcDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function shortIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function titleDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function buildTransferTitle(categoryName: string, dateFrom: string, dateTo: string) {
  return dateFrom === dateTo
    ? `${categoryName} ${titleDate(dateFrom)}`
    : `${categoryName} ${titleDate(dateFrom)} do ${titleDate(dateTo)}`;
}

function serializeBatch(batch: {
  id: string;
  status: PaymentBatchStatus;
  totalAmount: Prisma.Decimal;
  leftoverAmount: Prisma.Decimal;
  createdAt: Date;
  completedAt: Date | null;
  items: Array<{
    id: string;
    categoryName: string;
    targetLabel: string;
    targetAccountNumber: string;
    amount: Prisma.Decimal;
    paymentType: string;
  }>;
} | null) {
  if (!batch) {
    return null;
  }

  return {
    id: batch.id,
    status: batch.status,
    totalAmount: decimalToNumber(batch.totalAmount),
    leftoverAmount: decimalToNumber(batch.leftoverAmount),
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    items: batch.items.map((item) => ({
    id: item.id,
    categoryName: item.categoryName,
    targetLabel: item.targetLabel,
    targetAccountNumber: item.targetAccountNumber,
    amount: decimalToNumber(item.amount),
    paymentType: item.paymentType,
    transferTitle: "",
  })),
  };
}

function serializeDay(day: {
  id: string;
  date: Date;
  totalIncome: Prisma.Decimal;
  status: DailySummaryStatus;
  includeInBatch: boolean;
  settledAt: Date | null;
  paymentBatch: {
    id: string;
    status: PaymentBatchStatus;
    totalAmount: Prisma.Decimal;
    leftoverAmount: Prisma.Decimal;
    createdAt: Date;
    completedAt: Date | null;
    items: Array<{
      id: string;
      categoryName: string;
      targetLabel: string;
      targetAccountNumber: string;
      amount: Prisma.Decimal;
      paymentType: string;
      transferTitle?: string;
    }>;
  } | null;
}) {
  return {
    id: day.id,
    date: day.date.toISOString().slice(0, 10),
    totalIncome: decimalToNumber(day.totalIncome),
    status: day.status,
    includeInBatch: day.includeInBatch,
    settledAt: day.settledAt?.toISOString() ?? null,
    paymentBatch: serializeBatch(day.paymentBatch),
  };
}

function applyTransferTitlesToBatch<T extends { paymentBatch: ReturnType<typeof serializeBatch>; date: string }>(day: T) {
  if (!day.paymentBatch) {
    return day;
  }

  return {
    ...day,
    paymentBatch: {
      ...day.paymentBatch,
      items: day.paymentBatch.items.map((item) => ({
        ...item,
        transferTitle: buildTransferTitle(item.categoryName, day.date, day.date),
      })),
    },
  };
}

type OpenBatchItem = {
  key: string;
  categoryName: string;
  targetLabel: string;
  targetAccountNumber: string;
  amount: number;
  paymentType: string;
  transferTitle: string;
};

export async function getOpenDaysBatch() {
  const user = await ensureDemoUser();
  const openDays = await db.dailySummary.findMany({
    where: {
      userId: user.id,
      status: DailySummaryStatus.OPEN,
      includeInBatch: true,
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  if (!openDays.length) {
    return {
      dayCount: 0,
      totalIncome: 0,
      totalAmount: 0,
      leftoverAmount: 0,
      dateFrom: null,
      dateTo: null,
      items: [] as OpenBatchItem[],
    };
  }

  const grouped = new Map<string, OpenBatchItem>();

  for (const day of openDays) {
    for (const item of day.paymentBatch?.items ?? []) {
      const key = [item.categoryName, item.targetLabel, item.targetAccountNumber, item.paymentType].join("|");
      const existing = grouped.get(key);

      if (existing) {
        existing.amount = Number((existing.amount + decimalToNumber(item.amount)).toFixed(2));
      } else {
        grouped.set(key, {
          key,
          categoryName: item.categoryName,
          targetLabel: item.targetLabel,
          targetAccountNumber: item.targetAccountNumber,
          amount: decimalToNumber(item.amount),
          paymentType: item.paymentType,
          transferTitle: "",
        });
      }
    }
  }

  const dateFrom = shortIsoDate(openDays[0].date);
  const dateTo = shortIsoDate(openDays[openDays.length - 1].date);
  const items = [...grouped.values()].map((item) => ({
    ...item,
    transferTitle: buildTransferTitle(item.categoryName, dateFrom, dateTo),
  }));

  return {
    dayCount: openDays.length,
    totalIncome: openDays.reduce((sum, day) => sum + decimalToNumber(day.totalIncome), 0),
    totalAmount: Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    leftoverAmount: Number(
      openDays.reduce((sum, day) => sum + decimalToNumber(day.paymentBatch?.leftoverAmount ?? 0), 0).toFixed(2),
    ),
    dateFrom,
    dateTo,
    items,
  };
}

export async function settleOpenDaysBatch() {
  const user = await ensureDemoUser();
  const settledAt = new Date();

  const openDays = await db.dailySummary.findMany({
    where: {
      userId: user.id,
      status: DailySummaryStatus.OPEN,
      includeInBatch: true,
    },
    select: {
      id: true,
      paymentBatch: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!openDays.length) {
    return {
      settledDays: 0,
    };
  }

  const dayIds = openDays.map((day) => day.id);
  const batchIds = openDays.map((day) => day.paymentBatch?.id).filter((value): value is string => Boolean(value));

  await db.dailySummary.updateMany({
    where: {
      id: {
        in: dayIds,
      },
    },
    data: {
      status: DailySummaryStatus.SETTLED,
      settledAt,
    },
  });

  if (batchIds.length) {
    await db.paymentBatch.updateMany({
      where: {
        id: {
          in: batchIds,
        },
      },
      data: {
        status: PaymentBatchStatus.COMPLETED,
        completedAt: settledAt,
      },
    });
  }

  return {
    settledDays: dayIds.length,
  };
}

export async function listDays() {
  const user = await ensureDemoUser();
  const days = await db.dailySummary.findMany({
    where: { userId: user.id },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });

  return days.map((day) => applyTransferTitlesToBatch(serializeDay(day)));
}

export async function getDayDetail(date: string) {
  const user = await ensureDemoUser();
  const targetDate = toUtcDateOnly(date);

  const day = await db.dailySummary.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: targetDate,
      },
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!day) {
    return null;
  }

  const transactions = await db.bankTransaction.findMany({
    where: {
      userId: user.id,
      bookingDate: targetDate,
    },
    orderBy: [{ isExcluded: "asc" }, { amount: "desc" }, { createdAt: "asc" }],
  });

  return {
    ...applyTransferTitlesToBatch(serializeDay(day)),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      bookingDate: transaction.bookingDate.toISOString().slice(0, 10),
      amount: decimalToNumber(transaction.amount),
      description: transaction.description,
      counterparty: transaction.counterparty,
      isExcluded: transaction.isExcluded,
      excludedAt: transaction.excludedAt?.toISOString() ?? null,
    })),
  };
}

export async function settleDay(date: string) {
  const user = await ensureDemoUser();
  const targetDate = toUtcDateOnly(date);
  const settledAt = new Date();

  const day = await db.dailySummary.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: targetDate,
      },
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!day) {
    throw new Error("DAY_NOT_FOUND");
  }

  const updatedDay = await db.dailySummary.update({
    where: { id: day.id },
    data: {
      status: DailySummaryStatus.SETTLED,
      settledAt,
      includeInBatch: true,
      paymentBatch: day.paymentBatch
        ? {
            update: {
              status: PaymentBatchStatus.COMPLETED,
              completedAt: settledAt,
            },
          }
        : undefined,
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  return applyTransferTitlesToBatch(serializeDay(updatedDay));
}

export async function reopenDay(date: string) {
  const user = await ensureDemoUser();
  const targetDate = toUtcDateOnly(date);

  const day = await db.dailySummary.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: targetDate,
      },
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!day) {
    throw new Error("DAY_NOT_FOUND");
  }

  const updatedDay = await db.dailySummary.update({
    where: { id: day.id },
    data: {
      status: DailySummaryStatus.OPEN,
      settledAt: null,
      paymentBatch: day.paymentBatch
        ? {
            update: {
              status: PaymentBatchStatus.GENERATED,
              completedAt: null,
            },
          }
        : undefined,
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  return applyTransferTitlesToBatch(serializeDay(updatedDay));
}

export async function toggleDayBatchInclusion(date: string, includeInBatch: boolean) {
  const user = await ensureDemoUser();
  const targetDate = toUtcDateOnly(date);

  const day = await db.dailySummary.findUnique({
    where: {
      userId_date: {
        userId: user.id,
        date: targetDate,
      },
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!day) {
    throw new Error("DAY_NOT_FOUND");
  }

  const updatedDay = await db.dailySummary.update({
    where: { id: day.id },
    data: {
      includeInBatch,
    },
    include: {
      paymentBatch: {
        include: {
          items: true,
        },
      },
    },
  });

  return applyTransferTitlesToBatch(serializeDay(updatedDay));
}
