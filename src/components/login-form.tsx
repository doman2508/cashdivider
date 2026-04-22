"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./login-form.module.css";

type LoginFormProps = {
  nextPath: string;
  loginMode: "owner" | "legacy";
  ownerEmail: string;
};

export function LoginForm({ nextPath, loginMode, ownerEmail }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(ownerEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginMode === "owner" ? email : undefined,
          password,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Nie udalo sie zalogowac.");
        return;
      }

      router.push(nextPath);
      router.refresh();
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {loginMode === "owner" ? (
        <label className={styles.label}>
          Email wlasciciela
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Wpisz email wlasciciela"
            autoComplete="username"
            autoFocus
            required
          />
        </label>
      ) : null}

      <label className={styles.label}>
        {loginMode === "owner" ? "Haslo" : "Haslo aplikacji"}
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={loginMode === "owner" ? "Wpisz haslo wlasciciela" : "Wpisz haslo z APP_PASSWORD"}
          autoFocus={loginMode !== "owner"}
          autoComplete={loginMode === "owner" ? "current-password" : undefined}
          required
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <button className={styles.button} type="submit" disabled={isPending}>
        {isPending ? "Logowanie..." : loginMode === "owner" ? "Zaloguj wlasciciela" : "Wejdz do aplikacji"}
      </button>
    </form>
  );
}
