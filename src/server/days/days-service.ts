import { DailySummaryStatus, PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function toUtcDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
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
    })),
  };
}

function serializeDay(day: {
  id: string;
  date: Date;
  totalIncome: Prisma.Decimal;
  status: DailySummaryStatus;
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
    }>;
  } | null;
}) {
  return {
    id: day.id,
    date: day.date.toISOString().slice(0, 10),
    totalIncome: decimalToNumber(day.totalIncome),
    status: day.status,
    settledAt: day.settledAt?.toISOString() ?? null,
    paymentBatch: serializeBatch(day.paymentBatch),
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

  return days.map(serializeDay);
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
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
  });

  return {
    ...serializeDay(day),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      bookingDate: transaction.bookingDate.toISOString().slice(0, 10),
      amount: decimalToNumber(transaction.amount),
      description: transaction.description,
      counterparty: transaction.counterparty,
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

  return serializeDay(updatedDay);
}
