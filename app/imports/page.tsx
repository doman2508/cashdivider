import { AppShell } from "@/src/components/app-shell";
import { ImportsWorkspace } from "@/src/components/imports-workspace";

export default function ImportsPage() {
  return (
    <AppShell
      currentPath="/imports"
      title="Importy"
      description="Tutaj budujemy droge od recznego CSV do automatycznego syncu banku, a po drodze nadal masz bezpieczny backup."
    >
      <ImportsWorkspace />
    </AppShell>
  );
}
