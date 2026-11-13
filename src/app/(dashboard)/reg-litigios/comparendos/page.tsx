import { getLitigiosComparendosAction } from "@/actions/litigios.actions";
import { ComparendosModuleView } from "@/components/litigios/comparendos-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegLitigiosComparendosPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosComparendosAction(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "litigios_comparendos",
    "reg_litigios",
  ]);

  return (
    <ComparendosModuleView
      initialItems={items}
      initialKpis={kpis}
      canManage={canManage}
    />
  );
}
