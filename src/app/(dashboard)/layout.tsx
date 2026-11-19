import React from "react";
import { DashboardSidebar } from "@/components/layout/dashboard-nav";
import { SessionHeartbeat } from "@/components/layout/session-heartbeat";
import { SessionTimeoutGuard } from "@/components/auth/SessionTimeoutGuard";
import { isServerSupabaseConfigured } from "@/lib/supabase/server";
import { getServerUserSession } from "@/lib/auth/session";
import { getEventosVigentesUsuarioAction } from "@/actions/eventos.actions";
import { GlobalEventBanner } from "@/components/layout/global-event-banner";

export const preferredRegion = "yul1";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isSupabaseLive = isServerSupabaseConfigured();
  const session = await getServerUserSession();
  const eventosVigentes = session
    ? await getEventosVigentesUsuarioAction(session.perfil)
    : [];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#F8FAFC] text-[#0F172A] overflow-x-hidden">
      {session && <SessionHeartbeat />}
      {session && <SessionTimeoutGuard />}
      <DashboardSidebar
        isSupabaseLive={isSupabaseLive}
        userSession={session}
      />
      <div className="flex-1 flex flex-col min-w-0 w-full lg:pl-64 min-h-screen">
        <GlobalEventBanner eventos={eventosVigentes} />
        {/* Main Content Area: Sin encabezado redundante para maximizar la superficie útil */}
        <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 lg:px-6 py-4 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
