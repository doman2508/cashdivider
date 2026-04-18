"use client";

import { useEffect, useState } from "react";
import styles from "./data-sources-panel.module.css";

export type DataSourcesPayload = {
  recommendedProvider: {
    id: string;
    label: string;
    marketFit: string;
    notes: string;
  };
  activeProvider: {
    id: string;
    label: string;
    marketFit: string;
    notes: string;
  } | null;
  isOpenBankingConfigured: boolean;
  requirements: {
    providerSelected: boolean;
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
  };
  providers: Array<{
    id: string;
    label: string;
    marketFit: string;
    notes: string;
  }>;
  csvImport: {
    status: string;
    notes: string;
  };
  syncPlan: {
    status: string;
    notes: string;
  };
};

type DataSourcesPanelProps = {
  initialData?: DataSourcesPayload | null;
};

export function DataSourcesPanel({ initialData = null }: DataSourcesPanelProps) {
  const [data, setData] = useState<DataSourcesPayload | null>(initialData);

  useEffect(() => {
    if (!initialData) {
      void loadDataSources();
    }
  }, [initialData]);

  async function loadDataSources() {
    const response = await fetch("/api/data-sources", { cache: "no-store" });
    const payload = (await response.json()) as { data: DataSourcesPayload };
    setData(payload.data);
  }

  return (
    <section className={styles.wrapper}>
      <div>
        <p className={styles.eyebrow}>Zrodla danych</p>
        <h2>Droga do automatycznego importu</h2>
        <p className={styles.copy}>
          Docelowo ta sekcja ma przejac codzienny odczyt uznan z banku. CSV zostaje, ale tylko jako backup i awaryjny
          fallback.
        </p>
      </div>

      <section className={styles.grid}>
        <article className={styles.panelPrimary}>
          <p className={styles.eyebrow}>Automatyczny sync banku</p>
          <h3>{data?.activeProvider ? data.activeProvider.label : data?.recommendedProvider.label ?? "Kontomatik"}</h3>
          <p className={styles.copy}>
            {data?.activeProvider
              ? "Ten provider jest wybrany jako glowny kandydat do AIS i codziennego importu."
              : "Najbardziej sensowny kierunek na teraz to AIS przez posrednika open banking, nie reczne pliki i nie bezposrednie API bankow."}
          </p>

          <div className={styles.badgeRow}>
            <span className={`${styles.badge} ${data?.isOpenBankingConfigured ? styles.badgeReady : styles.badgePlanned}`}>
              {data?.isOpenBankingConfigured ? "Konfiguracja gotowa do spike'a" : "Jeszcze nie skonfigurowane"}
            </span>
          </div>

          <div className={styles.requirements}>
            <div className={styles.requirementItem}>
              <span>Provider</span>
              <strong>{data?.requirements.providerSelected ? "OK" : "Brak"}</strong>
            </div>
            <div className={styles.requirementItem}>
              <span>Client ID</span>
              <strong>{data?.requirements.clientId ? "OK" : "Brak"}</strong>
            </div>
            <div className={styles.requirementItem}>
              <span>Client Secret</span>
              <strong>{data?.requirements.clientSecret ? "OK" : "Brak"}</strong>
            </div>
            <div className={styles.requirementItem}>
              <span>Redirect URI</span>
              <strong>{data?.requirements.redirectUri ? "OK" : "Brak"}</strong>
            </div>
          </div>

          <p className={styles.helper}>{data?.syncPlan.notes}</p>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Rekomendacja</p>
          <h3>Jak bym to ukladal</h3>
          <div className={styles.stack}>
              {data?.providers.map((provider) => (
                <div key={provider.id} className={styles.item}>
                  <div>
                    <strong>{provider.label}</strong>
                  <p>{provider.marketFit}</p>
                  <p>{provider.notes}</p>
                </div>
                <span className={`${styles.badge} ${provider.id === data.recommendedProvider.id ? styles.badgeRecommended : ""}`}>
                  {provider.id === data.recommendedProvider.id ? "Pierwszy wybor" : "Plan B"}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Backup</p>
          <h3>CSV i import reczny</h3>
          <p className={styles.copy}>{data?.csvImport.notes}</p>
          <span className={`${styles.badge} ${styles.badgeReady}`}>Dziala juz teraz</span>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Kolejny krok</p>
          <h3>Co zrobimy po AIS</h3>
          <div className={styles.stack}>
            <div className={styles.item}>
              <div>
                <strong>Codzienny sync na Railway</strong>
                <p>Job raz dziennie pobiera nowe uznania i przebudowuje dni oraz paczki.</p>
              </div>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Manual approval zostaje</strong>
                <p>System liczy i przygotowuje paczke, ale przelewy nadal potwierdzasz sam.</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
