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
  adjustmentTotal: number;
};

export type AccountBalanceSummary = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
  settledAmount: number;
  actualBalance: number;
  adjustmentTotal: number;
};

async function buildAccountBalancesSummary(userId: string) {
  const [days, adjustments] = await Promise.all([
    db.dailySummary.findMany({
      where: { userId },
      include: {
        paymentBatch: {
          include: {
            items: true,
          },
        },
      },
      orderBy: { date: "desc" },
    }),
    db.subaccountBalanceAdjustment.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

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
        adjustmentTotal: 0,
      };

      const amount = decimalToNumber(item.amount);
      existing.totalAmount += amount;

      if (day.paymentBatch?.status === PaymentBatchStatus.GENERATED) {
        existing.pendingAmount += amount;
      }

      accounts.set(key, existing);
    }
  }

  for (const adjustment of adjustments) {
    const existing = accounts.get(adjustment.accountKey) ?? {
      key: adjustment.accountKey,
      name: adjustment.categoryName,
      targetLabel: adjustment.targetLabel,
      targetAccountNumber: adjustment.targetAccountNumber,
      totalAmount: 0,
      pendingAmount: 0,
      adjustmentTotal: 0,
    };

    existing.adjustmentTotal += decimalToNumber(adjustment.deltaAmount);
    accounts.set(adjustment.accountKey, existing);
  }

  return Array.from(accounts.values())
    .map((account) => {
      const settledAmount = account.totalAmount - account.pendingAmount;

      return {
        ...account,
        totalAmount: Number(account.totalAmount.toFixed(2)),
        pendingAmount: Number(account.pendingAmount.toFixed(2)),
        settledAmount: Number(settledAmount.toFixed(2)),
        actualBalance: Number((settledAmount + account.adjustmentTotal).toFixed(2)),
        adjustmentTotal: Number(account.adjustmentTotal.toFixed(2)),
      };
    })
    .sort((left, right) => right.actualBalance - left.actualBalance);
}

export async function getAccountBalancesSummary() {
  const user = await ensureDemoUser();

  return {
    accounts: await buildAccountBalancesSummary(user.id),
  };
}

type SetActualBalanceInput = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  desiredBalance: number;
  note?: string | null;
};

export async function setSubaccountActualBalance(input: SetActualBalanceInput) {
  const user = await ensureDemoUser();
  const accounts = await buildAccountBalancesSummary(user.id);
  const account = accounts.find((entry) => entry.key === input.key);

  if (!account) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const desiredBalance = Number(input.desiredBalance.toFixed(2));
  const deltaAmount = Number((desiredBalance - account.actualBalance).toFixed(2));

  if (Math.abs(deltaAmount) >= 0.01) {
    await db.subaccountBalanceAdjustment.create({
      data: {
        userId: user.id,
        accountKey: input.key,
        categoryName: input.name,
        targetLabel: input.targetLabel,
        targetAccountNumber: input.targetAccountNumber,
        deltaAmount: new Prisma.Decimal(deltaAmount.toFixed(2)),
        resultingBalance: new Prisma.Decimal(desiredBalance.toFixed(2)),
        note: input.note?.trim() || null,
      },
    });
  }

  return {
    accounts: await buildAccountBalancesSummary(user.id),
  };
}
