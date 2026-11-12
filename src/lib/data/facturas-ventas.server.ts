import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  FacturasVentasFilterParams,
  FacturaVenta,
  PagoFactura,
  PaginatedFacturasResponse,
} from "@/types/database.types";
import { EXCLUDED_DTE_TYPES } from "@/services/sii-csv-parser";
import { normalizeRut } from "@/lib/utils";

/**
 * Calcula la deuda efectiva de una factura:
 * Si deuda_cliente está definido (no null), se utiliza ese valor; de lo contrario se usa monto_neto_saldo.
 */
export function resolveDeudaCliente(f: Partial<FacturaVenta>): number {
  if (f.tipo_doc === 61) return 0;
  if (f.deuda_cliente !== null && f.deuda_cliente !== undefined) {
    return Math.max(0, Number(f.deuda_cliente));
  }
  return Math.max(0, Number(f.monto_neto_saldo ?? f.monto_total ?? 0));
}

/**
 * Clasifica estrictamente cada documento en una de las 3 pestañas del módulo.
 */
export function classifyDocumentoTab(
  f: FacturaVenta
): "PENDIENTES" | "PAGADAS" | "FAC_NC" {
  if (Number(f.tipo_doc) === 61) {
    return "FAC_NC";
  }
  const deuda = resolveDeudaCliente(f);
  if (deuda > 0) {
    return "PENDIENTES";
  }
  const hasPagosReales = Boolean(f.pagos_facturas && f.pagos_facturas.length > 0);
  if (hasPagosReales) {
    return "PAGADAS";
  }
  return "FAC_NC";
}

export function calculateFacturasVentasKpis(rows: FacturaVenta[]) {
  let totalFacturadoBruto = 0;
  let totalSaldoNeto = 0;
  let totalNotasCredito = 0;
  let montoEnFactoring = 0;
  let montoDirectoCliente = 0;
  let totalRecaudadoPagos = 0;

  for (const r of rows) {
    if (EXCLUDED_DTE_TYPES.has(Number(r.tipo_doc))) continue;

    const montoTotal = Number(r.monto_total) || 0;
    const deuda = resolveDeudaCliente(r);

    if (r.tipo_doc === 61) {
      totalNotasCredito += montoTotal;
    } else {
      totalFacturadoBruto += montoTotal;
      totalSaldoNeto += deuda;
      if (r.gestion_pago === "FACTORING") {
        montoEnFactoring += deuda;
      } else {
        montoDirectoCliente += deuda;
      }
      if (r.pagos_facturas && r.pagos_facturas.length > 0) {
        for (const p of r.pagos_facturas) {
          totalRecaudadoPagos += Number(p.monto_pago) || 0;
        }
      }
    }
  }

  return {
    totalFacturadoBruto,
    totalSaldoNeto,
    totalNotasCredito,
    montoEnFactoring,
    montoDirectoCliente,
    totalRecaudadoPagos,
  };
}

/**
 * Normaliza y pagina la respuesta de Facturas de Ventas a partir de las filas crudas de BD.
 */
export function buildFacturasVentasResponse(
  rawFacturas: FacturaVenta[],
  pagosMap: Map<string, PagoFactura[]>,
  params: FacturasVentasFilterParams = {}
): PaginatedFacturasResponse {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 15));
  const rutFilter = params.rut?.trim()
    ? normalizeRut(params.rut.trim())
    : undefined;
  const rawRutSearch = params.rut?.trim().toLowerCase();
  const folioFilter = params.folio?.trim();
  const fechaDesde = params.fechaDesde?.trim();
  const fechaHasta = params.fechaHasta?.trim();
  const gestionPago =
    params.gestionPago && params.gestionPago !== "TODOS"
      ? params.gestionPago
      : undefined;
  const tipoDoc =
    params.tipoDoc && params.tipoDoc !== "TODOS"
      ? parseInt(params.tipoDoc, 10)
      : undefined;
  const estadoDeuda = params.estadoDeuda || "PENDIENTES";
  const onFilter = params.onFilter?.trim();

  const ncByTargetInvoiceKey = new Map<
    string,
    { totalMontoNC: number; ncFolios: number[] }
  >();

  for (const doc of rawFacturas) {
    if (Number(doc.tipo_doc) === 61 && doc.folio_docto_ref) {
      const key = `${normalizeRut(doc.rut_cliente)}__${Number(doc.folio_docto_ref)}`;
      const current = ncByTargetInvoiceKey.get(key) || {
        totalMontoNC: 0,
        ncFolios: [],
      };
      current.totalMontoNC += Number(doc.monto_total) || 0;
      current.ncFolios.push(Number(doc.folio));
      ncByTargetInvoiceKey.set(key, current);
    }
  }

  const allFacturas: FacturaVenta[] = rawFacturas.map((f) => {
    const pagos = pagosMap.get(f.id) || [];
    if (Number(f.tipo_doc) === 61) {
      return {
        ...f,
        deuda_cliente: 0,
        monto_neto_saldo: 0,
        pagos_facturas: [],
        nc_referenciada_folio: null,
      };
    }

    const invoiceKey = `${normalizeRut(f.rut_cliente)}__${Number(f.folio)}`;
    const ncRef = ncByTargetInvoiceKey.get(invoiceKey);
    const totalPagosReales = pagos.reduce(
      (acc, p) => acc + (Number(p.monto_pago) || 0),
      0
    );

    const deudaPersistida = resolveDeudaCliente(f);
    const deudaCalculadaPorNeteoYPagos = Math.max(
      0,
      (Number(f.monto_total) || 0) -
        (ncRef?.totalMontoNC || 0) -
        totalPagosReales
    );
    const deudaEfectiva = Math.min(
      deudaPersistida,
      deudaCalculadaPorNeteoYPagos
    );

    return {
      ...f,
      deuda_cliente: deudaEfectiva,
      monto_neto_saldo: deudaEfectiva,
      pagos_facturas: pagos,
      nc_referenciada_folio: ncRef?.ncFolios?.[0] ?? null,
    };
  });

  let pendientesCount = 0;
  let pagadasCount = 0;
  let facNcCount = 0;

  for (const f of allFacturas) {
    if (EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc))) continue;
    const tab = classifyDocumentoTab(f);
    if (tab === "PENDIENTES") {
      pendientesCount += 1;
    } else if (tab === "PAGADAS") {
      pagadasCount += 1;
    } else {
      facNcCount += 1;
    }
  }

  const onsConDeudaSet = new Set<string>();
  for (const f of allFacturas) {
    if (EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc))) continue;
    if (classifyDocumentoTab(f) === "PENDIENTES" && resolveDeudaCliente(f) > 0) {
      if (f.on_proyecto && f.on_proyecto.trim() !== "") {
        onsConDeudaSet.add(f.on_proyecto.trim());
      }
    }
  }
  const onsConDeuda = Array.from(onsConDeudaSet).sort();

  const filtered = allFacturas.filter((item) => {
    if (EXCLUDED_DTE_TYPES.has(Number(item.tipo_doc))) return false;

    const itemTab = classifyDocumentoTab(item);
    if (itemTab !== estadoDeuda) {
      return false;
    }

    if (rawRutSearch) {
      const cleanRutItem = item.rut_cliente.toLowerCase();
      const cleanReason = item.razon_social.toLowerCase();
      const matchRut =
        cleanRutItem.includes(rawRutSearch) ||
        (rutFilter && item.rut_cliente.includes(rutFilter)) ||
        cleanReason.includes(rawRutSearch);
      if (!matchRut) return false;
    }
    if (folioFilter) {
      const matchFolioPropio = String(item.folio).includes(folioFilter);
      const matchFolioRef =
        item.folio_docto_ref !== null &&
        item.folio_docto_ref !== undefined &&
        String(item.folio_docto_ref).includes(folioFilter);
      const matchNcAsociada =
        item.nc_referenciada_folio !== null &&
        item.nc_referenciada_folio !== undefined &&
        String(item.nc_referenciada_folio).includes(folioFilter);
      if (!matchFolioPropio && !matchFolioRef && !matchNcAsociada) {
        return false;
      }
    }
    if (onFilter && onFilter !== "TODAS") {
      if (onFilter === "SIN_ON") {
        if (item.on_proyecto && item.on_proyecto.trim() !== "") {
          return false;
        }
      } else {
        if (item.on_proyecto !== onFilter) {
          return false;
        }
      }
    }
    if (fechaDesde && item.fecha_docto < fechaDesde) return false;
    if (fechaHasta && item.fecha_docto > fechaHasta) return false;
    if (gestionPago && item.gestion_pago !== gestionPago) return false;
    if (tipoDoc && Number(item.tipo_doc) !== tipoDoc) return false;
    return true;
  });

  if (estadoDeuda === "FAC_NC") {
    const groupDateMap = new Map<string, string>();
    for (const item of filtered) {
      const anchorFolio =
        Number(item.tipo_doc) === 61
          ? Number(item.folio_docto_ref || item.folio)
          : Number(item.folio);
      const groupKey = `${normalizeRut(item.rut_cliente)}__${anchorFolio}`;
      const existingDate = groupDateMap.get(groupKey) || "";
      if (item.fecha_docto > existingDate) {
        groupDateMap.set(groupKey, item.fecha_docto);
      }
    }

    filtered.sort((a, b) => {
      const anchorFolioA =
        Number(a.tipo_doc) === 61
          ? Number(a.folio_docto_ref || a.folio)
          : Number(a.folio);
      const anchorFolioB =
        Number(b.tipo_doc) === 61
          ? Number(b.folio_docto_ref || b.folio)
          : Number(b.folio);

      const groupKeyA = `${normalizeRut(a.rut_cliente)}__${anchorFolioA}`;
      const groupKeyB = `${normalizeRut(b.rut_cliente)}__${anchorFolioB}`;

      if (groupKeyA !== groupKeyB) {
        const dateA = groupDateMap.get(groupKeyA) || a.fecha_docto;
        const dateB = groupDateMap.get(groupKeyB) || b.fecha_docto;
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        return anchorFolioB - anchorFolioA;
      }

      if (Number(a.tipo_doc) !== Number(b.tipo_doc)) {
        return Number(a.tipo_doc) === 61 ? 1 : -1;
      }
      return b.folio - a.folio;
    });
  } else {
    filtered.sort((a, b) => {
      if (a.fecha_docto !== b.fecha_docto) {
        return b.fecha_docto.localeCompare(a.fecha_docto);
      }
      return b.folio - a.folio;
    });
  }

  const kpis = calculateFacturasVentasKpis(allFacturas);
  const totalCount = filtered.length;
  const subtotalMontoTotal = filtered.reduce(
    (acc, f) => acc + (Number(f.monto_total) || 0),
    0
  );
  const subtotalDeudaCliente = filtered.reduce(
    (acc, f) => acc + resolveDeudaCliente(f),
    0
  );
  const start = (page - 1) * pageSize;
  const paginatedData = filtered.slice(start, start + pageSize);

  return {
    data: paginatedData,
    totalCount,
    pendientesCount,
    pagadasCount,
    facNcCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    kpis,
    subtotalMontoTotal,
    subtotalDeudaCliente,
    onsConDeuda,
  };
}

/**
 * Construye el mapa de pagos por factura y enriquece las facturas crudas con respaldo local.
 */
export function mergeFacturasVentasWithLocalFallback(
  supaFacturas: FacturaVenta[],
  supaPagos: Array<Record<string, unknown>> | null
): { rawFacturas: FacturaVenta[]; pagosMap: Map<string, PagoFactura[]> } {
  const pagosMap = new Map<string, PagoFactura[]>();
  const seenPagoIds = new Set<string>();

  if (supaPagos) {
    for (const rawPago of supaPagos) {
      const pagoId = String(rawPago.id || "");
      if (pagoId) seenPagoIds.add(pagoId);
      const normalizedPago: PagoFactura = {
        id: pagoId,
        factura_id: String(rawPago.factura_id || ""),
        monto_pago: Number(rawPago.monto_pagado ?? rawPago.monto_pago ?? 0),
        fecha_pago: String(rawPago.fecha_pago || ""),
        observacion:
          rawPago.comentario !== undefined && rawPago.comentario !== null
            ? String(rawPago.comentario)
            : rawPago.observacion !== undefined && rawPago.observacion !== null
            ? String(rawPago.observacion)
            : null,
        created_at: String(rawPago.created_at || ""),
      };
      if (normalizedPago.factura_id && normalizedPago.monto_pago > 0) {
        const list = pagosMap.get(normalizedPago.factura_id) || [];
        list.push(normalizedPago);
        pagosMap.set(normalizedPago.factura_id, list);
      }
    }
  }

  const localDb = readLocalDb();
  for (const p of localDb.pagos_facturas) {
    if (p.id && seenPagoIds.has(p.id)) continue;
    if (p.factura_id && Number(p.monto_pago) > 0) {
      const list = pagosMap.get(p.factura_id) || [];
      list.push(p);
      pagosMap.set(p.factura_id, list);
    }
  }

  const localOnMap = new Map<string, string>();
  const localOnByFolioMap = new Map<string, string>();
  const localVencMap = new Map<string, string>();
  const localVencByFolioMap = new Map<string, string>();
  const localPdfMap = new Map<string, string>();
  const localPdfByFolioMap = new Map<string, string>();

  for (const lf of localDb.facturas_ventas || []) {
    const key = `${normalizeRut(lf.rut_cliente)}__${Number(lf.folio)}`;
    if (lf.on_proyecto) {
      localOnMap.set(lf.id, lf.on_proyecto);
      localOnByFolioMap.set(key, lf.on_proyecto);
    }
    if (lf.fecha_vencimiento) {
      localVencMap.set(lf.id, lf.fecha_vencimiento);
      localVencByFolioMap.set(key, lf.fecha_vencimiento);
    }
    if (lf.url_pdf) {
      localPdfMap.set(lf.id, lf.url_pdf);
      localPdfByFolioMap.set(key, lf.url_pdf);
    }
  }

  const rawFacturas = supaFacturas.map((f) => {
    const key = `${normalizeRut(f.rut_cliente)}__${Number(f.folio)}`;
    const localOn = localOnMap.get(f.id) || localOnByFolioMap.get(key);
    const localVenc = localVencMap.get(f.id) || localVencByFolioMap.get(key);
    const localPdf = localPdfMap.get(f.id) || localPdfByFolioMap.get(key);
    return {
      ...f,
      on_proyecto: f.on_proyecto ?? localOn ?? null,
      fecha_vencimiento: f.fecha_vencimiento ?? localVenc ?? null,
      url_pdf: f.url_pdf ?? localPdf ?? null,
    };
  });

  return { rawFacturas, pagosMap };
}

/**
 * Carga paginada de Facturas de Ventas ejecutando las consultas a Supabase en paralelo.
 */
export async function queryFacturasVentasServer(
  params: FacturasVentasFilterParams = {}
): Promise<PaginatedFacturasResponse> {
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();

    const [facturasRes, pagosRes] = await Promise.all([
      supabase
        .from("facturas_ventas")
        .select("*, empresa_factoring_cliente(*)")
        .neq("tipo_doc", 46)
        .order("fecha_docto", { ascending: false })
        .order("folio", { ascending: false }),
      supabase
        .from("pagos_facturas")
        .select("*")
        .order("fecha_pago", { ascending: false }),
    ]);

    if (facturasRes.error) {
      throw new Error(
        `Error consultando facturas_ventas: ${facturasRes.error.message}`
      );
    }

    const { rawFacturas, pagosMap } = mergeFacturasVentasWithLocalFallback(
      (facturasRes.data as FacturaVenta[]) || [],
      !pagosRes.error && pagosRes.data
        ? (pagosRes.data as Array<Record<string, unknown>>)
        : null
    );

    return buildFacturasVentasResponse(rawFacturas, pagosMap, params);
  }

  const db = readLocalDb();
  const clientesMap = new Map(
    db.empresa_factoring_cliente.map((c) => [c.id, c])
  );
  const pagosMap = new Map<string, PagoFactura[]>();
  for (const p of db.pagos_facturas) {
    if (p.factura_id && Number(p.monto_pago) > 0) {
      const list = pagosMap.get(p.factura_id) || [];
      list.push(p);
      pagosMap.set(p.factura_id, list);
    }
  }

  const rawFacturas = db.facturas_ventas
    .filter((f) => !EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc)))
    .map((f) => ({
      ...f,
      empresa_factoring_cliente: f.factoring_cliente_id
        ? clientesMap.get(f.factoring_cliente_id) || null
        : null,
    }));

  return buildFacturasVentasResponse(rawFacturas, pagosMap, params);
}
