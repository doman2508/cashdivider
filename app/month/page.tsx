import { AppShell } from "@/src/components/app-shell";
import { MonthSummary } from "@/src/components/month-summary";
import { getMonthSummary } from "@/src/server/summary/month-summary-service";

export const dynamic = "force-dynamic";

function getCurrentMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default async function MonthPage() {
  const initialMonth = getCurrentMonth();
  const initialSummary = await getMonthSummary(initialMonth);

  return (
    <AppShell
      currentPath="/month"
      title="Miesiac"
      description="Podsumowanie miesiaca pokazuje, ile juz wplynelo, ile powinno byc odlozone i gdzie sa zaleglosci."
    >
      <MonthSummary initialMonth={initialMonth} initialSummary={initialSummary} />
    </AppShell>
  );
}
