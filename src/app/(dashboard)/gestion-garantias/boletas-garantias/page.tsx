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
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoletasGarantiasPage() {
  const [session, { items, kpis }, mandantes, companias] = await Promise.all([
    getServerUserSession(),
    getBoletasGarantiasAction(),
    getMandantesAction(),
    getCompaniasAction(),
  ]);

  const { canManage } = getModuleAccess(session, ["garantias_boletas"]);

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
