import { PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function normalizeText(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function normalizeAccountKey(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function normalizeAccountNumber(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function hasRealAccountNumber(value: string | null | undefined) {
  return normalizeAccountNumber(value).length >= 10;
}

function collectSemanticTokens(...values: Array<string | null | undefined>) {
  const tokens = new Set<string>();

  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    tokens.add(normalized);

    if (normalized.includes("podat")) {
      tokens.add("tax");
    }

    if (
      normalized.includes("safe") ||
      normalized.includes("save") ||
      normalized.includes("savings") ||
      normalized.includes("oszczed")
    ) {
      tokens.add("savings");
    }
  }

  return tokens;
}

type AccountAccumulator = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
  adjustments: Array<{
    amount: number;
    createdAt: string;
  }>;
};

type ImportedAccountSnapshot = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  balance: number;
  balanceAt: string;
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

function scoreImportedAccountMatch(account: AccountAccumulator, importedAccount: ImportedAccountSnapshot) {
  const accountNumber = normalizeAccountNumber(account.targetAccountNumber);
  const importedNumber = normalizeAccountNumber(importedAccount.targetAccountNumber);

  if (hasRealAccountNumber(account.targetAccountNumber) && accountNumber === importedNumber) {
    return 100;
  }

  const accountLabels = new Set([
    normalizeText(account.targetLabel),
    normalizeText(account.name),
  ]);
  const importedLabels = new Set([
    normalizeText(importedAccount.targetLabel),
    normalizeText(importedAccount.name),
  ]);

  for (const accountLabel of accountLabels) {
    if (accountLabel && importedLabels.has(accountLabel)) {
      return 90;
    }
  }

  const accountTokens = collectSemanticTokens(account.targetLabel, account.name);
  const importedTokens = collectSemanticTokens(importedAccount.targetLabel, importedAccount.name);

  for (const token of accountTokens) {
    if (importedTokens.has(token)) {
      return 60;
    }
  }

  return 0;
}

function findMatchingImportedAccount(
  account: AccountAccumulator,
  importedAccounts: ImportedAccountSnapshot[],
  usedImportedAccountKeys: Set<string>,
) {
  let bestMatch: ImportedAccountSnapshot | null = null;
  let bestScore = 0;

  for (const importedAccount of importedAccounts) {
    if (usedImportedAccountKeys.has(importedAccount.key)) {
      continue;
    }

    const score = scoreImportedAccountMatch(account, importedAccount);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = importedAccount;
    }
  }

  return bestScore >= 60 ? bestMatch : null;
}

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
  const importedAccounts = new Map<string, ImportedAccountSnapshot>();

  for (const transaction of importedBalanceTransactions) {
    if (!transaction.accountKey || importedAccounts.has(transaction.accountKey)) {
      continue;
    }

    importedAccounts.set(transaction.accountKey, {
      key: transaction.accountKey,
      name: transaction.accountLabel || transaction.accountDisplayName || "Konto",
      targetLabel: transaction.accountLabel || transaction.accountDisplayName || "Konto",
      targetAccountNumber: transaction.accountNumber || transaction.accountLabel || transaction.accountKey,
      balance: decimalToNumber(transaction.balanceAfter),
      balanceAt: transaction.bookingDate.toISOString(),
    });
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
        adjustments: [],
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
      adjustments: [],
    };

    existing.adjustments.push({
      amount: decimalToNumber(adjustment.deltaAmount),
      createdAt: adjustment.createdAt.toISOString(),
    });
    accounts.set(adjustment.accountKey, existing);
  }

  const importedAccountsList = [...importedAccounts.values()];
  const usedImportedAccountKeys = new Set<string>();
  const summaries: AccountBalanceSummary[] = [];

  for (const account of accounts.values()) {
    const settledAmount = account.totalAmount - account.pendingAmount;
    const matchedImportedAccount = findMatchingImportedAccount(account, importedAccountsList, usedImportedAccountKeys);

    if (matchedImportedAccount) {
      usedImportedAccountKeys.add(matchedImportedAccount.key);
    }

    const importedBalance = matchedImportedAccount?.balance ?? null;
    const importedBalanceAt = matchedImportedAccount?.balanceAt ?? null;
    const effectiveAdjustments = importedBalanceAt
      ? account.adjustments.filter((adjustment) => adjustment.createdAt > importedBalanceAt)
      : account.adjustments;
    const adjustmentTotal = effectiveAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    const baseBalance = importedBalance ?? settledAmount;

    summaries.push({
      key: account.key,
      name: account.name,
      targetLabel: account.targetLabel,
      targetAccountNumber: account.targetAccountNumber,
      totalAmount: Number(account.totalAmount.toFixed(2)),
      pendingAmount: Number(account.pendingAmount.toFixed(2)),
      settledAmount: Number(settledAmount.toFixed(2)),
      actualBalance: Number((baseBalance + adjustmentTotal).toFixed(2)),
      adjustmentTotal: Number(adjustmentTotal.toFixed(2)),
      importedBalance: importedBalance != null ? Number(importedBalance.toFixed(2)) : null,
      importedBalanceAt,
    });
  }

  for (const importedAccount of importedAccountsList) {
    if (usedImportedAccountKeys.has(importedAccount.key)) {
      continue;
    }

    summaries.push({
      key: importedAccount.key,
      name: importedAccount.name,
      targetLabel: importedAccount.targetLabel,
      targetAccountNumber: importedAccount.targetAccountNumber,
      totalAmount: 0,
      pendingAmount: 0,
      settledAmount: 0,
      actualBalance: Number(importedAccount.balance.toFixed(2)),
      adjustmentTotal: 0,
      importedBalance: Number(importedAccount.balance.toFixed(2)),
      importedBalanceAt: importedAccount.balanceAt,
    });
  }

  return summaries.sort((left, right) => right.actualBalance - left.actualBalance);
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
