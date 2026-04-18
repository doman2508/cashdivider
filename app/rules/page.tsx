import { AppShell } from "@/src/components/app-shell";
import { RulesManager } from "@/src/components/rules-manager";
import { listRules } from "@/src/server/rules/rules-service";

export default async function RulesPage() {
  const initialRules = await listRules();

  return (
    <AppShell
      currentPath="/rules"
      title="Reguly"
      description="Tu ustawiasz procenty, nazwy kategorii i rachunki docelowe dla swoich codziennych paczek przelewow."
    >
      <RulesManager initialRules={initialRules} />
    </AppShell>
  );
}
