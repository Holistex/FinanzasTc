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
import { getMantenedorOnAction } from "@/actions/mantenedor-on.actions";
import { getBancosAction } from "@/actions/mantenedores.actions";
import { GarantiasModuleView } from "@/components/garantias/garantias-module-view";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PolizasGarantiasPage() {
  const [session, { items, kpis }, mandantes, companias, catalogoOn, bancos] =
    await Promise.all([
      getServerUserSession(),
      getPolizasGarantiasAction(),
      getMandantesAction(),
      getCompaniasAction(),
      getMantenedorOnAction(undefined, "Activos"),
      getBancosAction(undefined, true),
    ]);

  const { canManage } = getModuleAccess(session, ["garantias_polizas"]);

  return (
    <GarantiasModuleView
      tipo="POLIZA"
      initialItems={items}
      initialKpis={kpis}
      mandantes={mandantes}
      companias={companias}
      catalogoOn={catalogoOn}
      bancos={bancos}
      onFetchAction={getPolizasGarantiasAction}
      onUpsertAction={upsertPolizaGarantiaAction}
      onRenovarAction={renovarGarantiaAction}
      onGetHistorialAction={getHistorialRenovacionesAction}
      canManage={canManage}
    />
  );
}
