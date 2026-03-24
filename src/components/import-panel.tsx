"use client";

import { useState, useTransition } from "react";
import styles from "./import-panel.module.css";

type ImportPanelProps = {
  onImported: () => Promise<void> | void;
};

export function ImportPanel({ onImported }: ImportPanelProps) {
  const [sourceType, setSourceType] = useState<"ING_CSV" | "MANUAL">("ING_CSV");
  const [sourceName, setSourceName] = useState("ing-export.csv");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function fillManualDemo() {
    setSourceType("MANUAL");
    setSourceName("manual-import");
    setContent("2026-03-24;1200;Klient A\n2026-03-24;300;Klient B");
  }

  async function decodeCsvFile(file: File) {
    const buffer = await file.arrayBuffer();

    const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    if (!utf8Text.includes("�")) {
      return utf8Text;
    }

    try {
      return new TextDecoder("windows-1250", { fatal: false }).decode(buffer);
    } catch {
      return utf8Text;
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await decodeCsvFile(file);
    setSourceType("ING_CSV");
    setSourceName(file.name);
    setContent(text);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    startTransition(async () => {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceName,
          content,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Nie udalo sie zaimportowac transakcji.");
        return;
      }

      setStatus(
        `Zaimportowano ${payload.data.addedCount} transakcji, pominieto ${payload.data.skippedCount}. Dotkniete dni: ${
          payload.data.affectedDates.join(", ") || "brak"
        }.`,
      );
      await onImported();
    });
  }

  return (
    <section className={styles.panel}>
      <div>
        <p className={styles.eyebrow}>Import</p>
        <h3>Pierwszy import transakcji</h3>
        <p className={styles.copy}>
          Wrzuc plik CSV z ING albo wklej prosty format `YYYY-MM-DD;kwota;opis`. Backend zapisze transakcje, przebuduje
          dni i wygeneruje paczki przelewow.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          Typ importu
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as "ING_CSV" | "MANUAL")}>
            <option value="ING_CSV">CSV z ING</option>
            <option value="MANUAL">Reczny tekst</option>
          </select>
        </label>

        <label>
          Nazwa importu
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} required />
        </label>

        <label>
          Plik CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </label>

        <label>
          Zawartosc importu
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} required />
        </label>

        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} type="submit" disabled={isPending}>
            Importuj transakcje
          </button>
          <button className={styles.ghostButton} type="button" onClick={fillManualDemo} disabled={isPending}>
            Wklej demo manualne
          </button>
        </div>
      </form>

      <p className={styles.helper}>Po udanym imporcie dashboard odswiezy dni i szczegoly wybranego dnia.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.status}>{status}</p> : null}
    </section>
  );
}
