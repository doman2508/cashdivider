"use client";

import { useState } from "react";
import { AuditDashboard } from "@/src/components/audit-dashboard";
import { ImportPanel, type ImportResult } from "@/src/components/import-panel";

export function ImportsWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastImportedDates, setLastImportedDates] = useState<string[]>([]);

  function handleImported(result: ImportResult) {
    setLastImportedDates(result.affectedDates);
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <ImportPanel onImported={handleImported} />
      <AuditDashboard refreshKey={refreshKey} lastImportedDates={lastImportedDates} />
    </>
  );
}
