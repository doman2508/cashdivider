"use client";

import { useState } from "react";
import { AuditDashboard } from "@/src/components/audit-dashboard";
import { DataSourcesPanel } from "@/src/components/data-sources-panel";
import { ImportPanel, type ImportResult } from "@/src/components/import-panel";
import { OpenBankingSpike } from "@/src/components/open-banking-spike";
import type { BatchEntry, ImportEntry } from "@/src/components/audit-dashboard";
import type { DataSourcesPayload } from "@/src/components/data-sources-panel";
import type { OpenBankingStatus } from "@/src/components/open-banking-spike";

type ImportsWorkspaceProps = {
  initialDataSources: DataSourcesPayload;
  initialOpenBankingStatus: OpenBankingStatus;
  initialImports: ImportEntry[];
  initialBatches: BatchEntry[];
};

export function ImportsWorkspace({
  initialDataSources,
  initialOpenBankingStatus,
  initialImports,
  initialBatches,
}: ImportsWorkspaceProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastImportedDates, setLastImportedDates] = useState<string[]>([]);

  function handleImported(result: ImportResult) {
    setLastImportedDates(result.affectedDates);
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <DataSourcesPanel initialData={initialDataSources} />
      <OpenBankingSpike initialStatus={initialOpenBankingStatus} />
      <ImportPanel onImported={handleImported} />
      <AuditDashboard
        refreshKey={refreshKey}
        lastImportedDates={lastImportedDates}
        initialImports={initialImports}
        initialBatches={initialBatches}
      />
    </>
  );
}
