import {
  getLitigiosMultasAction,
  upsertLitigioMultaAction,
} from "@/actions/litigios.actions";
import { MultasModuleView } from "@/components/litigios/multas-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function RegLitigiosMultasPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosMultasAction(),
  ]);

  const canManage = hasPermission(session, "litigios_multas", "GESTION");

  return (
    <MultasModuleView
      initialItems={items}
      initialKpis={kpis}
      onFetchAction={getLitigiosMultasAction}
      onUpsertAction={upsertLitigioMultaAction}
      canManage={canManage}
    />
  );
}
