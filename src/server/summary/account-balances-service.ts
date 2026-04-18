import { PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

type AccountAccumulator = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
};

export async function getAccountBalancesSummary() {
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

  const accounts = new Map<string, AccountAccumulator>();

  for (const day of days) {
    for (const item of day.paymentBatch?.items ?? []) {
      const key = `${item.targetLabel}|${item.targetAccountNumber}|${item.categoryName}`;
      const existing = accounts.get(key) ?? {
        key,
        name: item.categoryName,
        targetLabel: item.targetLabel,
        targetAccountNumber: item.targetAccountNumber,
        totalAmount: 0,
        pendingAmount: 0,
      };

      const amount = decimalToNumber(item.amount);
      existing.totalAmount += amount;

      if (day.paymentBatch?.status === PaymentBatchStatus.GENERATED) {
        existing.pendingAmount += amount;
      }

      accounts.set(key, existing);
    }
  }

  return {
    accounts: Array.from(accounts.values())
      .map((account) => ({
        ...account,
        totalAmount: Number(account.totalAmount.toFixed(2)),
        pendingAmount: Number(account.pendingAmount.toFixed(2)),
        settledAmount: Number((account.totalAmount - account.pendingAmount).toFixed(2)),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount),
  };
}
