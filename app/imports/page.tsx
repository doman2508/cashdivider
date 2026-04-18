import { AppShell } from "@/src/components/app-shell";
import { ImportsWorkspace } from "@/src/components/imports-workspace";
import { listBatches, listImports } from "@/src/server/audit/audit-service";
import { getDataSourcesSummary } from "@/src/server/data-sources/data-sources-service";
import { getOpenBankingSpikeStatus } from "@/src/server/open-banking/open-banking-service";

export default async function ImportsPage() {
  const [initialDataSources, initialOpenBankingStatus, initialImports, initialBatches] = await Promise.all([
    getDataSourcesSummary(),
    getOpenBankingSpikeStatus(),
    listImports(),
    listBatches(),
  ]);

  return (
    <AppShell
      currentPath="/imports"
      title="Importy"
      description="Tutaj budujemy droge od recznego CSV do automatycznego syncu banku, a po drodze nadal masz bezpieczny backup."
    >
      <ImportsWorkspace
        initialDataSources={initialDataSources}
        initialOpenBankingStatus={initialOpenBankingStatus}
        initialImports={initialImports}
        initialBatches={initialBatches}
      />
    </AppShell>
  );
}
