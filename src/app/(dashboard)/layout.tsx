import React from "react";
import { DashboardSidebar } from "@/components/layout/dashboard-nav";
import { isServerSupabaseConfigured } from "@/lib/supabase/server";
import { getServerUserSession } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isSupabaseLive = isServerSupabaseConfigured();
  const session = await getServerUserSession();

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] overflow-x-hidden">
      <DashboardSidebar
        isSupabaseLive={isSupabaseLive}
        userSession={session}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Main Content Area: Sin encabezado redundante para maximizar la superficie útil */}
        <main className="flex-1 p-5 max-w-[1650px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
