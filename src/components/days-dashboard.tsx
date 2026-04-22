"use client";

import { useEffect, useState, useTransition } from "react";
import { fullDate, pln } from "@/src/lib/format";
import styles from "./days-dashboard.module.css";

export type BatchItem = {
  id: string;
  categoryName: string;
  targetLabel: string;
  targetAccountNumber: string;
  amount: number;
  paymentType: string;
  transferTitle: string;
};

export type PaymentBatch = {
  id: string;
  status: "GENERATED" | "COMPLETED";
  totalAmount: number;
  leftoverAmount: number;
  createdAt: string;
  completedAt: string | null;
  items: BatchItem[];
};

export type DayListItem = {
  id: string;
  date: string;
  totalIncome: number;
  status: "OPEN" | "SETTLED";
  includeInBatch: boolean;
  settledAt: string | null;
  paymentBatch: PaymentBatch | null;
};

export type DayDetail = DayListItem & {
  transactions: Array<{
    id: string;
    bookingDate: string;
    amount: number;
    description: string;
    counterparty: string | null;
    accountLabel: string | null;
    accountNumber: string | null;
    balanceAfter: number;
    isInternalTransfer: boolean;
    isExcluded: boolean;
    excludedAt: string | null;
  }>;
};

export type OpenDaysBatch = {
  dayCount: number;
  totalIncome: number;
  totalAmount: number;
  leftoverAmount: number;
  dateFrom: string | null;
  dateTo: string | null;
  items: Array<{
    key: string;
    categoryName: string;
    targetLabel: string;
    targetAccountNumber: string;
    amount: number;
    paymentType: string;
    transferTitle: string;
  }>;
};

type DaysFilter = "OPEN" | "SETTLED" | "ALL";

function hasRealAccountNumber(value: string | null | undefined) {
  return (value?.replace(/\D/g, "").length ?? 0) >= 10;
}

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

type DaysDashboardProps = {
  initialDays?: DayListItem[];
  initialSelectedDate?: string | null;
  initialSelectedDay?: DayDetail | null;
  initialOpenBatch?: OpenDaysBatch | null;
};

export function DaysDashboard({
  initialDays = [],
  initialSelectedDate = null,
  initialSelectedDay = null,
  initialOpenBatch = null,
}: DaysDashboardProps) {
  const [days, setDays] = useState<DayListItem[]>(initialDays);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(initialSelectedDay);
  const [openBatch, setOpenBatch] = useState<OpenDaysBatch | null>(initialOpenBatch);
  const [filter, setFilter] = useState<DaysFilter>("OPEN");
  const [showTransactions, setShowTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDays, setIsLoadingDays] = useState(initialDays.length === 0);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!initialDays.length) {
      void loadDays();
    }

    if (!initialOpenBatch) {
      void loadOpenBatch();
    }
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDay(null);
      return;
    }

    if (selectedDay && selectedDay.date === selectedDate) {
      return;
    }

    void loadDayDetail(selectedDate);
  }, [selectedDate, selectedDay]);

  async function loadDays() {
    setIsLoadingDays(true);
    const response = await fetch("/api/days", { cache: "no-store" });
    const payload = (await response.json()) as { data: DayListItem[] };
    setDays(payload.data);
    setSelectedDate((current) => pickPreferredDate(payload.data, current));
    setIsLoadingDays(false);
    return payload.data;
  }

  async function loadOpenBatch() {
    const response = await fetch("/api/batches/open", { cache: "no-store" });
    const payload = (await response.json()) as { data: OpenDaysBatch };
    setOpenBatch(payload.data);
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

  async function toggleExcluded(transactionId: string, exclude: boolean) {
    if (!selectedDate) {
      return;
    }

    setPendingTransactionId(transactionId);
    setError(null);

    const response = await fetch(`/api/transactions/${transactionId}/exclude`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ exclude }),
    });

    if (!response.ok) {
      setError("Nie udalo sie zaktualizowac pozycji dnia.");
      setPendingTransactionId(null);
      return;
    }

    await Promise.all([loadDays(), loadDayDetail(selectedDate), loadOpenBatch()]);
    setPendingTransactionId(null);
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

      const [refreshedDays] = await Promise.all([loadDays(), loadOpenBatch()]);
      setDays(refreshedDays);

      const nextOpenDay = refreshedDays.find((day) => day.status === "OPEN");
      const nextDate = nextOpenDay?.date ?? selectedDate;
      setSelectedDate(nextDate);

      await loadDayDetail(nextDate);
    });
  }

  function reopenSelectedDay() {
    if (!selectedDate) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/days/${selectedDate}/reopen`, {
        method: "POST",
      });

      if (!response.ok) {
        setError("Nie udalo sie otworzyc dnia.");
        return;
      }

      await Promise.all([loadDays(), loadDayDetail(selectedDate), loadOpenBatch()]);
    });
  }

  function toggleDayInBatch(includeInBatch: boolean) {
    if (!selectedDate) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/days/${selectedDate}/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ includeInBatch }),
      });

      if (!response.ok) {
        setError("Nie udalo sie zmienic udzialu dnia w paczce.");
        return;
      }

      await Promise.all([loadDays(), loadDayDetail(selectedDate), loadOpenBatch()]);
    });
  }

  function settleOpenBatch() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/batches/open/settle", {
        method: "POST",
      });

      if (!response.ok) {
        setError("Nie udalo sie zamknac calej paczki.");
        return;
      }

      const refreshedDays = await loadDays();
      await loadOpenBatch();

      const nextOpenDay = refreshedDays.find((day) => day.status === "OPEN" && day.includeInBatch)?.date ?? null;
      setSelectedDate(nextOpenDay);

      if (nextOpenDay) {
        await loadDayDetail(nextOpenDay);
      } else {
        setSelectedDay(null);
      }
    });
  }

  const filteredDays = days.filter((day) => {
    if (filter === "ALL") {
      return true;
    }

    return day.status === filter;
  });
  const selectedDateInCurrentFilter = selectedDate ? filteredDays.some((day) => day.date === selectedDate) : false;
  const visibleSelectedDay = selectedDateInCurrentFilter && selectedDay?.date === selectedDate ? selectedDay : null;
  const selectedBatch = visibleSelectedDay?.paymentBatch ?? null;
  const latestDay = days[0] ?? null;
  const openDaysCount = days.filter((day) => day.status === "OPEN").length;
  const settledDaysCount = days.length - openDaysCount;
  const shouldShowDetailColumns = filteredDays.length > 0 && selectedDateInCurrentFilter;

  useEffect(() => {
    if (!filteredDays.length) {
      return;
    }

    if (!selectedDateInCurrentFilter) {
      setSelectedDate(filteredDays[0]?.date ?? null);
    }
  }, [filteredDays, selectedDateInCurrentFilter]);

  return (
    <section className={styles.wrapper}>
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

      <section className={styles.panel}>
        <p className={styles.eyebrow}>Paczka zbiorcza</p>
        <div className={styles.sectionHeader}>
          <div>
            <h3>Otwarte dni do wykonania teraz</h3>
            <p className={styles.copy}>
              Jedna paczka dla wszystkich otwartych dni, z mozliwoscia wykluczenia pojedynczego dnia z biezacego zakresu.
            </p>
          </div>
          <span className={styles.status}>{openBatch?.dayCount ?? 0} dni</span>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryTile}>
            <p>Lacznie do przelania</p>
            <strong className={styles.amountInline}>{pln.format(openBatch?.totalAmount ?? 0)}</strong>
          </div>
          <div className={styles.summaryTile}>
            <p>Zakres paczki</p>
            <strong>
              {openBatch?.dateFrom
                ? openBatch.dateFrom === openBatch.dateTo
                  ? fullDate.format(new Date(openBatch.dateFrom))
                  : `${fullDate.format(new Date(openBatch.dateFrom))} - ${fullDate.format(new Date(openBatch.dateTo ?? openBatch.dateFrom))}`
                : "Brak otwartych dni"}
            </strong>
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={settleOpenBatch}
            disabled={isPending || !openBatch?.items.length}
          >
            {isPending ? "Zamykanie paczki..." : "Zamknij cala paczke"}
          </button>
        </div>

        <div className={styles.checklist}>
          {openBatch?.items.length ? (
            openBatch.items.map((item) => (
              <div key={item.key} className={styles.checklistItem}>
                <div>
                  <strong>Przelej na {item.targetLabel}</strong>
                  <p>
                    {item.categoryName} - {item.targetAccountNumber}
                  </p>
                  <p className={styles.helperText}>Tytul: {item.transferTitle}</p>
                </div>
                <strong className={styles.amountInline}>{pln.format(item.amount)}</strong>
              </div>
            ))
          ) : (
            <div className={styles.empty}>Brak otwartych dni uwzglednionych w paczce zbiorczej.</div>
          )}
        </div>
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
                    <p>
                      {day.paymentBatch ? `${day.paymentBatch.items.length} przelewow w paczce` : "Brak paczki"}
                      {day.status === "OPEN"
                        ? day.includeInBatch
                          ? " · w paczce zbiorczej"
                          : " · poza paczka zbiorcza"
                        : ""}
                    </p>
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
                  ? filter === "OPEN"
                    ? "Wszystkie dni sa teraz rozliczone. Przelacz filtr na Rozliczone lub Wszystkie, jesli chcesz przejrzec historie."
                    : "Brak dni pasujacych do tego filtra."
                  : "Brak dni w bazie. Zaimportuj pierwszy wyciag, a lista od razu sie wypelni."}
              </div>
            )}
          </div>
        </article>

        {shouldShowDetailColumns ? (
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
                {visibleSelectedDay.status === "SETTLED" ? (
                  <button className={styles.ghostButton} type="button" onClick={reopenSelectedDay} disabled={isPending}>
                    {isPending ? "Otwieranie..." : "Otworz dzien"}
                  </button>
                ) : (
                  <>
                    <button className={styles.primaryButton} type="button" onClick={settleSelectedDay} disabled={isPending}>
                      {isPending ? "Zamykanie..." : "Zamknij dzien"}
                    </button>
                    <button
                      className={styles.ghostButton}
                      type="button"
                      onClick={() => toggleDayInBatch(!visibleSelectedDay.includeInBatch)}
                      disabled={isPending}
                    >
                      {visibleSelectedDay.includeInBatch ? "Wylacz z paczki" : "Przywroc do paczki"}
                    </button>
                  </>
                )}
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
                        <p>{hasRealAccountNumber(item.targetAccountNumber) ? item.targetAccountNumber : item.categoryName}</p>
                        <p className={styles.helperText}>Tytul: {item.transferTitle}</p>
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
        ) : null}
      </section>

      {shouldShowDetailColumns ? (
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
                  <div
                    key={transaction.id}
                    className={`${styles.item} ${transaction.isExcluded ? styles.itemExcluded : ""}`}
                  >
                    <div>
                      <strong>{transaction.description}</strong>
                      <p>
                        {transaction.counterparty || "Brak kontrahenta"}
                        {transaction.isExcluded ? " · Wykluczona z rozliczenia" : ""}
                      </p>
                    </div>
                    <div className={styles.transactionActions}>
                      <strong>{pln.format(transaction.amount)}</strong>
                      <button
                        type="button"
                        className={styles.inlineAction}
                        onClick={() => void toggleExcluded(transaction.id, !transaction.isExcluded)}
                        disabled={pendingTransactionId === transaction.id}
                      >
                        {pendingTransactionId === transaction.id
                          ? "Zapisywanie..."
                          : transaction.isExcluded
                            ? "Przywroc"
                            : "Wyklucz"}
                      </button>
                    </div>
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
      ) : null}
    </section>
  );
}
