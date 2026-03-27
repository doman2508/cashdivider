"use client";

import { useEffect, useState, useTransition } from "react";
import { pln } from "@/src/lib/format";
import styles from "./month-summary.module.css";

type MonthSummaryData = {
  month: string;
  totalIncome: number;
  totalAllocated: number;
  totalLeftover: number;
  pendingTransferAmount: number;
  daysCount: number;
  settledDaysCount: number;
  openDaysCount: number;
  categories: Array<{
    name: string;
    targetLabel: string;
    targetAccountNumber: string;
    totalAmount: number;
    pendingAmount: number;
  }>;
};

function getDefaultMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function MonthSummary() {
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);
  const [summary, setSummary] = useState<MonthSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadSummary(selectedMonth);
  }, [selectedMonth]);

  async function loadSummary(month: string) {
    setError(null);

    const response = await fetch(`/api/summary/month?month=${month}`, { cache: "no-store" });
    const payload = (await response.json()) as { data?: MonthSummaryData; message?: string };

    if (!response.ok || !payload.data) {
      setSummary(null);
      setError(payload.message ?? "Nie udalo sie pobrac podsumowania miesiaca.");
      return;
    }

    setSummary(payload.data);
  }

  function handleMonthChange(value: string) {
    startTransition(() => {
      setSelectedMonth(value);
    });
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Miesiac</p>
          <h2>Podsumowanie odkladania</h2>
          <p className={styles.copy}>
            Szybki widok na to, ile powinno juz byc odlozone w tym miesiacu i ile przelewow nadal czeka na wykonanie.
          </p>
        </div>

        <label className={styles.monthPicker}>
          Miesiac
          <input type="month" value={selectedMonth} onChange={(event) => handleMonthChange(event.target.value)} />
        </label>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Wplywy miesiaca</p>
          <h3 className={styles.amountDisplay}>{summary ? pln.format(summary.totalIncome) : "0,00 PLN"}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Do odlozenia lacznie</p>
          <h3 className={styles.amountDisplay}>{summary ? pln.format(summary.totalAllocated) : "0,00 PLN"}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Czeka na przelew</p>
          <h3 className={styles.amountDisplay}>{summary ? pln.format(summary.pendingTransferAmount) : "0,00 PLN"}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Zostaje do dyspozycji</p>
          <h3 className={styles.amountDisplay}>{summary ? pln.format(summary.totalLeftover) : "0,00 PLN"}</h3>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Postep miesiaca</p>
          <h3>Dni rozliczeniowe</h3>

          <div className={styles.stack}>
            <div className={styles.item}>
              <div>
                <strong>Wszystkie dni z wplywami</strong>
                <p>Ile dni w tym miesiacu ma juz dane z importu</p>
              </div>
              <strong>{summary?.daysCount ?? 0}</strong>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Zamkniete dni</strong>
                <p>Dni, dla ktorych paczka przelewow jest oznaczona jako wykonana</p>
              </div>
              <strong>{summary?.settledDaysCount ?? 0}</strong>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Otwarte dni</strong>
                <p>Dni, dla ktorych nadal zostal przelew do wykonania</p>
              </div>
              <strong>{summary?.openDaysCount ?? 0}</strong>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Kategorie</p>
          <h3>Ile powinno byc na subkontach</h3>

          <div className={styles.stack}>
            {summary?.categories.length ? (
              summary.categories.map((category) => (
                <div key={`${category.name}-${category.targetAccountNumber}`} className={styles.item}>
                  <div>
                    <strong>{category.name}</strong>
                    <p>{category.targetLabel}</p>
                    <p>{category.targetAccountNumber}</p>
                  </div>
                  <div className={styles.amounts}>
                    <strong className={styles.amountInline}>{pln.format(category.totalAmount)}</strong>
                    <span>{category.pendingAmount > 0 ? `Czeka: ${pln.format(category.pendingAmount)}` : "Bez zaleglosci"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.empty}>
                {isPending ? "Laduje miesiac..." : "Brak danych dla wybranego miesiaca. Zaimportuj wplywy albo wybierz inny miesiac."}
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
