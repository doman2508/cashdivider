import { AppShell } from "@/src/components/app-shell";
import { MonthSummary } from "@/src/components/month-summary";

export default function MonthPage() {
  return (
    <AppShell
      currentPath="/month"
      title="Miesiac"
      description="Podsumowanie miesiaca pokazuje, ile juz wplynelo, ile powinno byc odlozone i gdzie sa zaleglosci."
    >
      <MonthSummary />
    </AppShell>
  );
}
