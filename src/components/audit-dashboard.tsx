"use client";

import { useEffect, useState } from "react";
import { fullDate, pln } from "@/src/lib/format";
import styles from "./audit-dashboard.module.css";

type ImportEntry = {
  id: string;
  sourceType: "ING_CSV" | "MANUAL";
  sourceName: string;
  sourceLabel: string;
  importedAt: string;
  addedCount: number;
  skippedCount: number;
};

type BatchEntry = {
  id: string;
  date: string;
  status: "GENERATED" | "COMPLETED";
  totalAmount: number;
  leftoverAmount: number;
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
};

type AuditDashboardProps = {
  refreshKey?: number;
  lastImportedDates?: string[];
};

export function AuditDashboard({ refreshKey = 0, lastImportedDates = [] }: AuditDashboardProps) {
  const [imports, setImports] = useState<ImportEntry[]>([]);
  const [batches, setBatches] = useState<BatchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadAuditData();
  }, [refreshKey]);

  async function loadAuditData() {
    setIsLoading(true);
    const [importsResponse, batchesResponse] = await Promise.all([
      fetch("/api/imports/history", { cache: "no-store" }),
      fetch("/api/batches", { cache: "no-store" }),
    ]);

    const importsPayload = (await importsResponse.json()) as { data: ImportEntry[] };
    const batchesPayload = (await batchesResponse.json()) as { data: BatchEntry[] };

    setImports(importsPayload.data);
    setBatches(batchesPayload.data);
    setIsLoading(false);
  }

  return (
    <section className={styles.wrapper}>
      {lastImportedDates.length ? (
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Ostatni import</p>
          <h3>Dotkniete dni</h3>
          <div className={styles.list}>
            <div className={styles.item}>
              <div>
                <p className={styles.itemTitle}>{lastImportedDates.join(", ")}</p>
                <p className={styles.itemMeta}>Te dni zostaly odswiezone po ostatnim imporcie.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Importy</p>
          <h3>Historia importow</h3>
          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.empty}>Ladowanie historii importow...</div>
            ) : imports.length ? (
              imports.map((entry) => (
                <div key={entry.id} className={styles.item}>
                  <div>
                    <p className={styles.itemTitle}>{entry.sourceName}</p>
                    <p className={styles.itemMeta}>
                      {new Date(entry.importedAt).toLocaleString("pl-PL")} - dodano {entry.addedCount}, pominieto{" "}
                      {entry.skippedCount}
                    </p>
                  </div>
                  <span className={styles.status}>{entry.sourceLabel}</span>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Brak historii importow.</div>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Paczki</p>
          <h3>Historia paczek przelewow</h3>
          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.empty}>Ladowanie historii paczek...</div>
            ) : batches.length ? (
              batches.map((batch) => (
                <div key={batch.id} className={styles.item}>
                  <div>
                    <p className={styles.itemTitle}>{fullDate.format(new Date(batch.date))}</p>
                    <p className={styles.itemMeta}>
                      {batch.itemCount} przelewow - {pln.format(batch.totalAmount)} - zostaje {pln.format(batch.leftoverAmount)}
                    </p>
                  </div>
                  <span className={`${styles.status} ${batch.status === "COMPLETED" ? styles.statusDone : ""}`}>
                    {batch.status === "COMPLETED" ? "Zamknieta" : "Otwarta"}
                  </span>
                </div>
              ))
            ) : (
              <div className={styles.empty}>Brak historii paczek.</div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
