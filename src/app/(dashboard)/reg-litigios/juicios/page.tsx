import {
  getLitigiosJuiciosAction,
  upsertLitigioJuicioAction,
  upsertAudienciaJuicioAction,
  deleteAudienciaJuicioAction,
} from "@/actions/litigios.actions";
import { JuiciosModuleView } from "@/components/litigios/juicios-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RegLitigiosJuiciosPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosJuiciosAction(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "litigios_juicios",
    "reg_litigios",
  ]);

  return (
    <JuiciosModuleView
      initialItems={items}
      initialKpis={kpis}
      onFetchAction={getLitigiosJuiciosAction}
      onUpsertAction={upsertLitigioJuicioAction}
      onUpsertAudienciaAction={upsertAudienciaJuicioAction}
      onDeleteAudienciaAction={deleteAudienciaJuicioAction}
      canManage={canManage}
    />
  );
}
