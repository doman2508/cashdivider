"use client";

import { useEffect, useState, useTransition } from "react";
import { fullDate, pln } from "@/src/lib/format";
import { ImportPanel } from "@/src/components/import-panel";
import styles from "./days-dashboard.module.css";

type BatchItem = {
  id: string;
  categoryName: string;
  targetLabel: string;
  targetAccountNumber: string;
  amount: number;
  paymentType: string;
};

type PaymentBatch = {
  id: string;
  status: "GENERATED" | "COMPLETED";
  totalAmount: number;
  leftoverAmount: number;
  createdAt: string;
  completedAt: string | null;
  items: BatchItem[];
};

type DayListItem = {
  id: string;
  date: string;
  totalIncome: number;
  status: "OPEN" | "SETTLED";
  settledAt: string | null;
  paymentBatch: PaymentBatch | null;
};

type DayDetail = DayListItem & {
  transactions: Array<{
    id: string;
    bookingDate: string;
    amount: number;
    description: string;
    counterparty: string | null;
  }>;
};

export function DaysDashboard() {
  const [days, setDays] = useState<DayListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadDays();
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDay(null);
      return;
    }

    void loadDayDetail(selectedDate);
  }, [selectedDate]);

  async function loadDays() {
    const response = await fetch("/api/days", { cache: "no-store" });
    const payload = (await response.json()) as { data: DayListItem[] };
    setDays(payload.data);
    setSelectedDate((current) => current ?? payload.data[0]?.date ?? null);
  }

  async function loadDayDetail(date: string) {
    const response = await fetch(`/api/days/${date}`, { cache: "no-store" });

    if (!response.ok) {
      setSelectedDay(null);
      return;
    }

    const payload = (await response.json()) as { data: DayDetail };
    setSelectedDay(payload.data);
  }

  function settleSelectedDay() {
    if (!selectedDate) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/days/${selectedDate}/settle`, {
        method: "POST",
      });

      if (!response.ok) {
        setError("Nie udalo sie zamknac dnia.");
        return;
      }

      await loadDays();
      await loadDayDetail(selectedDate);
    });
  }

  const selectedBatch = selectedDay?.paymentBatch ?? null;
  const latestDay = days[0] ?? null;

  return (
    <section className={styles.wrapper}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Dashboard</p>
          <h2>Dni i paczki z bazy</h2>
          <p className={styles.copy}>
            Ten widok jest juz podpiety do `/api/days`. Gdy do bazy trafia importy i podsumowania, dashboard pokazuje
            je bez udzialu danych demo.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>API: `/api/days`, `/api/days/:date`, `/api/days/:date/settle`</span>
          <span>Zakres tej iteracji: dni, szczegoly dnia, zamkniecie dnia</span>
        </div>
      </section>

      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Liczba dni</p>
          <h3>{days.length}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Ostatni dzien</p>
          <h3>{latestDay ? pln.format(latestDay.totalIncome) : "0,00 PLN"}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Paczka wybranego dnia</p>
          <h3>{selectedBatch ? pln.format(selectedBatch.totalAmount) : "0,00 PLN"}</h3>
        </article>
      </section>

      <ImportPanel onImported={loadDays} />

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Dni</p>
          <h3>Lista rozliczeniowa</h3>

          <div className={styles.daysList}>
            {days.length ? (
              days.map((day) => (
                <button
                  key={day.id}
                  className={`${styles.dayButton} ${selectedDate === day.date ? styles.dayButtonActive : ""}`}
                  onClick={() => setSelectedDate(day.date)}
                  type="button"
                >
                  <div>
                    <strong>{fullDate.format(new Date(day.date))}</strong>
                    <p>{day.paymentBatch ? `${day.paymentBatch.items.length} przelewow w paczce` : "Brak paczki"}</p>
                  </div>
                  <div>
                    <strong>{pln.format(day.totalIncome)}</strong>
                    <p>{day.status === "SETTLED" ? "Rozliczony" : "Do rozliczenia"}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className={styles.empty}>
                Brak dni w bazie. Kolejny krok to podpiecie importu ING, ktory zacznie zasilac te sekcje.
              </div>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Wybrany dzien</p>
          <h3>{selectedDay ? fullDate.format(new Date(selectedDay.date)) : "Brak danych"}</h3>

          {selectedDay ? (
            <>
              <p className={styles.copy}>
                Status: {selectedDay.status === "SETTLED" ? "Rozliczony" : "Do rozliczenia"}.
                {selectedDay.settledAt ? ` Zamknieto: ${new Date(selectedDay.settledAt).toLocaleString("pl-PL")}.` : ""}
              </p>

              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={settleSelectedDay}
                  disabled={isPending || selectedDay.status === "SETTLED"}
                >
                  Zamknij dzien
                </button>
              </div>

              {error ? <p className={styles.error}>{error}</p> : null}

              <div className={styles.stack}>
                {selectedBatch ? (
                  selectedBatch.items.map((item) => (
                    <div key={item.id} className={styles.item}>
                      <div>
                        <strong>Przelej na {item.targetLabel}</strong>
                        <p>
                          {item.categoryName} - {item.targetAccountNumber}
                        </p>
                      </div>
                      <strong>{pln.format(item.amount)}</strong>
                    </div>
                  ))
                ) : (
                  <div className={styles.empty}>Brak paczki przelewow dla wybranego dnia.</div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.empty}>Wybierz dzien z listy albo poczekaj, az import doda pierwsze podsumowanie.</div>
          )}
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Transakcje</p>
          <h3>Pozycje dnia</h3>
          <div className={styles.stack}>
            {selectedDay?.transactions?.length ? (
              selectedDay.transactions.map((transaction) => (
                <div key={transaction.id} className={styles.item}>
                  <div>
                    <strong>{transaction.description}</strong>
                    <p>{transaction.counterparty || "Brak kontrahenta"}</p>
                  </div>
                  <strong>{pln.format(transaction.amount)}</strong>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Brak transakcji dla wybranego dnia.</div>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Stan backendu</p>
          <h3>Co juz dziala</h3>
          <div className={styles.stack}>
            <div className={styles.item}>
              <div>
                <strong>Lista dni</strong>
                <p>GET /api/days</p>
              </div>
              <span className={styles.status}>OK</span>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Szczegol dnia</strong>
                <p>GET /api/days/:date</p>
              </div>
              <span className={styles.status}>OK</span>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Zamkniecie dnia</strong>
                <p>POST /api/days/:date/settle</p>
              </div>
              <span className={`${styles.status} ${styles.statusDone}`}>OK</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
