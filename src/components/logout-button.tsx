"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./logout-button.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button className={styles.button} type="button" onClick={handleLogout} disabled={isPending}>
      {isPending ? "Wylogowywanie..." : "Wyloguj"}
    </button>
  );
}
