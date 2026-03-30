import { KontomatikAdapter } from "./kontomatik-adapter";
import { readConfiguredProvider } from "./shared";
import { TrueLayerAdapter } from "./truelayer-adapter";
import type { OpenBankingProviderAdapter } from "./types";

export function getOpenBankingProviderAdapter(): OpenBankingProviderAdapter {
  const configuredProvider = readConfiguredProvider();

  if (configuredProvider === "KONTOMATIK") {
    return new KontomatikAdapter();
  }

  return new TrueLayerAdapter();
}
