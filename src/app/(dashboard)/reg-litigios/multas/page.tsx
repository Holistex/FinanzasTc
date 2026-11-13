import {
  getLitigiosMultasAction,
  upsertLitigioMultaAction,
} from "@/actions/litigios.actions";
import { MultasModuleView } from "@/components/litigios/multas-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegLitigiosMultasPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosMultasAction(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "litigios_multas",
    "reg_litigios",
  ]);

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
