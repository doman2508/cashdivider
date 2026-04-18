import { AppShell } from "@/src/components/app-shell";
import { AccountBalancesPanel } from "@/src/components/account-balances-panel";
import { DaysDashboard } from "@/src/components/days-dashboard";
import { getDashboardSnapshot } from "@/src/server/dashboard/dashboard-service";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <AppShell
      currentPath="/"
      title="Dashboard"
      description="Tutaj rozliczasz konkretne dni: wybierasz dzien, sprawdzasz paczke przelewow i zamykasz proces."
    >
      <AccountBalancesPanel initialAccounts={snapshot.accountBalances} />
      <DaysDashboard
        initialDays={snapshot.days}
        initialSelectedDate={snapshot.selectedDate}
        initialSelectedDay={snapshot.selectedDay}
        initialOpenBatch={snapshot.openBatch}
      />
    </AppShell>
  );
}
