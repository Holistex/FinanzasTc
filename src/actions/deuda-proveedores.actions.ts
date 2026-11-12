"use server";

import { getFacturasComprasAction } from "@/actions/facturas-compras.actions";
import { FacturaCompra } from "@/types/database.types";

export interface DeudaMensualItem {
  mesClave: string; // "YYYY-MM"
  mesNombre: string; // "Noviembre 2026"
  mesCorto: string; // "Nov 26"
  year: number;
  monthNumber: number; // 1-12
  totalDeuda: number;
  cantidadFacturas: number;
  cantidadProveedores: number;
  porcentaje: number;
  esVencido: boolean;
  facturas: FacturaCompra[];
}

export type AgingColor = "emerald" | "amber" | "orange" | "rose" | "purple";

export interface EstratoDeudaItem {
  id: string; // "en_plazo" | "dias_1_30" | "dias_31_60" | "dias_61_90" | "mas_90"
  tramo: string; // "En Plazo", "1 a 30 días", "31 a 60 días", "61 a 90 días", "+90 días"
  rangoMora: string;
  badgeIcon: string; // "🟢", "🟡", "🟠", "🔴", "🟣"
  badgeText: string;
  color: AgingColor;
  colorHex: string;
  docs: number;
  proveedoresCount: number;
  total: number;
  porcentaje: number;
  facturas: FacturaCompra[];
}

export interface DeudaProveedoresKPIs {
  totalDeudaProveedores: number;
  totalFacturas: number;
  totalProveedores: number;
  deudaVencida: number;
  deudaPorVencer: number;
  mesMayorDeuda: {
    mesClave: string;
    mesNombre: string;
    monto: number;
  } | null;
  promedioPorFactura: number;
}

export interface DeudaProveedoresResponse {
  datosMensuales: DeudaMensualItem[];
  estratificacion: EstratoDeudaItem[];
  kpis: DeudaProveedoresKPIs;
  todasLasFacturasPendientes: FacturaCompra[];
}

const MESES_NOMBRES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

// Lógica de agrupación por tramos de vencimiento (Aging Schedule)
export async function clasificarEstratosDeuda(
  facturasPendientes: FacturaCompra[],
  fechaHoy: Date = new Date()
): Promise<EstratoDeudaItem[]> {
  const hoyStr = fechaHoy.toISOString().split("T")[0];
  const [hY, hM, hD] = hoyStr.split("-").map(Number);
  const timeHoy = new Date(hY, hM - 1, hD).getTime();

  const estratosMap = {
    en_plazo: {
      id: "en_plazo",
      tramo: "En Plazo",
      rangoMora: "0 días mora (Vigente)",
      badgeIcon: "🟢",
      badgeText: "En Plazo",
      color: "emerald" as AgingColor,
      colorHex: "#10B981",
      docs: 0,
      proveedores: new Set<string>(),
      total: 0,
      facturas: [] as FacturaCompra[],
    },
    dias_1_30: {
      id: "dias_1_30",
      tramo: "1 a 30 días",
      rangoMora: "1 a 30 días mora",
      badgeIcon: "🟡",
      badgeText: "1 a 30d",
      color: "amber" as AgingColor,
      colorHex: "#F59E0B",
      docs: 0,
      proveedores: new Set<string>(),
      total: 0,
      facturas: [] as FacturaCompra[],
    },
    dias_31_60: {
      id: "dias_31_60",
      tramo: "31 a 60 días",
      rangoMora: "31 a 60 días mora",
      badgeIcon: "🟠",
      badgeText: "31 a 60d",
      color: "orange" as AgingColor,
      colorHex: "#F97316",
      docs: 0,
      proveedores: new Set<string>(),
      total: 0,
      facturas: [] as FacturaCompra[],
    },
    dias_61_90: {
      id: "dias_61_90",
      tramo: "61 a 90 días",
      rangoMora: "61 a 90 días mora",
      badgeIcon: "🔴",
      badgeText: "61 a 90d",
      color: "rose" as AgingColor,
      colorHex: "#EF4444",
      docs: 0,
      proveedores: new Set<string>(),
      total: 0,
      facturas: [] as FacturaCompra[],
    },
    mas_90: {
      id: "mas_90",
      tramo: "+90 días",
      rangoMora: "Más de 90 días mora",
      badgeIcon: "🟣",
      badgeText: "+90d",
      color: "purple" as AgingColor,
      colorHex: "#8B5CF6",
      docs: 0,
      proveedores: new Set<string>(),
      total: 0,
      facturas: [] as FacturaCompra[],
    },
  };

  let granTotal = 0;

  facturasPendientes.forEach((fac) => {
    const fVencStr = fac.fecha_vencimiento || fac.fecha_docto || hoyStr;
    const [fY, fM, fD] = fVencStr.split("-").map(Number);
    const timeVenc = new Date(fY, fM - 1, fD).getTime();
    const diffDias = Math.floor((timeHoy - timeVenc) / (1000 * 3600 * 24));
    const saldo = Number(
      fac.monto_saldo !== undefined && fac.monto_saldo !== null
        ? fac.monto_saldo
        : fac.monto_total || 0
    );
    const rut = fac.rut_proveedor;

    granTotal += saldo;

    let target;
    if (diffDias <= 0) {
      target = estratosMap.en_plazo;
    } else if (diffDias <= 30) {
      target = estratosMap.dias_1_30;
    } else if (diffDias <= 60) {
      target = estratosMap.dias_31_60;
    } else if (diffDias <= 90) {
      target = estratosMap.dias_61_90;
    } else {
      target = estratosMap.mas_90;
    }

    target.docs++;
    target.proveedores.add(rut);
    target.total += saldo;
    target.facturas.push(fac);
  });

  return Object.values(estratosMap).map((e) => {
    e.facturas.sort(
      (a, b) =>
        (b.monto_saldo || b.monto_total || 0) - (a.monto_saldo || a.monto_total || 0)
    );

    return {
      id: e.id,
      tramo: e.tramo,
      rangoMora: e.rangoMora,
      badgeIcon: e.badgeIcon,
      badgeText: e.badgeText,
      color: e.color,
      colorHex: e.colorHex,
      docs: e.docs,
      proveedoresCount: e.proveedores.size,
      total: e.total,
      porcentaje:
        granTotal > 0 ? Math.round((e.total / granTotal) * 1000) / 10 : 0,
      facturas: e.facturas,
    };
  });
}

export async function getDeudaProveedoresMensualAction(): Promise<DeudaProveedoresResponse> {
  // 1. Obtener todas las facturas de compras con saldos y neteos calculados
  const { data: rawCompras } = await getFacturasComprasAction({});

  const hoyStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const hoyMesClave = hoyStr.slice(0, 7);

  // 2. Filtrar únicamente facturas de compra pendientes con saldo de deuda > 0
  const facturasPendientes: FacturaCompra[] = [];

  for (const fc of rawCompras) {
    // Excluir notas de crédito (tipo 61)
    if (fc.tipo_doc === 61) continue;

    // Excluir estados liquidados
    if (fc.estado === "NETEO_NC") continue;

    // Calcular saldo pendiente
    const saldo =
      fc.monto_saldo !== undefined && fc.monto_saldo !== null
        ? fc.monto_saldo
        : fc.deuda_proveedor !== undefined && fc.deuda_proveedor !== null
        ? fc.deuda_proveedor
        : fc.monto_total;

    if (saldo <= 0) continue;

    // Si es una factura al contado y no tiene saldo deudor, omitir
    if (
      fc.condicion_pago === "CONTADO" &&
      fc.deuda_proveedor === 0 &&
      (!fc.monto_saldo || fc.monto_saldo <= 0)
    ) {
      continue;
    }

    facturasPendientes.push({
      ...fc,
      monto_saldo: saldo,
    });
  }

  // 3. Agrupación por mes de vencimiento
  const gruposMap = new Map<
    string,
    {
      facturas: FacturaCompra[];
      totalDeuda: number;
      proveedoresSet: Set<string>;
    }
  >();

  let totalDeudaProveedores = 0;
  let deudaVencida = 0;
  let deudaPorVencer = 0;
  const proveedoresGlobales = new Set<string>();

  for (const fc of facturasPendientes) {
    const fechaRef = fc.fecha_vencimiento || fc.fecha_docto || hoyStr;
    const mesClave = fechaRef.slice(0, 7); // "YYYY-MM"
    const saldo = fc.monto_saldo || 0;

    totalDeudaProveedores += saldo;
    proveedoresGlobales.add(fc.rut_proveedor);

    if (fechaRef < hoyStr) {
      deudaVencida += saldo;
    } else {
      deudaPorVencer += saldo;
    }

    if (!gruposMap.has(mesClave)) {
      gruposMap.set(mesClave, {
        facturas: [],
        totalDeuda: 0,
        proveedoresSet: new Set<string>(),
      });
    }

    const grupo = gruposMap.get(mesClave)!;
    grupo.facturas.push(fc);
    grupo.totalDeuda += saldo;
    grupo.proveedoresSet.add(fc.rut_proveedor);
  }

  // 4. Construir y ordenar lista cronológica de meses
  const mesesOrdenados = Array.from(gruposMap.keys()).sort();

  let mesMayor: { mesClave: string; mesNombre: string; monto: number } | null = null;

  const datosMensuales: DeudaMensualItem[] = mesesOrdenados.map((mesClave) => {
    const [yearStr, monthStr] = mesClave.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const mesNombre = `${MESES_NOMBRES[monthNum - 1] || "Mes"} ${year}`;
    const mesCorto = `${MESES_CORTOS[monthNum - 1] || "Mes"} ${String(year).slice(-2)}`;

    const grupo = gruposMap.get(mesClave)!;
    const porcentaje =
      totalDeudaProveedores > 0
        ? Math.round((grupo.totalDeuda / totalDeudaProveedores) * 1000) / 10
        : 0;

    const esVencido = mesClave < hoyMesClave;

    // Ordenar facturas internas por saldo descendente
    grupo.facturas.sort((a, b) => (b.monto_saldo || 0) - (a.monto_saldo || 0));

    if (!mesMayor || grupo.totalDeuda > mesMayor.monto) {
      mesMayor = {
        mesClave,
        mesNombre,
        monto: grupo.totalDeuda,
      };
    }

    return {
      mesClave,
      mesNombre,
      mesCorto,
      year,
      monthNumber: monthNum,
      totalDeuda: grupo.totalDeuda,
      cantidadFacturas: grupo.facturas.length,
      cantidadProveedores: grupo.proveedoresSet.size,
      porcentaje,
      esVencido,
      facturas: grupo.facturas,
    };
  });

  const totalFacturas = facturasPendientes.length;
  const promedioPorFactura =
    totalFacturas > 0 ? Math.round(totalDeudaProveedores / totalFacturas) : 0;

  // 5. Calcular estratificación de la deuda (Aging Schedule)
  const estratificacion = await clasificarEstratosDeuda(facturasPendientes);

  return {
    datosMensuales,
    estratificacion,
    kpis: {
      totalDeudaProveedores,
      totalFacturas,
      totalProveedores: proveedoresGlobales.size,
      deudaVencida,
      deudaPorVencer,
      mesMayorDeuda: mesMayor,
      promedioPorFactura,
    },
    todasLasFacturasPendientes: facturasPendientes,
  };
}
