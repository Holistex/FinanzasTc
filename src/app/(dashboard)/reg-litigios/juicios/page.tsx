import {
  getLitigiosJuiciosAction,
  upsertLitigioJuicioAction,
  upsertAudienciaJuicioAction,
  deleteAudienciaJuicioAction,
} from "@/actions/litigios.actions";
import { JuiciosModuleView } from "@/components/litigios/juicios-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function RegLitigiosJuiciosPage() {
  const [session, { items, kpis }] = await Promise.all([
    getServerUserSession(),
    getLitigiosJuiciosAction(),
  ]);

  const canManage = hasPermission(session, "litigios_juicios", "GESTION");

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
