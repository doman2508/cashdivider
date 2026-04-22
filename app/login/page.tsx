import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/src/components/login-form";
import {
  getConfiguredOwnerEmail,
  getSessionCookieName,
  isAccessProtectionEnabled,
  isOwnerAuthEnabled,
  isValidSessionToken,
} from "@/src/server/auth/session";
import styles from "./page.module.css";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (!isAccessProtectionEnabled()) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getSessionCookieName())?.value;
  const isAuthorized = await isValidSessionToken(sessionToken);
  const resolvedSearchParams = await searchParams;
  const nextPath = resolvedSearchParams.next || "/";

  if (isAuthorized) {
    redirect(nextPath);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>CashDivider</p>
        <h1>Wejscie do aplikacji</h1>
        <p className={styles.copy}>
          {isOwnerAuthEnabled()
            ? "Dostep do aplikacji ma tylko wlasciciel. Zaloguj sie emailem i haslem, aby przejsc do danych finansowych."
            : "Ta wersja jest chroniona jednym haslem aplikacji. To prosty krok przejsciowy przed pelnym logowaniem uzytkownikow."}
        </p>
        <LoginForm nextPath={nextPath} loginMode={isOwnerAuthEnabled() ? "owner" : "legacy"} ownerEmail={getConfiguredOwnerEmail()} />
      </section>
    </main>
  );
}
