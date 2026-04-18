import { pln } from "@/src/lib/format";
import { getAccountBalancesSummary } from "@/src/server/summary/account-balances-service";
import styles from "./account-balances-panel.module.css";

export type AccountBalance = {
  key: string;
  name: string;
  targetLabel: string;
  targetAccountNumber: string;
  totalAmount: number;
  pendingAmount: number;
  settledAmount: number;
};

type AccountBalancesPanelProps = {
  initialAccounts?: AccountBalance[];
};

export async function AccountBalancesPanel({ initialAccounts }: AccountBalancesPanelProps) {
  const accounts = initialAccounts ?? (await getAccountBalancesSummary()).accounts;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Stan subkont</p>
          <h3>Ile powinno byc na kontach</h3>
        </div>
      </div>

      <div className={styles.grid}>
        {accounts.length ? (
          accounts.map((account) => (
            <article key={account.key} className={styles.card}>
              <div>
                <p className={styles.cardTitle}>{account.name}</p>
              </div>
              <div className={styles.amounts}>
                <strong>{pln.format(account.totalAmount)}</strong>
                <span>Na koncie: {pln.format(account.settledAmount)}</span>
                <span>{account.pendingAmount > 0 ? `Czeka: ${pln.format(account.pendingAmount)}` : "Bez zaleglosci"}</span>
              </div>
            </article>
          ))
        ) : (
          <div className={styles.empty}>Brak danych o subkontach. Dodaj reguly i zaimportuj wplywy.</div>
        )}
      </div>
    </section>
  );
}
