import { getCalendarioLitigiosAction } from "@/actions/litigios.actions";
import { CalendarioModuleView } from "@/components/litigios/calendario-module-view";
import { getServerUserSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RegLitigiosCalendarioPage() {
  const [, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getCalendarioLitigiosAction(),
  ]);

  return (
    <CalendarioModuleView
      initialItems={items}
      initialKpis={kpis}
      onFetchAction={getCalendarioLitigiosAction}
    />
  );
}
