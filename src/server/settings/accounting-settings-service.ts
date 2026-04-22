import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";
import { rebuildFinancialStateForUser } from "@/src/server/imports/imports-service";

function toUtcDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function shortIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function validateDate(value: string | null) {
  if (value == null) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("INVALID_ACCOUNTING_START_DATE");
  }

  return value;
}

export async function getAccountingSettings() {
  const user = await ensureDemoUser();
  const currentUser = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { accountingStartDate: true },
  });

  return {
    accountingStartDate: shortIsoDate(currentUser.accountingStartDate),
  };
}

export async function updateAccountingSettings(accountingStartDate: string | null) {
  const user = await ensureDemoUser();
  const normalizedDate = validateDate(accountingStartDate);

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      accountingStartDate: normalizedDate ? toUtcDateOnly(normalizedDate) : null,
    },
    select: { accountingStartDate: true },
  });

  await rebuildFinancialStateForUser(user.id);

  return {
    accountingStartDate: shortIsoDate(updatedUser.accountingStartDate),
  };
}
