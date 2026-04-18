import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";
import { rebuildFinancialStateForDates } from "@/src/server/imports/imports-service";

export async function toggleTransactionExclusion(transactionId: string, exclude: boolean) {
  const user = await ensureDemoUser();

  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      userId: user.id,
    },
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  const updatedTransaction = await db.bankTransaction.update({
    where: { id: transaction.id },
    data: {
      isExcluded: exclude,
      excludedAt: exclude ? new Date() : null,
    },
  });

  await rebuildFinancialStateForDates(user.id, [updatedTransaction.bookingDate.toISOString().slice(0, 10)]);

  return {
    id: updatedTransaction.id,
    isExcluded: updatedTransaction.isExcluded,
    excludedAt: updatedTransaction.excludedAt?.toISOString() ?? null,
    bookingDate: updatedTransaction.bookingDate.toISOString().slice(0, 10),
  };
}
