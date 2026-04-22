"use client";

import { useState, useTransition } from "react";
import { pln } from "@/src/lib/format";
import styles from "./account-balances-panel.module.css";

export type AccountBalance = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
  settledAmount: number;
  actualBalance: number;
  adjustmentTotal: number;
  importedBalance: number | null;
  importedBalanceAt: string | null;
};

type AccountBalancesPanelProps = {
  initialAccounts?: AccountBalance[];
};

export function AccountBalancesPanel({ initialAccounts = [] }: AccountBalancesPanelProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEditing(account: AccountBalance) {
    setEditingKey(account.key);
    setBalanceInput(account.actualBalance.toFixed(2).replace(".", ","));
    setNoteInput("");
    setError(null);
  }

  function cancelEditing() {
    setEditingKey(null);
    setBalanceInput("");
    setNoteInput("");
    setError(null);
  }

  function submitBalance(account: AccountBalance) {
    setError(null);

    startTransition(async () => {
      const desiredBalance = Number(balanceInput.replace(/\s/g, "").replace(",", "."));

      if (Number.isNaN(desiredBalance)) {
        setError("Podaj poprawne saldo subkonta.");
        return;
      }

      const response = await fetch("/api/summary/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: account.key,
          name: account.name,
          targetLabel: account.targetLabel,
          targetAccountNumber: account.targetAccountNumber,
          desiredBalance,
          note: noteInput,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message || "Nie udalo sie zapisac salda subkonta.");
        return;
      }

      const payload = (await response.json()) as { data: { accounts: AccountBalance[] } };
      setAccounts(payload.data.accounts);
      cancelEditing();
    });
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Stan kont</p>
          <h3>Rzeczywiste saldo z banku i korekt</h3>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        {accounts.length ? (
          accounts.map((account) => (
            <article key={account.key} className={styles.card}>
              <div>
                <p className={styles.cardTitle}>{account.name}</p>
              </div>

              <div className={styles.amounts}>
                <strong>{pln.format(account.actualBalance)}</strong>
                <span>
                  {account.importedBalance != null
                    ? `Saldo z banku: ${pln.format(account.importedBalance)}`
                    : `Powinno byc: ${pln.format(account.settledAmount)}`}
                </span>
                <span>
                  {account.pendingAmount > 0 ? `Czeka: ${pln.format(account.pendingAmount)}` : "Bez zaleglosci"}
                </span>
                {account.adjustmentTotal !== 0 ? (
                  <span>Korekty: {pln.format(account.adjustmentTotal)}</span>
                ) : null}
              </div>

              {editingKey === account.key ? (
                <div className={styles.editor}>
                  <label>
                    Aktualne saldo
                    <input
                      value={balanceInput}
                      onChange={(event) => setBalanceInput(event.target.value)}
                      inputMode="decimal"
                    />
                  </label>

                  <label>
                    Notatka
                    <input value={noteInput} onChange={(event) => setNoteInput(event.target.value)} />
                  </label>

                  <div className={styles.actions}>
                    <button type="button" className={styles.primaryButton} onClick={() => submitBalance(account)} disabled={isPending}>
                      {isPending ? "Zapisywanie..." : "Zapisz saldo"}
                    </button>
                    <button type="button" className={styles.ghostButton} onClick={cancelEditing} disabled={isPending}>
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button type="button" className={styles.ghostButton} onClick={() => startEditing(account)}>
                    Ustaw saldo
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className={styles.empty}>Brak danych o subkontach. Dodaj reguly i zaimportuj wplywy.</div>
        )}
      </div>
    </section>
  );
}
