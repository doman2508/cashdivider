import { getLatestImportConnectionStatus } from "./shared";
import type { OpenBankingImportResult, OpenBankingProviderAdapter, OpenBankingProviderStatus } from "./types";

function readEnvironment() {
  return process.env.OPEN_BANKING_ENVIRONMENT?.trim().toLowerCase() || "planned";
}

function readClientId() {
  return process.env.KONTOMATIK_CLIENT_ID?.trim() || "";
}

function readClientSecret() {
  return process.env.KONTOMATIK_CLIENT_SECRET?.trim() || "";
}

function readRedirectUri() {
  return process.env.KONTOMATIK_REDIRECT_URI?.trim() || "";
}

function getRequirements() {
  return {
    provider: true,
    clientId: Boolean(readClientId()),
    clientSecret: Boolean(readClientSecret()),
    redirectUri: Boolean(readRedirectUri()),
  };
}

function getMissingFields() {
  const status = getRequirements();

  return Object.entries(status)
    .filter(([, isPresent]) => !isPresent)
    .map(([key]) => key);
}

export class KontomatikAdapter implements OpenBankingProviderAdapter {
  readonly id = "KONTOMATIK" as const;

  async getStatus(): Promise<OpenBankingProviderStatus> {
    const missingFields = getMissingFields();

    return {
      provider: this.id,
      environment: readEnvironment(),
      isConfigured: false,
      requirements: getRequirements(),
      missingFields,
      redirectUri: readRedirectUri(),
      connection: await getLatestImportConnectionStatus(["Kontomatik"]),
      capabilities: {
        supportsHostedConsent: true,
        supportsDailySync: true,
        supportsManualProviderSelection: false,
      },
    };
  }

  async buildMissingConfigCallbackUrl(origin: string) {
    const url = new URL("/imports/open-banking/callback", origin);
    const status = await this.getStatus();

    url.searchParams.set("provider", this.id);
    url.searchParams.set("mode", "kontomatik");
    url.searchParams.set("status", "missing_config");

    if (status.missingFields.length) {
      url.searchParams.set("missing", status.missingFields.join(","));
    }

    return url.toString();
  }

  async buildAuthUrl(): Promise<string> {
    throw new Error("KONTOMATIK_NOT_IMPLEMENTED");
  }

  async importData(): Promise<OpenBankingImportResult> {
    throw new Error("KONTOMATIK_NOT_IMPLEMENTED");
  }
}
