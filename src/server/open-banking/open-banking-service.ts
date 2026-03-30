import { getOpenBankingProviderAdapter } from "./providers";

const AUTH_STATE_COOKIE_NAME = "cashdivider_ob_state";

export async function getOpenBankingSpikeStatus() {
  return getOpenBankingProviderAdapter().getStatus();
}

export function getOpenBankingStateCookieName() {
  return AUTH_STATE_COOKIE_NAME;
}

export function createOpenBankingState() {
  return crypto.randomUUID();
}

export async function buildMissingConfigCallbackUrl(origin: string) {
  return getOpenBankingProviderAdapter().buildMissingConfigCallbackUrl(origin);
}

export async function buildOpenBankingAuthUrl(state: string) {
  return getOpenBankingProviderAdapter().buildAuthUrl(state);
}

export async function importOpenBankingData(code: string) {
  return getOpenBankingProviderAdapter().importData(code);
}
