import {
  getBoletasGarantiasAction,
  upsertBoletaGarantiaAction,
  renovarGarantiaAction,
  getHistorialRenovacionesAction,
} from "@/actions/garantias.actions";
import {
  getMandantesAction,
  getCompaniasAction,
} from "@/actions/garantias-mantenedores.actions";
import { GarantiasModuleView } from "@/components/garantias/garantias-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function BoletasGarantiasPage() {
  const [session, { items, kpis }, mandantes, companias] = await Promise.all([
    getServerUserSession(),
    getBoletasGarantiasAction(),
    getMandantesAction(),
    getCompaniasAction(),
  ]);

  const canManage = hasPermission(session, "boletas_garantias", "GESTION");

  return (
    <GarantiasModuleView
      tipo="BOLETA"
      initialItems={items}
      initialKpis={kpis}
      mandantes={mandantes}
      companias={companias}
      onFetchAction={getBoletasGarantiasAction}
      onUpsertAction={upsertBoletaGarantiaAction}
      onRenovarAction={renovarGarantiaAction}
      onGetHistorialAction={getHistorialRenovacionesAction}
      canManage={canManage}
    />
  );
}
