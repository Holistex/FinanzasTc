export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { redirect } from "next/navigation";

export default function VentasTensaconFacturasVentasRedirect() {
  redirect("/finanzas/facturas-ventas");
}
