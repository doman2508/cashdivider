import { demoUser } from "@/src/lib/demo-data";
import { DaysDashboard } from "@/src/components/days-dashboard";
import { RulesManager } from "@/src/components/rules-manager";
import { AuditDashboard } from "@/src/components/audit-dashboard";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.eyebrow}>CashDivider</p>
          <h1>Dzienny autopilot dla wplywow</h1>
          <p className={styles.copy}>
            Szkielet wersji backendowej pod Railway. Front, API i Prisma sa juz w jednym projekcie.
          </p>
        </div>

        <section className={styles.panelAccent}>
          <p className={styles.eyebrow}>Aktualny etap</p>
          <h2>Next.js + Prisma + Railway</h2>
          <p>
            Przechodzimy z prototypu `localStorage` na aplikacje z baza danych i API gotowym pod importy,
            dni i paczki przelewow.
          </p>
        </section>

        <section className={styles.panel}>
          <p className={styles.eyebrow}>Model domeny</p>
          <ul className={styles.list}>
            <li>Uzytkownik</li>
            <li>Reguly podzialu</li>
            <li>Importy bankowe</li>
            <li>Transakcje</li>
            <li>Dni rozliczeniowe</li>
            <li>Paczki przelewow</li>
          </ul>
        </section>
      </aside>

      <section className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Dashboard</p>
            <h2>Backend Railway w budowie</h2>
            <p className={styles.copy}>
              Reguly działają już na prawdziwej bazie. Dni i paczki są właśnie przepinane na backendowe endpointy, żeby
              następny krok można było poświęcić wyłącznie importowi ING.
            </p>
          </div>
          <div className={styles.heroMeta}>
            <span>{demoUser.email}</span>
            <span>API: `/api/health`, `/api/rules`, `/api/days`, `/api/days/:date`</span>
          </div>
        </section>
        <DaysDashboard />
        <AuditDashboard />
        <RulesManager />
      </section>
    </main>
  );
}
