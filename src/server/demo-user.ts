import { User, Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import {
  getConfiguredOwnerBootstrapPassword,
  getConfiguredOwnerEmail,
  getSessionCookieName,
  getUserIdFromSessionToken,
  isOwnerAuthEnabled,
} from "@/src/server/auth/session";
import { createStoredPassword, verifyStoredPassword } from "@/src/server/auth/password";
import { db } from "@/src/server/db";

export const DEMO_USER_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@cashdivider.local";

const globalForDemoUser = globalThis as typeof globalThis & {
  cashdividerDemoUserPromise?: Promise<User>;
  cashdividerOwnerBootstrapPromise?:
    | {
        key: string;
        promise: Promise<User>;
      }
    | undefined;
};

function getOwnerBootstrapCacheKey() {
  return `${getConfiguredOwnerEmail()}::${getConfiguredOwnerBootstrapPassword()}`;
}

function readLegacyDemoUserPromise() {
  if (!globalForDemoUser.cashdividerDemoUserPromise) {
    globalForDemoUser.cashdividerDemoUserPromise = db.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: {},
      create: {
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
      },
    });
  }

  return globalForDemoUser.cashdividerDemoUserPromise;
}

async function userHasOwnedData(tx: Prisma.TransactionClient, userId: string) {
  const counts = await Promise.all([
    tx.allocationRule.count({ where: { userId } }),
    tx.import.count({ where: { userId } }),
    tx.bankTransaction.count({ where: { userId } }),
    tx.dailySummary.count({ where: { userId } }),
    tx.paymentBatch.count({ where: { userId } }),
    tx.subaccountBalanceAdjustment.count({ where: { userId } }),
  ]);

  return counts.some((count) => count > 0);
}

async function migrateDemoDataIfNeeded(tx: Prisma.TransactionClient, owner: User) {
  const demoUser = await tx.user.findUnique({
    where: {
      email: DEMO_USER_EMAIL,
    },
  });

  if (!demoUser || demoUser.id === owner.id) {
    return;
  }

  const ownerAlreadyHasData = await userHasOwnedData(tx, owner.id);

  if (ownerAlreadyHasData) {
    return;
  }

  await Promise.all([
    tx.allocationRule.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
    tx.import.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
    tx.bankTransaction.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
    tx.dailySummary.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
    tx.paymentBatch.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
    tx.subaccountBalanceAdjustment.updateMany({
      where: { userId: demoUser.id },
      data: { userId: owner.id },
    }),
  ]);

  await tx.user.delete({
    where: {
      id: demoUser.id,
    },
  });
}

export async function ensureOwnerUser() {
  const ownerEmail = getConfiguredOwnerEmail();

  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL_NOT_CONFIGURED");
  }

  const cacheKey = getOwnerBootstrapCacheKey();
  const existingCache = globalForDemoUser.cashdividerOwnerBootstrapPromise;

  if (existingCache?.key === cacheKey) {
    return existingCache.promise;
  }

  const promise = (async () => {
    const bootstrapPassword = getConfiguredOwnerBootstrapPassword();
    const existingOwner = await db.user.findUnique({
      where: {
        email: ownerEmail,
      },
    });

    const needsPasswordBootstrap =
      !existingOwner?.passwordHash || !existingOwner?.passwordSalt || Boolean(bootstrapPassword);

    if (needsPasswordBootstrap && !bootstrapPassword && !existingOwner?.passwordHash) {
      throw new Error("OWNER_PASSWORD_REQUIRED_FOR_BOOTSTRAP");
    }

    let nextPasswordData:
      | {
          passwordHash: string;
          passwordSalt: string;
        }
      | undefined;

    if (bootstrapPassword) {
      const alreadyMatches =
        existingOwner?.passwordHash && existingOwner?.passwordSalt
          ? await verifyStoredPassword(bootstrapPassword, {
              passwordHash: existingOwner.passwordHash,
              passwordSalt: existingOwner.passwordSalt,
            })
          : false;

      if (!alreadyMatches) {
        nextPasswordData = await createStoredPassword(bootstrapPassword);
      }
    } else if (!existingOwner?.passwordHash || !existingOwner?.passwordSalt) {
      throw new Error("OWNER_PASSWORD_REQUIRED_FOR_BOOTSTRAP");
    }

    return db.$transaction(async (tx) => {
      const owner = existingOwner
        ? await tx.user.update({
            where: { id: existingOwner.id },
            data: nextPasswordData ?? {},
          })
        : await tx.user.create({
            data: {
              email: ownerEmail,
              ...(nextPasswordData ?? {}),
            },
          });

      await migrateDemoDataIfNeeded(tx, owner);

      return tx.user.findUniqueOrThrow({
        where: {
          id: owner.id,
        },
      });
    });
  })();

  globalForDemoUser.cashdividerOwnerBootstrapPromise = {
    key: cacheKey,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    globalForDemoUser.cashdividerOwnerBootstrapPromise = undefined;
    throw error;
  }
}

export function getOpenBankingUserEmail() {
  return getConfiguredOwnerEmail() || DEMO_USER_EMAIL;
}

async function getOwnerUserFromSession() {
  await ensureOwnerUser();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getSessionCookieName())?.value;
  const userId = await getUserIdFromSessionToken(sessionToken);

  if (!userId) {
    throw new Error("AUTH_REQUIRED");
  }

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new Error("AUTH_USER_NOT_FOUND");
  }

  return user;
}

export async function ensureDemoUser() {
  if (isOwnerAuthEnabled()) {
    return getOwnerUserFromSession();
  }

  if (!globalForDemoUser.cashdividerDemoUserPromise) {
    globalForDemoUser.cashdividerDemoUserPromise = readLegacyDemoUserPromise();
  }

  try {
    return await globalForDemoUser.cashdividerDemoUserPromise;
  } catch (error) {
    globalForDemoUser.cashdividerDemoUserPromise = undefined;
    throw error;
  }
}
