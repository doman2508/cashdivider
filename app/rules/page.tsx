import { AppShell } from "@/src/components/app-shell";
import { RulesManager } from "@/src/components/rules-manager";
import { listRules } from "@/src/server/rules/rules-service";
import { getAccountingSettings } from "@/src/server/settings/accounting-settings-service";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [initialRules, accountingSettings] = await Promise.all([listRules(), getAccountingSettings()]);

  return (
    <AppShell
      currentPath="/rules"
      title="Reguly"
      description="Tu ustawiasz procenty, nazwy kategorii i rachunki docelowe dla swoich codziennych paczek przelewow."
    >
      <RulesManager initialRules={initialRules} initialAccountingStartDate={accountingSettings.accountingStartDate} />
    </AppShell>
  );
}
