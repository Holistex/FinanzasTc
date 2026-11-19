import { getLitigiosComparendosAction } from "@/actions/litigios.actions";
import { getBancosAction } from "@/actions/mantenedores.actions";
import { ComparendosModuleView } from "@/components/litigios/comparendos-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegLitigiosComparendosPage() {
  const [session, { items, kpis }, bancos] = await Promise.all([
    getServerUserSession(),
    getLitigiosComparendosAction(),
    getBancosAction(undefined, true),
  ]);

  const { canManage } = getModuleAccess(session, [
    "litigios_comparendos",
    "reg_litigios",
  ]);

  return (
    <ComparendosModuleView
      initialItems={items}
      initialKpis={kpis}
      bancos={bancos}
      canManage={canManage}
    />
  );
}
