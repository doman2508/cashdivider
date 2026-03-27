type ProviderId = "TRUELAYER" | "KONTOMATIK" | "GOCARDLESS";

type ProviderDefinition = {
  id: ProviderId;
  label: string;
  marketFit: string;
  notes: string;
};

const providerDefinitions: ProviderDefinition[] = [
  {
    id: "TRUELAYER",
    label: "TrueLayer",
    marketFit: "Najlepszy kandydat do pierwszego spike'a z kontem Mock i Data API.",
    notes: "Dobry dev experience na start, szybki test auth linku, callbacku i pobrania testowych transakcji.",
  },
  {
    id: "KONTOMATIK",
    label: "Kontomatik",
    marketFit: "Mocny plan B pod Polske i CEE.",
    notes: "Warto go trzymac jako alternatywe, jesli coverage lub onboarding TrueLayer nie siadzie tak, jak chcemy.",
  },
  {
    id: "GOCARDLESS",
    label: "GoCardless Bank Account Data",
    marketFit: "Dobry plan B pod europejski open banking.",
    notes: "Warto rozpatrzyc, jesli bedziemy chcieli szerzej porownac dostawcow AIS.",
  },
];

export function getDataSourcesSummary() {
  const configuredProvider = (process.env.OPEN_BANKING_PROVIDER?.trim().toUpperCase() ?? "") as ProviderId | "";
  const hasClientId = Boolean(process.env.OPEN_BANKING_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(process.env.OPEN_BANKING_CLIENT_SECRET?.trim());
  const hasRedirectUri = Boolean(process.env.OPEN_BANKING_REDIRECT_URI?.trim());

  const recommendedProvider = providerDefinitions[0];
  const activeProvider = providerDefinitions.find((provider) => provider.id === configuredProvider) ?? null;
  const isOpenBankingConfigured = Boolean(activeProvider && hasClientId && hasClientSecret && hasRedirectUri);

  return {
    recommendedProvider,
    activeProvider,
    isOpenBankingConfigured,
    requirements: {
      providerSelected: Boolean(activeProvider),
      clientId: hasClientId,
      clientSecret: hasClientSecret,
      redirectUri: hasRedirectUri,
    },
    providers: providerDefinitions,
    csvImport: {
      status: "READY",
      notes: "CSV zostaje jako fallback, import historyczny i awaryjna sciezka zasilania danych.",
    },
    syncPlan: {
      status: isOpenBankingConfigured ? "READY_FOR_SPIKE" : "PLANNED",
      notes: isOpenBankingConfigured
        ? "Technicznie mozemy przejsc do spike'a auto-importu i dziennej synchronizacji."
        : "Najblizszy sensowny krok to spiac providera AIS, a potem uruchomic codzienny sync przez Railway job.",
    },
  };
}
