"use client";

import { useEffect, useState } from "react";
import styles from "./open-banking-spike.module.css";

type OpenBankingStatus = {
  provider: string;
  environment: string;
  isConfigured: boolean;
  requirements: {
    provider: boolean;
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
  };
  missingFields: string[];
  connection: {
    connected: boolean;
    lastSyncAt: string | null;
    lastSourceName: string | null;
    lastAddedCount: number;
    lastSkippedCount: number;
  };
};

export function OpenBankingSpike() {
  const [status, setStatus] = useState<OpenBankingStatus | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    const response = await fetch("/api/open-banking/status", { cache: "no-store" });
    const payload = (await response.json()) as { data: OpenBankingStatus };
    setStatus(payload.data);
  }

  return (
    <section className={styles.panel}>
      <div>
        <p className={styles.eyebrow}>Spike AIS</p>
        <h3>Podlacz bank</h3>
        <p className={styles.copy}>
          Tu uruchamiasz consent flow providera i sprawdzasz, czy CashDivider potrafi pobrac konta oraz uznania bez
          recznego CSV.
        </p>
      </div>

      <div className={styles.statusCard}>
        <div>
          <strong>Provider</strong>
          <p>
            {status?.provider ?? "TRUELAYER"} · {status?.environment ?? "sandbox"}
          </p>
        </div>
        <span className={`${styles.badge} ${status?.isConfigured ? styles.badgeReady : styles.badgePlanned}`}>
          {status?.isConfigured ? "Gotowe do syncu" : "Brakuje konfiguracji"}
        </span>
      </div>

      {status?.connection.connected ? (
        <div className={styles.statusCard}>
          <div>
            <strong>Ostatnia synchronizacja</strong>
            <p>
              {status.connection.lastSyncAt
                ? new Date(status.connection.lastSyncAt).toLocaleString("pl-PL")
                : "Brak danych"}
            </p>
          </div>
          <span className={`${styles.badge} ${styles.badgeReady}`}>Polaczone</span>
        </div>
      ) : null}

      {status?.missingFields.length ? (
        <p className={styles.warning}>Brakujace pola env: {status.missingFields.join(", ")}</p>
      ) : (
        <p className={styles.success}>
          {status?.connection.connected
            ? `Ostatni sync ${status.connection.lastSourceName ?? "TrueLayer"} dodal ${status.connection.lastAddedCount} transakcji.`
            : "Konfiguracja wyglada dobrze. Mozesz uruchomic pierwszy sync przez provider flow."}
        </p>
      )}

      <a className={styles.primaryLink} href="/api/open-banking/connect">
        {status?.connection.connected ? "Synchronizuj ponownie" : "Uruchom flow spike'a"}
      </a>
    </section>
  );
}
