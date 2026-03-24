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

async function rebuildFinancialStateForDates(userId: string, affectedDates: string[]) {
  const uniqueDates = [...new Set(affectedDates)];

  for (const dateString of uniqueDates) {
    const targetDate = toUtcDateOnly(dateString);
    const transactions = await db.bankTransaction.findMany({
      where: {
        userId,
        bookingDate: targetDate,
      },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });

    const totalIncome = transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const rules = await db.allocationRule.findMany({
      where: { userId, isActive: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    const existingDay = await db.dailySummary.findUnique({
      where: {
        userId_date: {
          userId,
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

    if (!transactions.length) {
      if (existingDay) {
        await db.dailySummary.delete({ where: { id: existingDay.id } });
      }
      continue;
    }

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
            date: targetDate,
            totalIncome: new Prisma.Decimal(totalIncome.toFixed(2)),
            status: DailySummaryStatus.OPEN,
          },
        });

    if (existingDay?.paymentBatch) {
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

export async function importTransactions(input: ImportInput) {
  const user = await ensureDemoUser();
  const fingerprint = createFingerprint(`${input.sourceType}|${input.sourceName}|${input.content}`);

  const existingImport = await db.import.findUnique({
    where: {
      userId_fingerprint: {
        userId: user.id,
        fingerprint,
      },
    },
  });

  if (existingImport) {
    throw new Error("IMPORT_ALREADY_EXISTS");
  }

  const parsedTransactions =
    input.sourceType === "ING_CSV" ? parseIngCsv(input.content) : parseManualTransactions(input.content);

  if (!parsedTransactions.length) {
    throw new Error("NO_TRANSACTIONS_FOUND");
  }

  const existingKeys = new Set(
    (
      await db.bankTransaction.findMany({
        where: {
          userId: user.id,
          transactionKey: {
            in: parsedTransactions.map((transaction) => transaction.transactionKey),
          },
        },
        select: { transactionKey: true },
      })
    ).map((transaction) => transaction.transactionKey),
  );

  const freshTransactions = parsedTransactions.filter((transaction) => !existingKeys.has(transaction.transactionKey));

  const importRecord = await db.import.create({
    data: {
      userId: user.id,
      sourceType: input.sourceType === "ING_CSV" ? ImportSourceType.ING_CSV : ImportSourceType.MANUAL,
      sourceName: input.sourceName,
      fingerprint,
      addedCount: freshTransactions.length,
      skippedCount: parsedTransactions.length - freshTransactions.length,
    },
  });

  if (!freshTransactions.length) {
    return {
      importId: importRecord.id,
      addedCount: 0,
      skippedCount: parsedTransactions.length,
      affectedDates: [],
    };
  }

  await db.bankTransaction.createMany({
    data: freshTransactions.map((transaction) => ({
      userId: user.id,
      importId: importRecord.id,
      bookingDate: toUtcDateOnly(transaction.bookingDate),
      amount: new Prisma.Decimal(transaction.amount.toFixed(2)),
      description: transaction.description,
      counterparty: transaction.counterparty,
      transactionKey: transaction.transactionKey,
    })),
  });

  const affectedDates = [...new Set(freshTransactions.map((transaction) => transaction.bookingDate))];
  await rebuildFinancialStateForDates(user.id, affectedDates);

  return {
    importId: importRecord.id,
    addedCount: freshTransactions.length,
    skippedCount: parsedTransactions.length - freshTransactions.length,
    affectedDates,
  };
}
