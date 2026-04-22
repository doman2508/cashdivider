import { DailySummaryStatus, ImportSourceType, PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

type ParsedTransaction = {
  bookingDate: string;
  amount: number;
  description: string;
  counterparty: string | null;
  counterpartyAccountNumber?: string | null;
  accountKey?: string | null;
  accountLabel?: string | null;
  accountNumber?: string | null;
  accountDisplayName?: string | null;
  bankName?: string | null;
  details?: string | null;
  rawTitle?: string | null;
  externalTransactionId?: string | null;
  balanceAfter?: number | null;
  isInternalTransfer?: boolean;
  transactionKey: string;
};

type PreparsedTransaction = Omit<ParsedTransaction, "transactionKey"> & {
  lineIndex: number;
};

type ImportInput = {
  sourceType: "ING_CSV" | "MANUAL";
  sourceName: string;
  content: string;
};

type ParsedTransactionsImportInput = {
  sourceType: "ING_CSV" | "MANUAL";
  sourceName: string;
  fingerprintSource: string;
  parsedTransactions: ParsedTransaction[];
};

type SelectedAccount = {
  displayName: string;
  normalizedDisplayName: string;
  accountNumber: string;
};

function createFingerprint(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return String(hash);
}

function toUtcDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function shortIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeAccountDisplayName(value: string) {
  return value.replace(/\s*\(([^)]+)\)\s*$/g, "").trim();
}

function toAccountKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeHeader(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

function parsePolishNumber(value: string | null | undefined) {
  const normalized = value?.replace(/\s/g, "").replace(",", ".").trim() ?? "";

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function sanitizeAccountNumber(value: string | null | undefined) {
  const normalized = value?.replace(/['\s]/g, "").trim() ?? "";
  return normalized || null;
}

function setInferredAccountNumber(map: Map<string, string>, accountKey: string | null, accountNumber: string | null) {
  if (!accountKey || !accountNumber) {
    return;
  }

  const existing = map.get(accountKey);

  if (!existing) {
    map.set(accountKey, accountNumber);
  }
}

function parseSelectedAccounts(lines: string[], headerIndex: number) {
  const selectedAccounts: SelectedAccount[] = [];
  const startIndex = lines.findIndex((line) => line.includes('"Wybrane rachunki:"'));

  if (startIndex === -1) {
    return selectedAccounts;
  }

  for (const line of lines.slice(startIndex + 1, headerIndex)) {
    if (line.includes('"Zastosowane kryteria wyboru"')) {
      break;
    }

    const columns = parseCsvLine(line);
    const displayName = normalizeAccountDisplayName(columns[0] ?? "");
    const accountNumber = sanitizeAccountNumber(columns[2]);

    if (!displayName || !accountNumber) {
      continue;
    }

    selectedAccounts.push({
      displayName,
      normalizedDisplayName: normalizeHeader(displayName),
      accountNumber,
    });
  }

  return selectedAccounts;
}

function buildUniqueSelectedAccountMap(selectedAccounts: SelectedAccount[]) {
  const counts = new Map<string, number>();

  for (const account of selectedAccounts) {
    counts.set(account.normalizedDisplayName, (counts.get(account.normalizedDisplayName) ?? 0) + 1);
  }

  const uniqueAccounts = new Map<string, SelectedAccount>();

  for (const account of selectedAccounts) {
    if ((counts.get(account.normalizedDisplayName) ?? 0) === 1) {
      uniqueAccounts.set(account.normalizedDisplayName, account);
    }
  }

  return uniqueAccounts;
}

function parseIngCsv(rawInput: string): ParsedTransaction[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => line.includes('"Data transakcji"') && line.includes('"Kwota transakcji'));
  if (headerIndex === -1) {
    return [];
  }

  const selectedAccounts = parseSelectedAccounts(lines, headerIndex);
  const uniqueSelectedAccounts = buildUniqueSelectedAccountMap(selectedAccounts);
  const selectedAccountsByNumber = new Map(selectedAccounts.map((account) => [account.accountNumber, account]));

  const headers = parseCsvLine(lines[headerIndex]);
  const normalizedHeaders = headers.map(normalizeHeader);
  const transactionDateIndex = normalizedHeaders.indexOf("data transakcji");
  const bookingDateIndex = normalizedHeaders.indexOf("data ksiegowania");
  const contractorIndex = normalizedHeaders.indexOf("dane kontrahenta");
  const titleIndex = normalizedHeaders.findIndex((header) => header.startsWith("tytu"));
  const counterpartyAccountIndex = normalizedHeaders.indexOf("nr rachunku");
  const bankNameIndex = normalizedHeaders.indexOf("nazwa banku");
  const detailsIndex = normalizedHeaders.indexOf("szczegoly");
  const externalTransactionIdIndex = normalizedHeaders.indexOf("nr transakcji");
  const amountIndex = normalizedHeaders.indexOf("kwota transakcji (waluta rachunku)");
  const accountLabelIndex = normalizedHeaders.indexOf("konto");
  const balanceAfterIndex = normalizedHeaders.indexOf("saldo po transakcji");

  if (transactionDateIndex === -1 || amountIndex === -1) {
    return [];
  }

  const preparsedTransactions: PreparsedTransaction[] = [];

  for (const [lineIndex, line] of lines.slice(headerIndex + 1).entries()) {
    const columns = parseCsvLine(line);

    if (columns.length <= amountIndex) {
      continue;
    }

    const transactionDate = columns[transactionDateIndex]?.trim();
    const bookingDate = columns[bookingDateIndex]?.trim();
    const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)
      ? bookingDate
      : /^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
        ? transactionDate
        : null;
    const amount = parsePolishNumber(columns[amountIndex]);

    if (!effectiveDate || amount == null || amount === 0) {
      continue;
    }

    const counterparty = columns[contractorIndex]?.trim() || null;
    const rawTitle = columns[titleIndex]?.trim() || null;
    const description = [counterparty, rawTitle].filter(Boolean).join(" - ") || "Import z ING";
    const accountLabel = columns[accountLabelIndex]?.trim() || null;
    const normalizedAccountLabel = accountLabel ? normalizeHeader(accountLabel) : "";
    const selectedAccount = normalizedAccountLabel ? uniqueSelectedAccounts.get(normalizedAccountLabel) : undefined;

    preparsedTransactions.push({
      lineIndex,
      bookingDate: effectiveDate,
      amount,
      description,
      counterparty,
      counterpartyAccountNumber: sanitizeAccountNumber(columns[counterpartyAccountIndex]) ?? null,
      accountKey: toAccountKey(accountLabel),
      accountLabel,
      accountNumber: selectedAccount?.accountNumber ?? null,
      accountDisplayName: selectedAccount?.displayName ?? accountLabel,
      bankName: columns[bankNameIndex]?.trim() || null,
      details: columns[detailsIndex]?.trim() || null,
      rawTitle,
      externalTransactionId: sanitizeAccountNumber(columns[externalTransactionIdIndex]) ?? null,
      balanceAfter: parsePolishNumber(columns[balanceAfterIndex]),
      isInternalTransfer: false,
    });
  }

  const transactionsByExternalId = new Map<string, PreparsedTransaction[]>();

  for (const transaction of preparsedTransactions) {
    if (!transaction.externalTransactionId) {
      continue;
    }

    const existing = transactionsByExternalId.get(transaction.externalTransactionId) ?? [];
    existing.push(transaction);
    transactionsByExternalId.set(transaction.externalTransactionId, existing);
  }

  const inferredAccountNumbers = new Map<string, string>();

  for (const transactionGroup of transactionsByExternalId.values()) {
    const positiveCount = transactionGroup.filter((transaction) => transaction.amount > 0).length;
    const negativeCount = transactionGroup.filter((transaction) => transaction.amount < 0).length;
    const groupTotal = transactionGroup.reduce((sum, transaction) => sum + transaction.amount, 0);

    if (positiveCount > 0 && negativeCount > 0 && Math.abs(groupTotal) < 0.01) {
      for (const transaction of transactionGroup) {
        transaction.isInternalTransfer = true;
      }

      if (transactionGroup.length === 2) {
        const [left, right] = transactionGroup;
        setInferredAccountNumber(inferredAccountNumbers, left.accountKey ?? null, right.counterpartyAccountNumber ?? null);
        setInferredAccountNumber(inferredAccountNumbers, right.accountKey ?? null, left.counterpartyAccountNumber ?? null);
      }
    }
  }

  return preparsedTransactions.map((transaction) => {
    const accountNumber = transaction.accountNumber || inferredAccountNumbers.get(transaction.accountKey ?? "") || null;
    const selectedAccount = accountNumber ? selectedAccountsByNumber.get(accountNumber) : undefined;
    const accountDisplayName = selectedAccount?.displayName ?? transaction.accountDisplayName ?? transaction.accountLabel;

    return {
      ...transaction,
      accountNumber,
      accountDisplayName,
      transactionKey: createFingerprint(
        [
          transaction.bookingDate,
          transaction.amount.toFixed(2),
          transaction.externalTransactionId ?? "",
          transaction.accountKey ?? "",
          accountNumber ?? "",
          transaction.counterpartyAccountNumber ?? "",
          transaction.rawTitle ?? "",
          transaction.counterparty ?? "",
        ].join("|"),
      ),
    };
  });
}

function parseManualTransactions(rawInput: string): ParsedTransaction[] {
  const parsed = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;,\t]/).map((part) => part.trim());
      if (parts.length < 2) {
        return null;
      }

      const [bookingDate, amountRaw, description = "Import reczny"] = parts;
      const amount = parsePolishNumber(amountRaw);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || amount == null || amount <= 0) {
        return null;
      }

      return {
        bookingDate,
        amount,
        description,
        counterparty: null,
        counterpartyAccountNumber: null,
        accountKey: null,
        accountLabel: null,
        accountNumber: null,
        accountDisplayName: null,
        bankName: null,
        details: null,
        rawTitle: description,
        externalTransactionId: null,
        balanceAfter: null,
        isInternalTransfer: false,
        transactionKey: createFingerprint(`${bookingDate}|${amount}|${description}`),
      };
    })
    .filter((value) => value !== null);

  return parsed as ParsedTransaction[];
}

async function getAccountingStartDate(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { accountingStartDate: true },
  });

  return user?.accountingStartDate ? shortIsoDate(user.accountingStartDate) : null;
}

export async function rebuildFinancialStateForDates(userId: string, affectedDates: string[]) {
  const accountingStartDate = await getAccountingStartDate(userId);
  const uniqueDates = [...new Set(affectedDates)]
    .sort()
    .filter((date) => !accountingStartDate || date >= accountingStartDate);

  if (!uniqueDates.length) {
    return;
  }

  const targetDates = uniqueDates.map(toUtcDateOnly);
  const [transactions, rules, existingDays] = await Promise.all([
    db.bankTransaction.findMany({
      where: {
        userId,
        bookingDate: { in: targetDates },
        isExcluded: false,
        isInternalTransfer: false,
        amount: { gt: 0 },
      },
      orderBy: [{ bookingDate: "asc" }, { amount: "desc" }, { createdAt: "asc" }],
    }),
    db.allocationRule.findMany({
      where: { userId, isActive: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.dailySummary.findMany({
      where: {
        userId,
        date: { in: targetDates },
      },
      include: {
        paymentBatch: {
          select: {
            id: true,
          },
        },
      },
    }),
  ]);

  const transactionsByDate = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    const dateKey = transaction.bookingDate.toISOString().slice(0, 10);
    const bucket = transactionsByDate.get(dateKey);
    if (bucket) {
      bucket.push(transaction);
    } else {
      transactionsByDate.set(dateKey, [transaction]);
    }
  }

  const existingDaysByDate = new Map(
    existingDays.map((day) => [day.date.toISOString().slice(0, 10), day] as const),
  );

  const emptyDayIds = uniqueDates
    .filter((dateString) => !(transactionsByDate.get(dateString)?.length ?? 0))
    .map((dateString) => existingDaysByDate.get(dateString)?.id)
    .filter((value): value is string => Boolean(value));

  if (emptyDayIds.length) {
    await db.dailySummary.deleteMany({
      where: {
        id: {
          in: emptyDayIds,
        },
      },
    });
  }

  for (const dateString of uniqueDates) {
    const dayTransactions = transactionsByDate.get(dateString) ?? [];
    if (!dayTransactions.length) {
      continue;
    }

    const totalIncome = dayTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const allocations = rules.map((rule) => {
      const amount = Math.round((totalIncome * Number(rule.percentage)) * 100 / 10000);
      return {
        ruleId: rule.id,
        categoryName: rule.name,
        targetLabel: rule.targetLabel,
        targetAccountNumber: rule.targetAccountNumber,
        amount,
        paymentType: "przelew wlasny",
      };
    });

    const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
    const leftoverAmount = Number((totalIncome - allocatedTotal).toFixed(2));
    const existingDay = existingDaysByDate.get(dateString);

    const day = existingDay
      ? await db.dailySummary.update({
          where: { id: existingDay.id },
          data: {
            totalIncome: new Prisma.Decimal(totalIncome.toFixed(2)),
          },
        })
      : await db.dailySummary.create({
          data: {
            userId,
            date: toUtcDateOnly(dateString),
            totalIncome: new Prisma.Decimal(totalIncome.toFixed(2)),
            status: DailySummaryStatus.OPEN,
            includeInBatch: true,
          },
        });

    if (existingDay?.paymentBatch?.id) {
      await db.paymentBatchItem.deleteMany({
        where: { batchId: existingDay.paymentBatch.id },
      });

      await db.paymentBatch.update({
        where: { id: existingDay.paymentBatch.id },
        data: {
          totalAmount: new Prisma.Decimal(allocatedTotal.toFixed(2)),
          leftoverAmount: new Prisma.Decimal(leftoverAmount.toFixed(2)),
          status: day.status === DailySummaryStatus.SETTLED ? PaymentBatchStatus.COMPLETED : PaymentBatchStatus.GENERATED,
          completedAt: day.status === DailySummaryStatus.SETTLED ? day.settledAt : null,
          items: {
            create: allocations.map((allocation) => ({
              ruleId: allocation.ruleId,
              categoryName: allocation.categoryName,
              targetLabel: allocation.targetLabel,
              targetAccountNumber: allocation.targetAccountNumber,
              amount: new Prisma.Decimal(allocation.amount.toFixed(2)),
              paymentType: allocation.paymentType,
            })),
          },
        },
      });
    } else {
      await db.paymentBatch.create({
        data: {
          userId,
          dailySummaryId: day.id,
          totalAmount: new Prisma.Decimal(allocatedTotal.toFixed(2)),
          leftoverAmount: new Prisma.Decimal(leftoverAmount.toFixed(2)),
          status: day.status === DailySummaryStatus.SETTLED ? PaymentBatchStatus.COMPLETED : PaymentBatchStatus.GENERATED,
          completedAt: day.status === DailySummaryStatus.SETTLED ? day.settledAt : null,
          items: {
            create: allocations.map((allocation) => ({
              ruleId: allocation.ruleId,
              categoryName: allocation.categoryName,
              targetLabel: allocation.targetLabel,
              targetAccountNumber: allocation.targetAccountNumber,
              amount: new Prisma.Decimal(allocation.amount.toFixed(2)),
              paymentType: allocation.paymentType,
            })),
          },
        },
      });
    }
  }
}

export async function rebuildFinancialStateForUser(userId: string) {
  const accountingStartDate = await getAccountingStartDate(userId);

  if (accountingStartDate) {
    await db.dailySummary.deleteMany({
      where: {
        userId,
        date: {
          lt: toUtcDateOnly(accountingStartDate),
        },
      },
    });
  }

  const transactionDates = await db.bankTransaction.findMany({
    where: {
      userId,
      ...(accountingStartDate
        ? {
            bookingDate: {
              gte: toUtcDateOnly(accountingStartDate),
            },
          }
        : {}),
    },
    select: { bookingDate: true },
    distinct: ["bookingDate"],
    orderBy: { bookingDate: "desc" },
  });

  await rebuildFinancialStateForDates(
    userId,
    transactionDates.map((entry) => shortIsoDate(entry.bookingDate)),
  );
}

async function persistParsedTransactions(userId: string, input: ParsedTransactionsImportInput) {
  const fingerprint = createFingerprint(input.fingerprintSource);
  const existingImport = await db.import.findUnique({
    where: {
      userId_fingerprint: {
        userId,
        fingerprint,
      },
    },
  });

  if (existingImport) {
    throw new Error("IMPORT_ALREADY_EXISTS");
  }

  if (!input.parsedTransactions.length) {
    throw new Error("NO_TRANSACTIONS_FOUND");
  }

  const existingKeys = new Set(
    (
      await db.bankTransaction.findMany({
        where: {
          userId,
          transactionKey: {
            in: input.parsedTransactions.map((transaction) => transaction.transactionKey),
          },
        },
        select: { transactionKey: true },
      })
    ).map((transaction) => transaction.transactionKey),
  );

  const freshTransactions = input.parsedTransactions.filter((transaction) => !existingKeys.has(transaction.transactionKey));

  const importRecord = await db.import.create({
    data: {
      userId,
      sourceType: input.sourceType === "ING_CSV" ? ImportSourceType.ING_CSV : ImportSourceType.MANUAL,
      sourceName: input.sourceName,
      fingerprint,
      addedCount: freshTransactions.length,
      skippedCount: input.parsedTransactions.length - freshTransactions.length,
    },
  });

  if (!freshTransactions.length) {
    return {
      importId: importRecord.id,
      addedCount: 0,
      skippedCount: input.parsedTransactions.length,
      affectedDates: [],
    };
  }

  await db.bankTransaction.createMany({
    data: freshTransactions.map((transaction) => ({
      userId,
      importId: importRecord.id,
      bookingDate: toUtcDateOnly(transaction.bookingDate),
      amount: new Prisma.Decimal(transaction.amount.toFixed(2)),
      description: transaction.description,
      counterparty: transaction.counterparty,
      counterpartyAccountNumber: transaction.counterpartyAccountNumber ?? null,
      accountKey: transaction.accountKey ?? null,
      accountLabel: transaction.accountLabel ?? null,
      accountNumber: transaction.accountNumber ?? null,
      accountDisplayName: transaction.accountDisplayName ?? null,
      bankName: transaction.bankName ?? null,
      details: transaction.details ?? null,
      rawTitle: transaction.rawTitle ?? null,
      externalTransactionId: transaction.externalTransactionId ?? null,
      balanceAfter:
        typeof transaction.balanceAfter === "number" ? new Prisma.Decimal(transaction.balanceAfter.toFixed(2)) : null,
      isInternalTransfer: transaction.isInternalTransfer ?? false,
      transactionKey: transaction.transactionKey,
    })),
  });

  const affectedDates = [...new Set(freshTransactions.map((transaction) => transaction.bookingDate))];
  await rebuildFinancialStateForDates(userId, affectedDates);

  return {
    importId: importRecord.id,
    addedCount: freshTransactions.length,
    skippedCount: input.parsedTransactions.length - freshTransactions.length,
    affectedDates,
  };
}

export async function importParsedTransactions(input: ParsedTransactionsImportInput) {
  const user = await ensureDemoUser();
  return persistParsedTransactions(user.id, input);
}

export async function importTransactions(input: ImportInput) {
  const parsedTransactions =
    input.sourceType === "ING_CSV" ? parseIngCsv(input.content) : parseManualTransactions(input.content);

  return importParsedTransactions({
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    fingerprintSource: `${input.sourceType}|${input.sourceName}|${input.content}`,
    parsedTransactions,
  });
}
