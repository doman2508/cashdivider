import { AppShell } from "@/src/components/app-shell";
import { RulesManager } from "@/src/components/rules-manager";

export default function RulesPage() {
  return (
    <AppShell
      currentPath="/rules"
      title="Reguly"
      description="Tu ustawiasz procenty, nazwy kategorii i rachunki docelowe dla swoich codziennych paczek przelewow."
    >
      <RulesManager />
    </AppShell>
  );
}
