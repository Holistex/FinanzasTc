import React from "react";
import { redirect } from "next/navigation";
import { getServerUserSession } from "@/lib/auth/session";

export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerUserSession();
  const esAdmin =
    Boolean(session?.esAdmin) ||
    String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

  if (!esAdmin) {
    redirect("/bienvenida");
  }

  return <>{children}</>;
}
