import { getOpenBankingUserEmail } from "@/src/server/demo-user";
import { importParsedTransactions } from "@/src/server/imports/imports-service";
import { getLatestImportConnectionStatus } from "./shared";
import type { OpenBankingImportResult, OpenBankingProviderAdapter, OpenBankingProviderStatus } from "./types";

type TrueLayerAccount = {
  account_id: string;
  display_name?: string;
  provider?: {
    provider_id?: string;
  };
};

type TrueLayerTransaction = {
  transaction_id: string;
  normalised_provider_transaction_id?: string;
  provider_transaction_id?: string;
  timestamp: string;
  description: string;
  amount: number;
  currency: string;
  transaction_type: "CREDIT" | "DEBIT";
  merchant_name?: string;
};

function readClientId() {
  return process.env.OPEN_BANKING_CLIENT_ID?.trim() || process.env.client_id?.trim() || "";
}

function readClientSecret() {
  return process.env.OPEN_BANKING_CLIENT_SECRET?.trim() || process.env.CLIENT_SECRET?.trim() || "";
}

function readRedirectUri() {
  return process.env.OPEN_BANKING_REDIRECT_URI?.trim() || process.env.URL_REDIRECT?.trim() || "";
}

function readMockAuthUrl() {
  return process.env.MOCK_AUTH?.trim() || "";
}

function readAuthUrlTemplate() {
  return process.env.OPEN_BANKING_AUTH_URL?.trim() || readMockAuthUrl();
}

function readPreferredProviderId() {
  return process.env.OPEN_BANKING_TRUELAYER_PROVIDER_ID?.trim() || "";
}

function readEnvironment() {
  const explicitEnvironment = process.env.OPEN_BANKING_ENVIRONMENT?.trim().toLowerCase();

  if (explicitEnvironment === "sandbox" || explicitEnvironment === "live") {
    return explicitEnvironment;
  }

  if (readClientId().startsWith("sandbox-")) {
    return "sandbox";
  }

  return "live";
}

function getAuthBaseUrl() {
  return "https://auth.truelayer.com";
}

function getTokenBaseUrl() {
  return readEnvironment() === "sandbox" ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com";
}

function getDataApiBaseUrl() {
  return readEnvironment() === "sandbox" ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com";
}

function getRequiredEnvStatus() {
  return {
    provider: true,
    clientId: Boolean(readClientId()),
    clientSecret: Boolean(readClientSecret()),
    redirectUri: Boolean(readRedirectUri()),
  };
}

function getMissingFields() {
  const status = getRequiredEnvStatus();

  return Object.entries(status)
    .filter(([, isPresent]) => !isPresent)
    .map(([key]) => key);
}

async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: readClientId(),
    client_secret: readClientSecret(),
    redirect_uri: readRedirectUri(),
    code,
  });

  const response = await fetch(`${getTokenBaseUrl()}/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`TRUELAYER_TOKEN_EXCHANGE_FAILED:${response.status}:${errorBody}`);
  }

  return (await response.json()) as {
    access_token: string;
  };
}

async function fetchTrueLayerAccounts(accessToken: string) {
  const response = await fetch(`${getDataApiBaseUrl()}/data/v1/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`TRUELAYER_ACCOUNTS_FETCH_FAILED:${response.status}:${errorBody}`);
  }

  const payload = (await response.json()) as { results: TrueLayerAccount[] };
  return payload.results;
}

async function fetchTrueLayerTransactions(accessToken: string, accountId: string) {
  const response = await fetch(`${getDataApiBaseUrl()}/data/v1/accounts/${accountId}/transactions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`TRUELAYER_TRANSACTIONS_FETCH_FAILED:${response.status}:${errorBody}`);
  }

  const payload = (await response.json()) as { results: TrueLayerTransaction[] };
  return payload.results;
}

export class TrueLayerAdapter implements OpenBankingProviderAdapter {
  readonly id = "TRUELAYER" as const;

  async getStatus(): Promise<OpenBankingProviderStatus> {
    const missingFields = getMissingFields();

    return {
      provider: this.id,
      environment: readEnvironment(),
      isConfigured: missingFields.length === 0,
      requirements: getRequiredEnvStatus(),
      missingFields,
      redirectUri: readRedirectUri(),
      connection: await getLatestImportConnectionStatus(["TrueLayer"]),
      capabilities: {
        supportsHostedConsent: true,
        supportsDailySync: true,
        supportsManualProviderSelection: true,
      },
    };
  }

  async buildMissingConfigCallbackUrl(origin: string) {
    const url = new URL("/imports/open-banking/callback", origin);
    const status = await this.getStatus();

    url.searchParams.set("provider", this.id);
    url.searchParams.set("mode", "truelayer");
    url.searchParams.set("status", "missing_config");

    if (status.missingFields.length) {
      url.searchParams.set("missing", status.missingFields.join(","));
    }

    return url.toString();
  }

  async buildAuthUrl(state: string) {
    const status = await this.getStatus();

    if (!status.isConfigured) {
      throw new Error("OPEN_BANKING_NOT_CONFIGURED");
    }

    const authUrlTemplate = readAuthUrlTemplate();
    if (authUrlTemplate) {
      const url = new URL(authUrlTemplate);
      url.searchParams.set("redirect_uri", readRedirectUri());
      url.searchParams.set("state", state);
      return url.toString();
    }

    const url = new URL(`${getAuthBaseUrl()}/`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", readClientId());
    url.searchParams.set("redirect_uri", readRedirectUri());
    url.searchParams.set("scope", "info accounts balance transactions offline_access");
    url.searchParams.set("state", state);
    url.searchParams.set("language_id", "pl");

    const preferredProviderId = readPreferredProviderId();
    if (preferredProviderId) {
      url.searchParams.set("provider_id", preferredProviderId);
    }

    if (readEnvironment() === "sandbox") {
      url.searchParams.set("providers", "uk-cs-mock");
      url.searchParams.set("provider_id", preferredProviderId || "uk-cs-mock");
      url.searchParams.set("user_email", getOpenBankingUserEmail());
    }

    return url.toString();
  }

  async importData(code: string): Promise<OpenBankingImportResult> {
    const token = await exchangeCodeForToken(code);
    const accounts = await fetchTrueLayerAccounts(token.access_token);

    const parsedTransactions = (
      await Promise.all(
        accounts.map(async (account) => {
          const transactions = await fetchTrueLayerTransactions(token.access_token, account.account_id);

          return transactions
            .filter((transaction) => transaction.transaction_type === "CREDIT" && transaction.amount > 0)
            .map((transaction) => {
              const bookingDate = transaction.timestamp.slice(0, 10);
              const counterparty = transaction.merchant_name || account.display_name || account.provider?.provider_id || null;
              const stableId =
                transaction.normalised_provider_transaction_id ||
                transaction.provider_transaction_id ||
                transaction.transaction_id;

              return {
                bookingDate,
                amount: transaction.amount,
                description: transaction.description || "TrueLayer import",
                counterparty,
                transactionKey: `${account.account_id}|${stableId}`,
              };
            });
        }),
      )
    ).flat();

    const importResult = await importParsedTransactions({
      sourceType: "MANUAL",
      sourceName: readEnvironment() === "sandbox" ? "TrueLayer Mock" : "TrueLayer Live",
      fingerprintSource: `TRUELAYER|${readEnvironment().toUpperCase()}|${code}|${parsedTransactions
        .map((item) => item.transactionKey)
        .join("|")}`,
      parsedTransactions,
    });

    return {
      ...importResult,
      accountCount: accounts.length,
      transactionCount: parsedTransactions.length,
    };
  }
}
