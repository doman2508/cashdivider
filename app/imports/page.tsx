import { AppShell } from "@/src/components/app-shell";
import { ImportsWorkspace } from "@/src/components/imports-workspace";

export default function ImportsPage() {
  return (
    <AppShell
      currentPath="/imports"
      title="Importy"
      description="Tutaj wrzucasz wyciag z banku i od razu widzisz, co system zaimportowal oraz jakie dni zostaly odswiezone."
    >
      <ImportsWorkspace />
    </AppShell>
  );
}
