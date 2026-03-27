import { AppShell } from "@/src/components/app-shell";
import { DaysDashboard } from "@/src/components/days-dashboard";

export default function HomePage() {
  return (
    <AppShell
      currentPath="/"
      title="Dashboard"
      description="Tutaj rozliczasz konkretne dni: wybierasz dzien, sprawdzasz paczke przelewow i zamykasz proces."
    >
      <DaysDashboard />
    </AppShell>
  );
}
