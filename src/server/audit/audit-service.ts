import { Prisma } from "@prisma/client";
import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

export async function listImports() {
  const user = await ensureDemoUser();
  const imports = await db.import.findMany({
    where: { userId: user.id },
    orderBy: { importedAt: "desc" },
  });

  return imports.map((entry) => ({
    id: entry.id,
    sourceType: entry.sourceType,
    sourceName: entry.sourceName,
    fingerprint: entry.fingerprint,
    importedAt: entry.importedAt.toISOString(),
    addedCount: entry.addedCount,
    skippedCount: entry.skippedCount,
  }));
}

export async function listBatches() {
  const user = await ensureDemoUser();
  const batches = await db.paymentBatch.findMany({
    where: { userId: user.id },
    include: {
      dailySummary: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return batches.map((batch) => ({
    id: batch.id,
    date: batch.dailySummary.date.toISOString().slice(0, 10),
    status: batch.status,
    totalAmount: decimalToNumber(batch.totalAmount),
    leftoverAmount: decimalToNumber(batch.leftoverAmount),
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    itemCount: batch.items.length,
  }));
}
