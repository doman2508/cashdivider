import { DailySummaryStatus, PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";
import { getAccountBalancesSummary } from "@/src/server/summary/account-balances-service";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
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

type PaymentBatchWithItems = {
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

function serializeBatch(batch: PaymentBatchWithItems, date: string) {
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
      transferTitle: buildTransferTitle(item.categoryName, date, date),
    })),
  };
}

export async function getDashboardSnapshot() {
  const user = await ensureDemoUser();

  const [days, accountBalanceSummary] = await Promise.all([
    db.dailySummary.findMany({
      where: { userId: user.id },
      include: {
        paymentBatch: {
          include: {
            items: true,
          },
        },
      },
      orderBy: { date: "desc" },
    }),
    getAccountBalancesSummary(),
  ]);

  const serializedDays = days.map((day) => {
    const date = shortIsoDate(day.date);

    return {
      id: day.id,
      date,
      totalIncome: decimalToNumber(day.totalIncome),
      status: day.status,
      includeInBatch: day.includeInBatch,
      settledAt: day.settledAt?.toISOString() ?? null,
      paymentBatch: serializeBatch(day.paymentBatch, date),
    };
  });

  const selectedDate =
    serializedDays.find((day) => day.status === DailySummaryStatus.OPEN)?.date ?? serializedDays[0]?.date ?? null;

  const selectedTransactions = selectedDate
    ? await db.bankTransaction.findMany({
        where: {
          userId: user.id,
          bookingDate: new Date(`${selectedDate}T00:00:00.000Z`),
        },
        orderBy: [{ isExcluded: "asc" }, { amount: "desc" }, { createdAt: "asc" }],
      })
    : [];

  const selectedDay = selectedDate
    ? (() => {
        const day = serializedDays.find((entry) => entry.date === selectedDate);
        if (!day) {
          return null;
        }

        return {
          ...day,
          transactions: selectedTransactions.map((transaction) => ({
            id: transaction.id,
            bookingDate: shortIsoDate(transaction.bookingDate),
            amount: decimalToNumber(transaction.amount),
            description: transaction.description,
            counterparty: transaction.counterparty,
            accountLabel: transaction.accountLabel,
            accountNumber: transaction.accountNumber,
            balanceAfter: decimalToNumber(transaction.balanceAfter),
            isInternalTransfer: transaction.isInternalTransfer,
            isExcluded: transaction.isExcluded,
            excludedAt: transaction.excludedAt?.toISOString() ?? null,
          })),
        };
      })()
    : null;

  const openDays = serializedDays.filter((day) => day.status === DailySummaryStatus.OPEN && day.includeInBatch);
  const dateFrom = openDays[0]?.date ?? null;
  const dateTo = openDays[openDays.length - 1]?.date ?? null;
  const openBatchMap = new Map<
    string,
    {
      key: string;
      categoryName: string;
      targetLabel: string;
      targetAccountNumber: string;
      amount: number;
      paymentType: string;
      transferTitle: string;
    }
  >();

  for (const day of openDays) {
    for (const item of day.paymentBatch?.items ?? []) {
      const key = [item.categoryName, item.targetLabel, item.targetAccountNumber, item.paymentType].join("|");
      const existing = openBatchMap.get(key);

      if (existing) {
        existing.amount = Number((existing.amount + item.amount).toFixed(2));
      } else {
        openBatchMap.set(key, {
          key,
          categoryName: item.categoryName,
          targetLabel: item.targetLabel,
          targetAccountNumber: item.targetAccountNumber,
          amount: item.amount,
          paymentType: item.paymentType,
          transferTitle: "",
        });
      }
    }
  }

  const openBatchItems = [...openBatchMap.values()].map((item) => ({
    ...item,
    transferTitle: dateFrom && dateTo ? buildTransferTitle(item.categoryName, dateFrom, dateTo) : "",
  }));

  return {
    days: serializedDays,
    selectedDate,
    selectedDay,
    openBatch: {
      dayCount: openDays.length,
      totalIncome: Number(openDays.reduce((sum, day) => sum + day.totalIncome, 0).toFixed(2)),
      totalAmount: Number(openBatchItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      leftoverAmount: Number(
        openDays.reduce((sum, day) => sum + (day.paymentBatch?.leftoverAmount ?? 0), 0).toFixed(2),
      ),
      dateFrom,
      dateTo,
      items: openBatchItems,
    },
    accountBalances: accountBalanceSummary.accounts,
  };
}
