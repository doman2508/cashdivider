import { DailySummaryStatus, ImportSourceType, PaymentBatchStatus, Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

type ParsedTransaction = {
  bookingDate: string;
  amount: number;
  description: string;
  counterparty: string | null;
  transactionKey: string;
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

function parseIngCsv(rawInput: string): ParsedTransaction[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => line.includes('"Data transakcji"') && line.includes('"Kwota transakcji'));
  if (headerIndex === -1) {
    return [];
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const normalizedHeaders = headers.map(normalizeHeader);
  const dateIndex = normalizedHeaders.indexOf("data transakcji");
  const contractorIndex = normalizedHeaders.indexOf("dane kontrahenta");
  const titleIndex = normalizedHeaders.findIndex((header) => header.startsWith("tytu"));
  const amountIndex = normalizedHeaders.indexOf("kwota transakcji (waluta rachunku)");

  if (dateIndex === -1 || amountIndex === -1) {
    return [];
  }

  return lines
    .slice(headerIndex + 1)
    .map((line) => parseCsvLine(line))
    .filter((columns) => columns.length > amountIndex)
    .map((columns) => {
      const bookingDate = columns[dateIndex]?.trim();
      const amountRaw = columns[amountIndex]?.trim();
      const counterparty = columns[contractorIndex]?.trim() || null;
      const title = columns[titleIndex]?.trim() || "";
      const amount = Number(amountRaw.replace(/\s/g, "").replace(",", "."));

      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || Number.isNaN(amount) || amount <= 0) {
        return null;
      }

      const description = [counterparty, title].filter(Boolean).join(" - ") || "Import z ING";

      return {
        bookingDate,
        amount,
        description,
        counterparty,
        transactionKey: createFingerprint(`${bookingDate}|${amount}|${description}|${counterparty || ""}`),
      };
    })
    .filter((value): value is ParsedTransaction => value !== null);
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
      const amount = Number(amountRaw.replace(/\s/g, "").replace(",", "."));

      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || Number.isNaN(amount) || amount <= 0) {
        return null;
      }

      return {
        bookingDate,
        amount,
        description,
        counterparty: null,
        transactionKey: createFingerprint(`${bookingDate}|${amount}|${description}`),
        };
      })
    .filter((value) => value !== null);

  return parsed as ParsedTransaction[];
}

export async function rebuildFinancialStateForDates(userId: string, affectedDates: string[]) {
  const uniqueDates = [...new Set(affectedDates)].sort();

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
