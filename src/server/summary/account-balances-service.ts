import { PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function normalizeAccountKey(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") ?? "";
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
  importedBalance: number | null;
  importedBalanceAt: string | null;
};

async function buildAccountBalancesSummary(userId: string) {
  const [days, adjustments, importedBalanceTransactions] = await Promise.all([
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
    db.bankTransaction.findMany({
      where: {
        userId,
        accountKey: { not: null },
        balanceAfter: { not: null },
      },
      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const accounts = new Map<string, AccountAccumulator>();
  const importedBalances = new Map<
    string,
    {
      balance: number;
      balanceAt: string;
      accountLabel: string | null;
      accountNumber: string | null;
    }
  >();
  const importedAccounts = new Map<
    string,
    {
      key: string;
      name: string;
      targetLabel: string;
      targetAccountNumber: string;
      balance: number;
      balanceAt: string;
    }
  >();

  for (const transaction of importedBalanceTransactions) {
    const candidateKeys = [
      transaction.accountNumber ? `number:${transaction.accountNumber}` : null,
      transaction.accountKey ? `key:${transaction.accountKey}` : null,
      transaction.accountLabel ? `label:${normalizeAccountKey(transaction.accountLabel)}` : null,
    ].filter((value): value is string => Boolean(value));

    for (const candidateKey of candidateKeys) {
      if (!importedBalances.has(candidateKey)) {
        importedBalances.set(candidateKey, {
          balance: decimalToNumber(transaction.balanceAfter),
          balanceAt: transaction.bookingDate.toISOString(),
          accountLabel: transaction.accountLabel,
          accountNumber: transaction.accountNumber,
        });
      }
    }

    if (transaction.accountKey && !importedAccounts.has(transaction.accountKey)) {
      importedAccounts.set(transaction.accountKey, {
        key: transaction.accountKey,
        name: transaction.accountLabel || transaction.accountDisplayName || "Konto",
        targetLabel: transaction.accountLabel || transaction.accountDisplayName || "Konto",
        targetAccountNumber: transaction.accountNumber || transaction.accountLabel || transaction.accountKey,
        balance: decimalToNumber(transaction.balanceAfter),
        balanceAt: transaction.bookingDate.toISOString(),
      });
    }
  }

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

  for (const importedAccount of importedAccounts.values()) {
    if (!accounts.has(importedAccount.key)) {
      accounts.set(importedAccount.key, {
        key: importedAccount.key,
        name: importedAccount.name,
        targetLabel: importedAccount.targetLabel,
        targetAccountNumber: importedAccount.targetAccountNumber,
        totalAmount: 0,
        pendingAmount: 0,
        adjustmentTotal: 0,
      });
    }
  }

  return Array.from(accounts.values())
    .map((account) => {
      const settledAmount = account.totalAmount - account.pendingAmount;
      const importedBalance =
        importedBalances.get(`number:${account.targetAccountNumber}`) ||
        importedBalances.get(`label:${normalizeAccountKey(account.targetLabel)}`) ||
        importedBalances.get(`label:${normalizeAccountKey(account.name)}`) ||
        null;
      const baseBalance = importedBalance ? importedBalance.balance : settledAmount;

      return {
        ...account,
        totalAmount: Number(account.totalAmount.toFixed(2)),
        pendingAmount: Number(account.pendingAmount.toFixed(2)),
        settledAmount: Number(settledAmount.toFixed(2)),
        actualBalance: Number((baseBalance + account.adjustmentTotal).toFixed(2)),
        adjustmentTotal: Number(account.adjustmentTotal.toFixed(2)),
        importedBalance: importedBalance ? Number(importedBalance.balance.toFixed(2)) : null,
        importedBalanceAt: importedBalance?.balanceAt ?? null,
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
