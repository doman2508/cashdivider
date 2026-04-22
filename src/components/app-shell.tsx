import Link from "next/link";
import { ReactNode } from "react";
import { LogoutButton } from "@/src/components/logout-button";
import { isAccessProtectionEnabled } from "@/src/server/auth/session";
import styles from "./app-shell.module.css";

type AppShellProps = {
  currentPath: string;
  title: string;
  description: string;
  children: ReactNode;
};

const navigation = [
  { href: "/" as const, label: "Dashboard" },
  { href: "/month" as const, label: "Miesiac" },
  { href: "/imports" as const, label: "Importy" },
  { href: "/rules" as const, label: "Reguly" },
];

export function AppShell({ currentPath, title, description, children }: AppShellProps) {
  const isProtected = isAccessProtectionEnabled();

  function isActivePath(href: string) {
    if (href === "/") {
      return currentPath === "/";
    }

    return currentPath === href || currentPath.startsWith(`${href}/`);
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.eyebrow}>CashDivider</p>
          <h1>Dzienny autopilot dla wplywow</h1>
          <p className={styles.copy}>
            Narzedzie do codziennego rozdzielania wplywow freelancera, zanim pieniadze zdaza sie rozplynac.
          </p>
        </div>

        <nav className={styles.nav}>
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`${styles.navLink} ${isActivePath(item.href) ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <section className={styles.panelAccent}>
          <p className={styles.eyebrow}>Aktualny widok</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </section>

        <section className={styles.panel}>
          <p className={styles.eyebrow}>Tryb aplikacji</p>
          <ul className={styles.list}>
            <li>{isProtected ? "Dostep chroniony logowaniem" : "Tryb otwarty bez blokady"}</li>
            <li>Jedna instancja dla jednego wlasciciela</li>
            <li>Dane sa przypisane do konta wlasciciela</li>
          </ul>
          {isProtected ? <LogoutButton /> : null}
        </section>
      </aside>

      <section className={styles.content}>{children}</section>
    </main>
  );
}
