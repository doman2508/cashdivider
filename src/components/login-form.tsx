"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./login-form.module.css";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
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
      <label className={styles.label}>
        Haslo aplikacji
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Wpisz haslo z APP_PASSWORD"
          autoFocus
          required
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <button className={styles.button} type="submit" disabled={isPending}>
        {isPending ? "Logowanie..." : "Wejdz do aplikacji"}
      </button>
    </form>
  );
}
