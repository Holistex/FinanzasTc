import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: "Finanzas Core Enterprise | Gestión SII & Factoring",
  description:
    "Sistema Financiero Corporativo de Facturación SII Chile, Neteo de Notas de Crédito y Cesión de Factoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
