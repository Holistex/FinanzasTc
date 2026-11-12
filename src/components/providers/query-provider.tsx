"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutos de vigencia fresca en memoria
            gcTime: 30 * 60 * 1000, // 30 minutos de persistencia en caché antes de recolección
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Renderiza de inmediato con caché existente sin bloquear
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
