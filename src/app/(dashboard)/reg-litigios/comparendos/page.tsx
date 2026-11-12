import { getLitigiosComparendosAction } from "@/actions/litigios.actions";
import { ComparendosModuleView } from "@/components/litigios/comparendos-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegLitigiosComparendosPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosComparendosAction(),
  ]);

  const canManage = hasPermission(session, "litigios_comparendos", "GESTION");

  return (
    <ComparendosModuleView
      initialItems={items}
      initialKpis={kpis}
      canManage={canManage}
    />
  );
}
