import { db } from "@/src/server/db";
import { ensureDemoUser } from "@/src/server/demo-user";
import type { OpenBankingConnectionStatus, OpenBankingProviderId } from "./types";

export async function getLatestImportConnectionStatus(
  providerPrefixes: string[],
): Promise<OpenBankingConnectionStatus> {
  const user = await ensureDemoUser();
  const latestImport = await db.import.findFirst({
    where: {
      userId: user.id,
      OR: providerPrefixes.map((prefix) => ({
        sourceName: {
          startsWith: prefix,
        },
      })),
    },
    orderBy: { importedAt: "desc" },
  });

  if (!latestImport) {
    return {
      connected: false,
      lastSyncAt: null,
      lastSourceName: null,
      lastAddedCount: 0,
      lastSkippedCount: 0,
    };
  }

  return {
    connected: true,
    lastSyncAt: latestImport.importedAt.toISOString(),
    lastSourceName: latestImport.sourceName,
    lastAddedCount: latestImport.addedCount,
    lastSkippedCount: latestImport.skippedCount,
  };
}

export function readConfiguredProvider(): OpenBankingProviderId {
  const rawProvider = process.env.OPEN_BANKING_PROVIDER?.trim().toUpperCase();

  if (rawProvider === "KONTOMATIK") {
    return "KONTOMATIK";
  }

  return "TRUELAYER";
}
