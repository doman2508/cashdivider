export type OpenBankingProviderId = "TRUELAYER" | "KONTOMATIK";

export type OpenBankingConnectionStatus = {
  connected: boolean;
  lastSyncAt: string | null;
  lastSourceName: string | null;
  lastAddedCount: number;
  lastSkippedCount: number;
};

export type OpenBankingProviderStatus = {
  provider: OpenBankingProviderId;
  environment: string;
  isConfigured: boolean;
  requirements: {
    provider: boolean;
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
  };
  missingFields: string[];
  redirectUri: string;
  connection: OpenBankingConnectionStatus;
  capabilities: {
    supportsHostedConsent: boolean;
    supportsDailySync: boolean;
    supportsManualProviderSelection: boolean;
  };
};

export type OpenBankingImportResult = {
  addedCount: number;
  skippedCount: number;
  affectedDates: string[];
  accountCount: number;
  transactionCount: number;
};

export interface OpenBankingProviderAdapter {
  readonly id: OpenBankingProviderId;
  getStatus(): Promise<OpenBankingProviderStatus>;
  buildMissingConfigCallbackUrl(origin: string): Promise<string>;
  buildAuthUrl(state: string): Promise<string>;
  importData(code: string): Promise<OpenBankingImportResult>;
}
