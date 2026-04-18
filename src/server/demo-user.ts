import { db } from "@/src/server/db";

export const DEMO_USER_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@cashdivider.local";

const globalForDemoUser = globalThis as typeof globalThis & {
  cashdividerDemoUserPromise?: ReturnType<typeof db.user.upsert>;
};

export async function ensureDemoUser() {
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

  try {
    return await globalForDemoUser.cashdividerDemoUserPromise;
  } catch (error) {
    globalForDemoUser.cashdividerDemoUserPromise = undefined;
    throw error;
  }
}
