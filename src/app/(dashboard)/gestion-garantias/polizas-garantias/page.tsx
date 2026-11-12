import {
  getPolizasGarantiasAction,
  upsertPolizaGarantiaAction,
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
export const revalidate = 0;

export default async function PolizasGarantiasPage() {
  const [session, { items, kpis }, mandantes, companias] = await Promise.all([
    getServerUserSession(),
    getPolizasGarantiasAction(),
    getMandantesAction(),
    getCompaniasAction(),
  ]);

  const canManage = hasPermission(session, "polizas_garantias", "GESTION");

  return (
    <GarantiasModuleView
      tipo="POLIZA"
      initialItems={items}
      initialKpis={kpis}
      mandantes={mandantes}
      companias={companias}
      onFetchAction={getPolizasGarantiasAction}
      onUpsertAction={upsertPolizaGarantiaAction}
      onRenovarAction={renovarGarantiaAction}
      onGetHistorialAction={getHistorialRenovacionesAction}
      canManage={canManage}
    />
  );
}
