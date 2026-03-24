import { db } from "@/src/server/db";

export const DEMO_USER_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@cashdivider.local";

export async function ensureDemoUser() {
  return db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
    },
  });
}
