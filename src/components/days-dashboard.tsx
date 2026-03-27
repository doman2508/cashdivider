"use client";

import { useEffect, useState, useTransition } from "react";
import { fullDate, pln } from "@/src/lib/format";
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

type DaysFilter = "OPEN" | "SETTLED" | "ALL";

function pickPreferredDate(days: DayListItem[], current: string | null) {
  if (!days.length) {
    return null;
  }

  if (current && days.some((day) => day.date === current)) {
    return current;
  }

  const latestOpenDay = days.find((day) => day.status === "OPEN");
  return latestOpenDay?.date ?? days[0]?.date ?? null;
}

export function DaysDashboard() {
  const [days, setDays] = useState<DayListItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);
  const [filter, setFilter] = useState<DaysFilter>("OPEN");
  const [showTransactions, setShowTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDays, setIsLoadingDays] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
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
    setIsLoadingDays(true);
    const response = await fetch("/api/days", { cache: "no-store" });
    const payload = (await response.json()) as { data: DayListItem[] };
    setDays(payload.data);
    setSelectedDate((current) => pickPreferredDate(payload.data, current));
    setIsLoadingDays(false);
  }

  async function loadDayDetail(date: string) {
    setIsLoadingDetail(true);
    const response = await fetch(`/api/days/${date}`, { cache: "no-store" });

    if (!response.ok) {
      setSelectedDay(null);
      setIsLoadingDetail(false);
      return;
    }

    const payload = (await response.json()) as { data: DayDetail };
    setSelectedDay(payload.data);
    setShowTransactions(false);
    setIsLoadingDetail(false);
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

      const refreshedResponse = await fetch("/api/days", { cache: "no-store" });
      const refreshedPayload = (await refreshedResponse.json()) as { data: DayListItem[] };
      const refreshedDays = refreshedPayload.data;
      setDays(refreshedDays);

      const nextOpenDay = refreshedDays.find((day) => day.status === "OPEN");
      const nextDate = nextOpenDay?.date ?? selectedDate;
      setSelectedDate(nextDate);

      await loadDayDetail(nextDate);
    });
  }

  const filteredDays = days.filter((day) => {
    if (filter === "ALL") {
      return true;
    }

    return day.status === filter;
  });
  const selectedBatch = selectedDay?.paymentBatch ?? null;
  const latestDay = days[0] ?? null;
  const visibleSelectedDay = selectedDay?.date === selectedDate ? selectedDay : null;
  const openDaysCount = days.filter((day) => day.status === "OPEN").length;
  const settledDaysCount = days.length - openDaysCount;

  return (
    <section className={styles.wrapper}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Dashboard</p>
          <h2>Dni i paczki przelewow</h2>
          <p className={styles.copy}>
            Ten widok czyta dane prosto z `/api/days`. Po imporcie wyciagu od razu widzisz kwoty dnia, transakcje i
            paczke przelewow do wykonania.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>API: `/api/days`, `/api/days/:date`, `/api/days/:date/settle`</span>
          <span>Codzienny rytm: import, podzial, zamkniecie dnia</span>
        </div>
      </section>

      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Otwarte dni</p>
          <h3>{isLoadingDays ? "..." : openDaysCount}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Ostatni dzien</p>
          <h3>{isLoadingDays ? "..." : latestDay ? pln.format(latestDay.totalIncome) : "0,00 PLN"}</h3>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Rozliczone dni</p>
          <h3>{isLoadingDays ? "..." : settledDaysCount}</h3>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Dni</p>
          <h3>Lista rozliczeniowa</h3>

          <div className={styles.filterRow}>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "OPEN" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("OPEN")}
            >
              Otwarte
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "SETTLED" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("SETTLED")}
            >
              Rozliczone
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "ALL" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("ALL")}
            >
              Wszystkie
            </button>
          </div>

          <div className={styles.daysList}>
            {isLoadingDays ? (
              <div className={styles.empty}>Ladowanie dni rozliczeniowych...</div>
            ) : filteredDays.length ? (
              filteredDays.map((day) => (
                <button
                  key={day.id}
                  className={`${styles.dayButton} ${selectedDate === day.date ? styles.dayButtonActive : ""}`}
                  onClick={() => {
                    if (day.date !== selectedDate) {
                      setSelectedDate(day.date);
                    }
                  }}
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
                {days.length
                  ? "Brak dni pasujacych do tego filtra."
                  : "Brak dni w bazie. Zaimportuj pierwszy wyciag, a lista od razu sie wypelni."}
              </div>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Wybrany dzien</p>
          <h3>{visibleSelectedDay ? fullDate.format(new Date(visibleSelectedDay.date)) : selectedDate || "Brak danych"}</h3>

          {isLoadingDetail ? (
            <div className={styles.empty}>Ladowanie danych wybranego dnia...</div>
          ) : visibleSelectedDay ? (
            <>
              <div className={styles.actionCard}>
                <div>
                  <p className={styles.actionLabel}>Do wykonania teraz</p>
                  <h4 className={styles.amountDisplay}>{selectedBatch ? pln.format(selectedBatch.totalAmount) : "0,00 PLN"}</h4>
                  <p className={styles.copy}>
                    {visibleSelectedDay.status === "SETTLED"
                      ? `Dzien zamkniety ${visibleSelectedDay.settledAt ? new Date(visibleSelectedDay.settledAt).toLocaleString("pl-PL") : ""}.`
                      : "To laczna kwota, ktora powinna trafic dzisiaj na subkonta."}
                  </p>
                </div>
                <span className={`${styles.status} ${visibleSelectedDay.status === "SETTLED" ? styles.statusDone : ""}`}>
                  {visibleSelectedDay.status === "SETTLED" ? "Rozliczony" : "Do rozliczenia"}
                </span>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryTile}>
                  <p>Suma wplywow dnia</p>
                  <strong className={styles.amountInline}>{pln.format(visibleSelectedDay.totalIncome)}</strong>
                </div>
                <div className={styles.summaryTile}>
                  <p>Zostaje na glownym</p>
                  <strong className={styles.amountInline}>{selectedBatch ? pln.format(selectedBatch.leftoverAmount) : "0,00 PLN"}</strong>
                </div>
              </div>

              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={settleSelectedDay}
                  disabled={isPending || visibleSelectedDay.status === "SETTLED"}
                >
                  {isPending ? "Zamykanie..." : "Zamknij dzien"}
                </button>
              </div>

              {error ? <p className={styles.error}>{error}</p> : null}

              <div className={styles.checklist}>
                {selectedBatch ? (
                  selectedBatch.items.length ? (
                    selectedBatch.items.map((item, index) => (
                    <div key={item.id} className={styles.checklistItem}>
                      <div>
                        <p className={styles.checkIndex}>Krok {index + 1}</p>
                        <strong>Przelej na {item.targetLabel}</strong>
                        <p>
                          {item.categoryName} - {item.targetAccountNumber}
                        </p>
                      </div>
                      <strong className={styles.amountInline}>{pln.format(item.amount)}</strong>
                    </div>
                  ))
                  ) : (
                    <div className={styles.empty}>Brak pozycji w paczce przelewow dla wybranego dnia.</div>
                  )
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
          <div className={styles.sectionHeader}>
            <h3>Pozycje dnia</h3>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setShowTransactions((current) => !current)}
              disabled={!visibleSelectedDay?.transactions?.length || isLoadingDetail}
            >
              {showTransactions ? "Ukryj" : "Pokaz"}
            </button>
          </div>
          {showTransactions ? (
            <div className={styles.stack}>
              {isLoadingDetail ? (
                <div className={styles.empty}>Ladowanie transakcji dnia...</div>
              ) : visibleSelectedDay?.transactions?.length ? (
                visibleSelectedDay.transactions.map((transaction) => (
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
          ) : (
            <div className={styles.empty}>
              {visibleSelectedDay?.transactions?.length
                ? `Lista zawiera ${visibleSelectedDay.transactions.length} wplat. Rozwin tylko, gdy chcesz sprawdzic szczegoly.`
                : "Brak transakcji dla wybranego dnia."}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Paczka dnia</p>
          <h3>Co trzeba zrobic</h3>
          <div className={styles.stack}>
            {isLoadingDetail ? (
              <div className={styles.empty}>Ladowanie paczki przelewow...</div>
            ) : selectedBatch ? (
              <>
                <div className={styles.item}>
                  <div>
                    <strong>Lacznie do przelania</strong>
                    <p>Suma wszystkich pozycji w paczce</p>
                  </div>
                  <strong className={styles.amountInline}>{pln.format(selectedBatch.totalAmount)}</strong>
                </div>
                <div className={styles.item}>
                  <div>
                    <strong>Zostaje na glownym koncie</strong>
                    <p>Kwota nieobjeta regulami procentowymi</p>
                  </div>
                  <strong className={styles.amountInline}>{pln.format(selectedBatch.leftoverAmount)}</strong>
                </div>
                <div className={styles.item}>
                  <div>
                    <strong>Status paczki</strong>
                    <p>{selectedBatch.status === "COMPLETED" ? "Przelewy wykonane" : "Czeka na wykonanie"}</p>
                  </div>
                  <span className={`${styles.status} ${selectedBatch.status === "COMPLETED" ? styles.statusDone : ""}`}>
                    {selectedBatch.status === "COMPLETED" ? "Zamknieta" : "Otwarta"}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.empty}>Brak paczki przelewow dla wybranego dnia.</div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
