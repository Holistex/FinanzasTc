export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { redirect } from "next/navigation";

export default function GestionCobranzaRedirectPage() {
  redirect("/ventas-tensacon/gestion-cobranza");
}
