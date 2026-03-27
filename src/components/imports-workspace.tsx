"use client";

import { useState } from "react";
import { AuditDashboard } from "@/src/components/audit-dashboard";
import { DataSourcesPanel } from "@/src/components/data-sources-panel";
import { ImportPanel, type ImportResult } from "@/src/components/import-panel";
import { OpenBankingSpike } from "@/src/components/open-banking-spike";

export function ImportsWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastImportedDates, setLastImportedDates] = useState<string[]>([]);

  function handleImported(result: ImportResult) {
    setLastImportedDates(result.affectedDates);
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <DataSourcesPanel />
      <OpenBankingSpike />
      <ImportPanel onImported={handleImported} />
      <AuditDashboard refreshKey={refreshKey} lastImportedDates={lastImportedDates} />
    </>
  );
}
