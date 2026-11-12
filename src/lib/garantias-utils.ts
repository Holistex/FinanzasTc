import {
  EstadoGarantia,
  MonedaGarantia,
  GarantiaItemWithRelations,
  GarantiasKpiSummary,
} from "@/types/database.types";
import { formatCLP } from "@/lib/utils";

export function calculateDiasRestantes(fechaVencimiento: string): number {
  if (!fechaVencimiento) return 0;
  const parts = fechaVencimiento.split("-");
  if (parts.length < 3) return 0;
  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10) - 1;
  const targetDay = parseInt(parts[2], 10);

  const targetDate = new Date(targetYear, targetMonth, targetDay);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = targetDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function calculateEstadoGarantia(fechaVencimiento: string): {
  estado: EstadoGarantia;
  diasRestantes: number;
} {
  const diasRestantes = calculateDiasRestantes(fechaVencimiento);
  if (diasRestantes > 15) {
    return { estado: "VIGENTE", diasRestantes };
  } else if (diasRestantes >= 1) {
    return { estado: "PROXIMA_A_VENCER", diasRestantes };
  } else {
    return { estado: "VENCIDA", diasRestantes };
  }
}

export function computeGarantiasKpis(items: GarantiaItemWithRelations[]): GarantiasKpiSummary {
  const summary: GarantiasKpiSummary = {
    totalDocumentos: items.length,
    totalMontoClp: 0,
    totalMontoUf: 0,
    totalMontoUsd: 0,
    vigentesCount: 0,
    proximasVencerCount: 0,
    vencidasCount: 0,
    renovacionesCount: 0,
  };

  for (const item of items) {
    summary.totalMontoUf += item.monto_uf ?? item.monto ?? 0;
    if (item.moneda === "CLP") summary.totalMontoClp += item.monto;
    else if (item.moneda === "USD") summary.totalMontoUsd += item.monto;

    if (item.estado === "VIGENTE") summary.vigentesCount++;
    else if (item.estado === "PROXIMA_A_VENCER") summary.proximasVencerCount++;
    else if (item.estado === "VENCIDA") summary.vencidasCount++;

    summary.renovacionesCount = (summary.renovacionesCount || 0) + (item.contador_renovaciones || 0);
  }

  return summary;
}

export function formatMonedaGarantia(monto: number, moneda: MonedaGarantia): string {
  if (moneda === "CLP") return formatCLP(monto);
  if (moneda === "UF") {
    return `UF ${Number(monto || 0).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (moneda === "USD") {
    return `US$ ${Number(monto || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${monto} ${moneda}`;
}
