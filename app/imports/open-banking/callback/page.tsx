import Link from "next/link";
import { AppShell } from "@/src/components/app-shell";
import styles from "./page.module.css";

type CallbackPageProps = {
  searchParams: Promise<{
    provider?: string;
    mode?: string;
    status?: string;
    missing?: string;
    error?: string;
    added?: string;
    skipped?: string;
    accounts?: string;
    transactions?: string;
    dates?: string;
  }>;
};

export default async function OpenBankingCallbackPage({ searchParams }: CallbackPageProps) {
  const params = await searchParams;
  const provider = params.provider || "TRUELAYER";
  const mode = params.mode || "truelayer";
  const status = params.status || "missing_config";
  const missingFields = params.missing?.split(",").filter(Boolean) ?? [];
  const affectedDates = params.dates?.split(",").filter(Boolean) ?? [];
  const added = Number(params.added ?? "0");
  const skipped = Number(params.skipped ?? "0");
  const accounts = Number(params.accounts ?? "0");
  const transactions = Number(params.transactions ?? "0");
  const errorCode = params.error;
  const decodedError = errorCode ? decodeURIComponent(errorCode) : null;

  return (
    <AppShell
      currentPath="/imports/open-banking/callback"
      title="Open banking callback"
      description="Tutaj konczy sie flow providera. Na tym etapie sprawdzamy, czy TrueLayer oddaje dane, ktore CashDivider umie zamienic na dni i paczki."
    >
      <section className={styles.wrapper}>
        <article className={styles.heroCard}>
          <p className={styles.eyebrow}>Callback</p>
          <h2>
            {status === "imported"
              ? "Import z TrueLayer zakonczyl sie powodzeniem"
              : status === "missing_config"
                ? "Brakuje konfiguracji do prawdziwego flow"
                : "Flow wymaga poprawki lub dopiecia"}
          </h2>
          <p className={styles.copy}>
            Provider: <strong>{provider}</strong>. Tryb: <strong>{mode}</strong>.
          </p>
          {status === "imported" ? (
            <p className={styles.success}>
              Dodano {added} transakcji, pominieto {skipped}. Kont: {accounts}, uznan: {transactions}.
            </p>
          ) : missingFields.length ? (
            <p className={styles.warning}>Brakujace pola env: {missingFields.join(", ")}.</p>
          ) : errorCode ? (
            <p className={styles.warning}>Kod bledu: {decodedError}.</p>
          ) : (
            <p className={styles.success}>Konfiguracja wyglada poprawnie i mozemy przejsc do prawdziwego spike'a AIS.</p>
          )}
          <div className={styles.buttonRow}>
            <Link href="/imports" className={styles.primaryLink}>
              Wroc do Importow
            </Link>
            {status === "imported" ? (
              <Link href="/" className={styles.secondaryLink}>
                Przejdz do Dashboardu
              </Link>
            ) : null}
          </div>
        </article>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <p className={styles.eyebrow}>Wynik callbacku</p>
            <h3>Co sie wydarzylo</h3>
            <div className={styles.list}>
              <div className={styles.item}>
                <strong>Auth link i redirect</strong>
                <p>Uzytkownik wrocil z providera na backendowy callback aplikacji.</p>
              </div>
              <div className={styles.item}>
                <strong>Wymiana code na access token</strong>
                <p>Backend probuje wymienic jednorazowy code na token Data API.</p>
              </div>
              <div className={styles.item}>
                <strong>Import do CashDivider</strong>
                <p>Jesli provider oddal konta i uznania, wpadaja one do naszego pipeline importu.</p>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <p className={styles.eyebrow}>Nastepny krok</p>
            <h3>Co dopinamy po udanym mocku</h3>
            <div className={styles.list}>
              <div className={styles.item}>
                <strong>Prawdziwy provider flow</strong>
                <p>Po potwierdzeniu na mocku przechodzimy z testowego banku do realnego consent flow providera.</p>
              </div>
              <div className={styles.item}>
                <strong>Polerka mapowania transakcji</strong>
                <p>Sprawdzamy opisy i jakosc uznan, zeby dobrze grupowac je na dni freelancera.</p>
              </div>
              <div className={styles.item}>
                <strong>Codzienny sync</strong>
                <p>Po udanym spike'u mozemy dodac Railway job, ktory raz dziennie odswieza dane.</p>
              </div>
            </div>
            {affectedDates.length ? (
              <div className={styles.item}>
                <strong>Dotkniete dni</strong>
                <p>{affectedDates.join(", ")}</p>
              </div>
            ) : null}
          </article>
        </section>
      </section>
    </AppShell>
  );
}
