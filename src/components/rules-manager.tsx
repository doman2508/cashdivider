"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./rules-manager.module.css";

type Rule = {
  id: string;
  name: string;
  percentage: number;
  targetLabel: string;
  targetAccountNumber: string;
  position: number;
  isActive: boolean;
};

type FormState = {
  name: string;
  percentage: string;
  targetLabel: string;
  targetAccountNumber: string;
};

const emptyForm: FormState = {
  name: "",
  percentage: "",
  targetLabel: "",
  targetAccountNumber: "",
};

type RulesManagerProps = {
  initialRules?: Rule[];
  initialAccountingStartDate?: string | null;
};

export function RulesManager({ initialRules = [], initialAccountingStartDate = null }: RulesManagerProps) {
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [accountingStartDate, setAccountingStartDate] = useState(initialAccountingStartDate ?? "");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSettingsPending, startSettingsTransition] = useTransition();

  useEffect(() => {
    if (!initialRules.length) {
      void loadRules();
    }
  }, [initialRules.length]);

  async function loadRules() {
    const response = await fetch("/api/rules", { cache: "no-store" });
    const payload = (await response.json()) as { data: Rule[] };
    setRules(payload.data);
  }

  function handleChange(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function saveAccountingStartDate() {
    setError(null);
    setInfo(null);

    startSettingsTransition(async () => {
      const response = await fetch("/api/settings/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountingStartDate: accountingStartDate || null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message || "Nie udalo sie zapisac daty startu rozliczen.");
        return;
      }

      const body = (await response.json()) as { data: { accountingStartDate: string | null } };
      setAccountingStartDate(body.data.accountingStartDate ?? "");
      setInfo(
        body.data.accountingStartDate
          ? "Start rozliczen zapisany. Starsze dni zostaly odciete od paczek i zaleglosci."
          : "Start rozliczen wyczyszczony. System znowu uwzglednia caly okres importu.",
      );
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    startTransition(async () => {
      const payload = {
        name: form.name.trim(),
        percentage: Number(form.percentage),
        targetLabel: form.targetLabel.trim(),
        targetAccountNumber: form.targetAccountNumber.trim(),
      };

      const endpoint = editingId ? `/api/rules/${editingId}` : "/api/rules";
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message || "Nie udalo sie zapisac reguly.");
        return;
      }

      const body = (await response.json()) as { data: Rule };
      setRules((current) => {
        if (editingId) {
          return current
            .map((rule) => (rule.id === editingId ? body.data : rule))
            .sort((left, right) => left.position - right.position);
        }

        return [...current, body.data].sort((left, right) => left.position - right.position);
      });
      setInfo(
        editingId
          ? "Regula zostala zaktualizowana. Dni i paczki przeliczaja sie w tle."
          : "Regula zostala dodana. Dni i paczki przeliczaja sie w tle.",
      );
      resetForm();
    });
  }

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      percentage: String(rule.percentage),
      targetLabel: rule.targetLabel,
      targetAccountNumber: rule.targetAccountNumber,
    });
    setError(null);
    setInfo(null);
  }

  function handleDelete(ruleId: string) {
    setError(null);
    setInfo(null);

    startTransition(async () => {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Nie udalo sie usunac reguly.");
        return;
      }

      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      if (editingId === ruleId) {
        resetForm();
      }
      setInfo("Regula zostala usunieta. Dni i paczki przeliczaja sie w tle.");
    });
  }

  const totalPercentage = rules.reduce((sum, rule) => sum + Number(rule.percentage), 0);
  const freePercentage = Math.max(0, 100 - totalPercentage);

  return (
    <section className={styles.wrapper}>
      <div>
        <p className={styles.eyebrow}>Ustawienia</p>
        <h2>Reguly podzialu</h2>
        <p className={styles.copy}>
          Tutaj ustawiasz kategorie, procenty i rachunki docelowe. Kazda zmiana zapisuje sie od razu w bazie.
        </p>
      </div>

      <section className={styles.panel}>
        <p className={styles.eyebrow}>Zakres rozliczen</p>
        <h3>Start rozliczen</h3>
        <p className={styles.copy}>
          System dalej widzi cala historie transakcji i salda kont, ale dni, paczki i zaleglosci liczy dopiero od tej daty.
        </p>
        <div className={styles.settingsRow}>
          <label className={styles.inlineLabel}>
            Data startu
            <input
              type="date"
              value={accountingStartDate}
              onChange={(event) => setAccountingStartDate(event.target.value)}
            />
          </label>
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} type="button" onClick={saveAccountingStartDate} disabled={isSettingsPending}>
              {isSettingsPending ? "Zapisywanie..." : "Zapisz start"}
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              onClick={() => setAccountingStartDate("")}
              disabled={isSettingsPending}
            >
              Wyczysc date
            </button>
          </div>
        </div>
        {accountingStartDate ? (
          <p className={styles.helperText}>Aktywny start rozliczen: {accountingStartDate}.</p>
        ) : (
          <p className={styles.helperText}>Brak daty granicznej. System liczy caly dostepny okres.</p>
        )}
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>{editingId ? "Edycja reguly" : "Nowa regula"}</p>
          <h3>{editingId ? "Edytuj podzial procentowy" : "Podzial procentowy"}</h3>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label>
              Kategoria
              <input value={form.name} onChange={(event) => handleChange("name", event.target.value)} required />
            </label>

            <label>
              Procent
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.percentage}
                onChange={(event) => handleChange("percentage", event.target.value)}
                required
              />
            </label>

            <label>
              Alias konta
              <input
                value={form.targetLabel}
                onChange={(event) => handleChange("targetLabel", event.target.value)}
                required
              />
            </label>

            <label>
              Numer rachunku
              <input
                value={form.targetAccountNumber}
                onChange={(event) => handleChange("targetAccountNumber", event.target.value)}
                required
              />
            </label>

            <div className={styles.buttonRow}>
              <button className={styles.primaryButton} type="submit" disabled={isPending || isSettingsPending}>
                {editingId ? "Zapisz zmiany" : "Dodaj regule"}
              </button>
              {editingId ? (
                <button className={styles.ghostButton} type="button" onClick={resetForm} disabled={isPending || isSettingsPending}>
                  Anuluj edycje
                </button>
              ) : null}
            </div>
          </form>

          <p className={styles.helperText}>
            Zajete: {totalPercentage}%. Wolne do rozdysponowania: {freePercentage}%.
          </p>
          {error ? <p className={styles.errorText}>{error}</p> : null}
          {info ? <p className={styles.helperText}>{info}</p> : null}
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>Aktywne reguly</p>
          <h3>Konta i procenty</h3>

          <div className={styles.list}>
            {rules.length ? (
              rules.map((rule) => (
                <div key={rule.id} className={styles.item}>
                  <div>
                    <p className={styles.itemTitle}>{rule.name}</p>
                    <p className={styles.itemMeta}>{rule.targetLabel}</p>
                    <p className={styles.itemAccount}>{rule.targetAccountNumber}</p>
                  </div>
                  <div className={styles.itemActions}>
                    <span className={styles.status}>{rule.percentage}%</span>
                    <div className={styles.buttonRow}>
                      <button className={styles.editButton} type="button" onClick={() => startEdit(rule)} disabled={isPending || isSettingsPending}>
                        Edytuj
                      </button>
                      <button
                        className={styles.deleteButton}
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        disabled={isPending || isSettingsPending}
                      >
                        Usun
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.item}>
                <div>
                  <p className={styles.itemTitle}>Brak regul</p>
                  <p className={styles.itemMeta}>Dodaj pierwsza regule, a zapisze sie od razu w bazie.</p>
                </div>
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
