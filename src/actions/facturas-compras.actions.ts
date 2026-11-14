"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  EmpresaConfirming,
  EmpresaFactoringProveedor,
  EstadoFacturaCompra,
  FacturaCompra,
  NeteoCompra,
  ChequeCompra,
  CondicionPago,
  PagoCompraHistorico,
  ModalidadPagoCompra,
  MantenedorColaborador,
  MantenedorON,
} from "@/types/database.types";
import {
  parseAndValidateComprasCsv,
  SiiComprasValidationSummary,
} from "@/services/sii-compras-csv-parser";
import { assertCanManage, assertIsAdmin } from "@/lib/auth/session";
import { formatCLP, normalizeRut } from "@/lib/utils";

export interface ComprasKPIs {
  totalCompras: number;
  totalDeudaProveedor: number;
  totalFactoring: number;
  totalConfirming: number;
  totalCheque: number;
  totalNeteoNC: number;
  cantidadTotal: number;
  cantidadDeudaProveedor: number;
  cantidadFactoring: number;
  cantidadConfirming: number;
  cantidadCheque: number;
}

export interface FacturasComprasResponse {
  data: FacturaCompra[];
  kpis: ComprasKPIs;
  factoringProveedores: EmpresaFactoringProveedor[];
  empresasConfirming: EmpresaConfirming[];
  colaboradores: MantenedorColaborador[];
  catalogoOn: MantenedorON[];
  neteos: NeteoCompra[];
  facNcCount: number;
}

export interface FacturasComprasFilterParams {
  search?: string;
  estado?: "TODOS" | EstadoFacturaCompra;
  tipoDoc?: "TODOS" | "33" | "61";
}

export async function getFacturasComprasAction(
  params: FacturasComprasFilterParams = {}
): Promise<FacturasComprasResponse> {
  const search = params.search?.trim().toLowerCase();
  const estadoFilter = params.estado && params.estado !== "TODOS" ? params.estado : undefined;
  const tipoDocFilter = params.tipoDoc && params.tipoDoc !== "TODOS" ? parseInt(params.tipoDoc, 10) : undefined;

  let rawCompras: FacturaCompra[] = [];
  let rawNeteos: NeteoCompra[] = [];
  let rawCheques: ChequeCompra[] = [];
  let factoringProveedores: EmpresaFactoringProveedor[] = [];
  let empresasConfirming: EmpresaConfirming[] = [];
  let colaboradores: MantenedorColaborador[] = [];
  let catalogoOn: MantenedorON[] = [];

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();

    // 1. Consultar mantenedores primero para cruzar en memoria sin JOIN foráneo
    const { data: provData } = await supabase.from("empresa_factoring_proveedores").select("*");
    if (provData) factoringProveedores = provData as EmpresaFactoringProveedor[];

    const { data: confData } = await supabase.from("empresa_confirming").select("*");
    if (confData) empresasConfirming = confData as EmpresaConfirming[];

    const { data: colabData } = await supabase.from("mantenedor_colaboradores").select("*");
    if (colabData) colaboradores = colabData as MantenedorColaborador[];

    const { data: onData } = await supabase.from("mantenedor_on").select("*");
    if (onData) catalogoOn = onData as MantenedorON[];

    const localDbPre = readLocalDb();
    if (factoringProveedores.length === 0 && localDbPre.empresa_factoring_proveedores) {
      factoringProveedores = localDbPre.empresa_factoring_proveedores;
    }
    if (empresasConfirming.length === 0 && localDbPre.empresa_confirming) {
      empresasConfirming = localDbPre.empresa_confirming;
    }

    const factoringMap = new Map(factoringProveedores.map((p) => [String(p.id), p]));
    const confirmingMap = new Map(empresasConfirming.map((c) => [String(c.id), c]));

    // 2. Consultar facturas de compras (lectura directa sin JOIN por foreign key)
    const { data, error } = await supabase
      .from("facturas_compras")
      .select("*")
      .order("fecha_docto", { ascending: false });

    if (error) {
      console.error("[FacturasCompras] Error lectura:", error.message);
    }

    if (!error && data) {
      rawCompras = (data as unknown as Array<Record<string, unknown>>).map((r) => {
        const rawEstado = String(r.estado || "").toUpperCase();
        const rawModPago = String(r.modalidad_pago || "").toUpperCase();
        const rawMod = String(r.modalidad || "").toUpperCase();

        let estadoFinal: EstadoFacturaCompra = (r.estado as EstadoFacturaCompra) || "DEUDA_PROVEEDOR";
        if (rawEstado === "FACTORING" || rawModPago === "FACTORING" || rawMod === "FACTORING") {
          estadoFinal = "FACTORING";
        } else if (rawEstado === "CONFIRMING" || rawModPago === "CONFIRMING" || rawMod === "CONFIRMING") {
          estadoFinal = "CONFIRMING";
        } else if (rawEstado === "CHEQUE" || rawModPago === "CHEQUE" || rawMod === "CHEQUE") {
          estadoFinal = "CHEQUE";
        } else if (rawEstado === "COMPRA_TC" || rawModPago === "COMPRA_TC" || rawMod === "COMPRA_TC") {
          estadoFinal = "COMPRA_TC";
        } else if (rawEstado === "NETEO_NC" || rawModPago === "NETEO_NC" || rawMod === "NETEO_NC") {
          estadoFinal = "NETEO_NC";
        } else if (rawEstado === "PAGADA" || rawModPago === "PAGADA" || rawMod === "PAGADA") {
          estadoFinal = "PAGADA";
        }

        const factId = r.factoring_id ? String(r.factoring_id) : r.factoring_proveedor_id ? String(r.factoring_proveedor_id) : null;
        const confId = r.confirming_id ? String(r.confirming_id) : null;

        return {
          id: String(r.id),
          nro: Number(r.nro || 0),
          tipo_doc: Number(r.tipo_doc || 33),
          tipo_compra: r.tipo_compra ? String(r.tipo_compra) : null,
          rut_proveedor: String(r.rut_proveedor || ""),
          razon_social: String(r.razon_social || ""),
          folio: Number(r.folio || 0),
          fecha_docto: String(r.fecha_docto || ""),
          fecha_vencimiento: String(r.fecha_vencimiento || ""),
          fecha_recepcion: r.fecha_recepcion ? String(r.fecha_recepcion) : null,
          fecha_acuse_recibo: r.fecha_acuse_recibo ? String(r.fecha_acuse_recibo) : null,
          condicion_pago: (r.condicion_pago as CondicionPago) || (r.deuda_proveedor === 0 ? "CONTADO" : "CREDITO"),
          monto_total: Number(r.monto_total || 0),
          monto_saldo: r.condicion_pago === "CONTADO" || estadoFinal === "COMPRA_TC" ? 0 : r.monto_saldo !== undefined && r.monto_saldo !== null ? Number(r.monto_saldo) : Number(r.monto_total || 0),
          deuda_proveedor: r.condicion_pago === "CONTADO" || estadoFinal === "COMPRA_TC" ? 0 : Number(r.deuda_proveedor ?? r.monto_saldo ?? r.monto_total),
          estado: estadoFinal,
          modalidad_pago: (r.modalidad_pago as string) || (r.modalidad as string) || estadoFinal,
          modalidad: (r.modalidad as string) || (r.modalidad_pago as string) || estadoFinal,
          factoring_id: factId,
          factoring_proveedor_id: factId,
          empresa_factoring_proveedor: factId ? factoringMap.get(factId) || null : null,
          confirming_id: confId,
          empresa_confirming: confId ? confirmingMap.get(confId) || null : null,
          numero_cheque: r.numero_cheque ? String(r.numero_cheque) : null,
          fecha_vencimiento_cheque: r.fecha_vencimiento_cheque ? String(r.fecha_vencimiento_cheque) : null,
          banco_emisor: r.banco_emisor ? String(r.banco_emisor) : null,
          colaborador_id: r.colaborador_id ? String(r.colaborador_id) : null,
          on_proyecto: r.on_proyecto ? String(r.on_proyecto) : null,
          observacion_tc: r.observacion_tc ? String(r.observacion_tc) : null,
          created_at: String(r.created_at || ""),
          updated_at: r.updated_at ? String(r.updated_at) : undefined,
        };
      });
    }

    // 3. Consultar neteos de compras
    const { data: neteosData } = await supabase.from("neteos_compras").select("*");
    if (neteosData) {
      rawNeteos = neteosData as NeteoCompra[];
    }

    // 4. Consultar cheques de compras
    const { data: chequesData } = await supabase.from("cheques_compras").select("*");
    if (chequesData) {
      rawCheques = chequesData as ChequeCompra[];
    }
  }

  // Fallback si no hay Supabase o para hidratación local
  const localDb = readLocalDb();
  if (colaboradores.length === 0 && localDb.mantenedor_colaboradores) {
    colaboradores = localDb.mantenedor_colaboradores;
  }
  colaboradores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  if (catalogoOn.length === 0 && localDb.mantenedor_on) {
    catalogoOn = localDb.mantenedor_on;
  }
  catalogoOn.sort((a, b) => a.codigo_on.localeCompare(b.codigo_on, "es", { numeric: true }));

  const colabMap = new Map(colaboradores.map((c) => [c.id, c]));
  const localComprasById = new Map((localDb.facturas_compras || []).map((fc) => [fc.id, fc]));
  const localComprasByKey = new Map(
    (localDb.facturas_compras || []).map((fc) => [
      `${normalizeRut(fc.rut_proveedor)}_${fc.folio}`,
      fc,
    ])
  );
  const pagosTcByKey = new Map(
    (localDb.pagos_compras || [])
      .filter((p) => p.modalidad_pago === "COMPRA_TC")
      .map((p) => [`${normalizeRut(p.rut_proveedor)}_${p.folio}`, p])
  );

  if (rawCompras.length === 0) {
    const provMap = new Map(localDb.empresa_factoring_proveedores.map((p) => [p.id, p]));
    const confMap = new Map((localDb.empresa_confirming || []).map((c) => [c.id, c]));

    rawCompras = (localDb.facturas_compras || []).map((fc) => ({
      ...fc,
      monto_saldo:
        fc.estado === "COMPRA_TC" || fc.condicion_pago === "CONTADO"
          ? 0
          : fc.monto_saldo !== undefined && fc.monto_saldo !== null
          ? fc.monto_saldo
          : fc.monto_total,
      deuda_proveedor:
        fc.estado === "COMPRA_TC" || fc.condicion_pago === "CONTADO" ? 0 : fc.deuda_proveedor,
      empresa_factoring_proveedor: fc.factoring_proveedor_id
        ? provMap.get(fc.factoring_proveedor_id) || null
        : null,
      empresa_confirming: fc.confirming_id ? confMap.get(fc.confirming_id) || null : null,
      colaborador: fc.colaborador_id ? colabMap.get(fc.colaborador_id) || null : null,
    }));
  } else {
    // Enriquecer con datos locales de Compra TC por ID o por clave RUT+Folio
    rawCompras = rawCompras.map((fc) => {
      const compositeKey = `${normalizeRut(fc.rut_proveedor)}_${fc.folio}`;
      const localFc = localComprasById.get(fc.id) || localComprasByKey.get(compositeKey);
      const pagoTc = pagosTcByKey.get(compositeKey);

      const isCompraTc =
        fc.estado === "COMPRA_TC" ||
        localFc?.estado === "COMPRA_TC" ||
        Boolean(pagoTc);

      const estado: EstadoFacturaCompra = isCompraTc ? "COMPRA_TC" : fc.estado;
      const colaboradorId = fc.colaborador_id || localFc?.colaborador_id || null;
      const onProyecto = fc.on_proyecto || localFc?.on_proyecto || null;
      const observacionTc = fc.observacion_tc || localFc?.observacion_tc || null;

      return {
        ...fc,
        estado,
        monto_saldo: isCompraTc ? 0 : fc.monto_saldo,
        deuda_proveedor: isCompraTc ? 0 : fc.deuda_proveedor,
        colaborador_id: colaboradorId,
        colaborador: colaboradorId ? colabMap.get(colaboradorId) || null : null,
        on_proyecto: onProyecto,
        observacion_tc: observacionTc,
      };
    });
  }

  if (rawNeteos.length === 0 && localDb.neteos_compras) {
    rawNeteos = localDb.neteos_compras;
  }
  if (rawCheques.length === 0 && localDb.cheques_compras) {
    rawCheques = localDb.cheques_compras;
  }
  if (factoringProveedores.length === 0) {
    factoringProveedores = localDb.empresa_factoring_proveedores;
  }
  factoringProveedores.sort((a, b) => a.razon_social.localeCompare(b.razon_social));

  if (empresasConfirming.length === 0) {
    empresasConfirming = localDb.empresa_confirming || [];
  }
  empresasConfirming.sort((a, b) => a.razon_social.localeCompare(b.razon_social));

  // Mapear detalles de neteos por documento
  const comprasById = new Map<string, FacturaCompra>(rawCompras.map((fc) => [fc.id, fc]));

  // Enriquecer Neteos con datos de folios y proveedor para la vista
  const enrichedNeteos: NeteoCompra[] = rawNeteos.map((n) => {
    const fac = comprasById.get(n.factura_id);
    const nc = comprasById.get(n.nota_credito_id);
    return {
      ...n,
      factura_folio: fac?.folio,
      nota_credito_folio: nc?.folio,
      rut_proveedor: fac?.rut_proveedor || nc?.rut_proveedor,
      razon_social: fac?.razon_social || nc?.razon_social,
    };
  });

  // Vincular neteos y cheques a cada factura y calcular saldos en tiempo real
  for (const fc of rawCompras) {
    if (fc.tipo_doc === 61) {
      // Para Notas de Crédito: calcular saldo no consumido
      const totalUsado = rawNeteos
        .filter((n) => n.nota_credito_id === fc.id)
        .reduce((sum, n) => sum + Number(n.monto_neteado || 0), 0);
      fc.saldo_restante_nc = Math.max(0, fc.monto_total - totalUsado);
    } else {
      // Para Facturas (DTE 33, etc.): calcular saldo deudor pendiente descontando neteos y cheques
      const neteosDeEstaFactura = enrichedNeteos.filter((n) => n.factura_id === fc.id);
      fc.neteos = neteosDeEstaFactura;
      const totalNeteado = neteosDeEstaFactura.reduce(
        (sum, n) => sum + Number(n.monto_neteado || 0),
        0
      );

      const chequesDeEstaFactura = rawCheques.filter((c) => c.factura_id === fc.id);
      fc.cheques = chequesDeEstaFactura;
      const totalCheques = chequesDeEstaFactura.reduce(
        (sum, c) => sum + Number(c.monto_cheque || 0),
        0
      );
      fc.total_cheques_emitidos = totalCheques;

      const chequesCobrados = chequesDeEstaFactura.filter((c) => c.estado === "COBRADO");
      const totalChequesCobrados = chequesCobrados.reduce(
        (sum, c) => sum + Number(c.monto_cheque || 0),
        0
      );

      if (
        fc.estado === "COMPRA_TC" ||
        fc.condicion_pago === "CONTADO" ||
        fc.estado === "PAGADA"
      ) {
        // Factura ya saldada ($0) por Compra TC, Contado o pago previo -> mantener saldo $ 0
        fc.monto_saldo = 0;
        fc.deuda_proveedor = 0;
        if (totalNeteado > 0 && fc.estado !== "COMPRA_TC") {
          fc.estado = "NETEO_NC";
        }
      } else if (fc.estado === "CHEQUE" || totalCheques > 0) {
        // CICLO DE VIDA DE CHEQUES: Los cheques EMITIDOS mantienen el saldo de la factura ACTIVO
        // (dinero aún no sale del banco). Sólo cheques efectivamente COBRADOS reducen el saldo.
        const saldoCheque = Math.max(0, fc.monto_total - totalNeteado - totalChequesCobrados);
        fc.monto_saldo = saldoCheque;
        fc.deuda_proveedor = saldoCheque;
        if (saldoCheque === 0) {
          fc.estado = "PAGADA";
        }
      } else {
        const saldoCalculado = Math.max(0, fc.monto_total - totalNeteado);
        fc.monto_saldo = saldoCalculado;

        if (saldoCalculado === 0 && totalNeteado > 0) {
          fc.estado = "NETEO_NC";
        }
      }
    }
  }

  // Cálculo de KPIs globales
  let totalCompras = 0;
  let totalDeudaProveedor = 0;
  let totalFactoring = 0;
  let totalConfirming = 0;
  let totalCheque = 0;
  let totalNeteoNC = 0;

  let cantidadDeudaProveedor = 0;
  let cantidadFactoring = 0;
  let cantidadConfirming = 0;
  let cantidadCheque = 0;

  let facNcCount = 0;

  for (const item of rawCompras) {
    const monto = Number(item.monto_total || 0);
    const saldo = Number(item.monto_saldo !== undefined ? item.monto_saldo : monto);

    if (item.tipo_doc === 61) {
      facNcCount += 1;
      continue;
    }

    // Es Factura (DTE 33/34)
    totalCompras += monto;

    const mods = [
      item.estado,
      (item as unknown as Record<string, unknown>).modalidad_pago,
      (item as unknown as Record<string, unknown>).modalidad,
    ].map((v) => (v ? String(v).toUpperCase() : ""));

    if (mods.includes("NETEO_NC")) {
      facNcCount += 1;
      totalNeteoNC += monto;
    } else if (mods.includes("FACTORING")) {
      totalFactoring += (saldo > 0 ? saldo : monto);
      cantidadFactoring += 1;
    } else if (mods.includes("CONFIRMING")) {
      totalConfirming += (saldo > 0 ? saldo : monto);
      cantidadConfirming += 1;
    } else if (
      mods.includes("CHEQUE") ||
      Boolean(item.total_cheques_emitidos && item.total_cheques_emitidos > 0) ||
      Boolean(item.cheques && item.cheques.length > 0)
    ) {
      totalCheque += (item.total_cheques_emitidos || (saldo > 0 ? saldo : monto));
      cantidadCheque += 1;
    } else if (
      !mods.includes("PAGADA") &&
      !mods.includes("COMPRA_TC") &&
      item.condicion_pago !== "CONTADO" &&
      saldo > 0
    ) {
      totalDeudaProveedor += saldo;
      cantidadDeudaProveedor += 1;
    }
  }

  // Aplicar filtros a la lista retornada
  let filtered = [...rawCompras];

  if (search) {
    filtered = filtered.filter(
      (f) =>
        String(f.folio).includes(search) ||
        f.rut_proveedor.toLowerCase().includes(search) ||
        f.razon_social.toLowerCase().includes(search)
    );
  }

  if (estadoFilter) {
    filtered = filtered.filter((f) => f.estado === estadoFilter);
  }

  if (tipoDocFilter) {
    filtered = filtered.filter((f) => f.tipo_doc === tipoDocFilter);
  }

  return {
    data: filtered,
    kpis: {
      totalCompras,
      totalDeudaProveedor,
      totalFactoring,
      totalConfirming,
      totalCheque,
      totalNeteoNC,
      cantidadTotal: rawCompras.filter((f) => f.tipo_doc !== 61).length,
      cantidadDeudaProveedor,
      cantidadFactoring,
      cantidadConfirming,
      cantidadCheque,
    },
    factoringProveedores,
    empresasConfirming,
    colaboradores,
    catalogoOn,
    neteos: enrichedNeteos,
    facNcCount,
  };
}

/**
 * Procesa la importación de un CSV del Registro de Compras SII
 */
export async function importarComprasCsvAction(
  csvContent: string,
  periodoLibro?: string
): Promise<SiiComprasValidationSummary> {
  // Validación de permisos de Administrador
  const auth = await assertIsAdmin();
  if (!auth.authorized) {
    throw new Error(auth.error || "Acceso denegado: Se requiere rol de ADMINISTRADOR para importar archivos CSV.");
  }

  const normalizedPeriodoLibro =
    periodoLibro && /^\d{4}-\d{2}$/.test(periodoLibro.trim())
      ? periodoLibro.trim()
      : null;

  let existingKeys = new Set<string>();
  const existingIdByKey = new Map<string, string>();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("facturas_compras")
        .select("id, rut_proveedor, folio")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      const batch = (data || []) as Array<{ id: string; rut_proveedor: string; folio: number }>;
      for (const r of batch) {
        const key = `${normalizeRut(r.rut_proveedor)}_${r.folio}`;
        existingKeys.add(key);
        if (r.id) existingIdByKey.set(key, r.id);
      }
      if (batch.length < pageSize) break;
      from += pageSize;
    }
  } else {
    const localDb = readLocalDb();
    existingKeys = new Set(
      (localDb.facturas_compras || []).map(
        (r) => `${normalizeRut(r.rut_proveedor)}_${r.folio}`
      )
    );
  }

  const summary = parseAndValidateComprasCsv(csvContent, existingKeys);

  if (summary.nuevasAInyectar.length > 0) {
    // Deduplicación estricta en memoria
    const seenBatchKeys = new Set<string>();
    const finalRowsToInsert: FacturaCompra[] = [];

    for (const row of summary.nuevasAInyectar) {
      const compositeKey = `${normalizeRut(row.rut_proveedor)}_${row.folio}`;
      if (existingKeys.has(compositeKey) || seenBatchKeys.has(compositeKey)) {
        summary.omitidasPorDuplicidad.push({
          rut_proveedor: row.rut_proveedor,
          folio: row.folio,
          razon_social: row.razon_social,
          tipo_doc: row.tipo_doc,
          monto_total: row.monto_total,
          motivo: "EXISTE_EN_BD",
        });
        continue;
      }
      seenBatchKeys.add(compositeKey);

      finalRowsToInsert.push({
        id: `fc-${Date.now()}-${row.folio}-${Math.random().toString(36).slice(2, 6)}`,
        nro: row.nro,
        tipo_doc: row.tipo_doc,
        tipo_compra: row.tipo_compra,
        rut_proveedor: row.rut_proveedor,
        razon_social: row.razon_social,
        folio: row.folio,
        fecha_docto: row.fecha_docto,
        fecha_vencimiento: row.fecha_vencimiento,
        fecha_recepcion: row.fecha_recepcion || null,
        fecha_acuse_recibo: row.fecha_acuse_recibo || null,
        condicion_pago: row.condicion_pago,
        monto_total: row.monto_total,
        monto_saldo: row.condicion_pago === "CONTADO" ? 0 : row.monto_saldo,
        deuda_proveedor: row.condicion_pago === "CONTADO" ? 0 : row.monto_saldo,
        estado: row.estado,
        periodo_libro: normalizedPeriodoLibro || row.fecha_docto?.slice(0, 7) || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Inserción en Supabase con cláusula ON CONFLICT DO NOTHING
    if (isServerSupabaseConfigured() && finalRowsToInsert.length > 0) {
      const supabase = await createServerSupabaseClient();
      const payloadToUpsert = finalRowsToInsert.map((r) => {
        const row: Record<string, unknown> = {
          nro: r.nro,
          tipo_doc: r.tipo_doc,
          tipo_compra: r.tipo_compra,
          rut_proveedor: r.rut_proveedor,
          razon_social: r.razon_social,
          folio: r.folio,
          fecha_docto: r.fecha_docto,
          fecha_vencimiento: r.fecha_vencimiento,
          fecha_recepcion: r.fecha_recepcion,
          fecha_acuse_recibo: r.fecha_acuse_recibo,
          condicion_pago: r.condicion_pago,
          monto_total: r.monto_total,
          monto_saldo: r.monto_saldo,
          deuda_proveedor: r.deuda_proveedor,
          estado: r.estado,
          periodo_libro: r.periodo_libro ?? null,
        };
        return row;
      });

      const { error } = await supabase.from("facturas_compras").upsert(
        payloadToUpsert,
        {
          onConflict: "rut_proveedor,folio",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        console.error("Error en upsert compras Supabase:", error.message, error);
        throw new Error(`Error al guardar en Supabase (facturas_compras): ${error.message}`);
      }
    }

    // Guardar en respaldo local con deduplicación estricta
    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.pagos_compras) db.pagos_compras = [];

    const localExistingKeys = new Set(
      db.facturas_compras.map(
        (f) => `${normalizeRut(f.rut_proveedor)}_${f.folio}`
      )
    );

    const trulyNewRows = finalRowsToInsert.filter(
      (r) => !localExistingKeys.has(`${normalizeRut(r.rut_proveedor)}_${r.folio}`)
    );

    db.facturas_compras = [...trulyNewRows, ...db.facturas_compras];
    writeLocalDb(db);
  }

  // Si se confirmó un Período de Libro y hubo documentos ya existentes en BD,
  // actualizamos su `periodo_libro` para que queden asignados al Libro SII correcto.
  if (normalizedPeriodoLibro && summary.omitidasPorDuplicidad.length > 0) {
    const existingDuplicateKeys = new Set(
      summary.omitidasPorDuplicidad
        .filter((item) => item.motivo === "EXISTE_EN_BD")
        .map((item) => `${normalizeRut(item.rut_proveedor)}_${item.folio}`)
    );

    if (existingDuplicateKeys.size > 0) {
      if (isServerSupabaseConfigured()) {
        const supabase = await createServerSupabaseClient();
        const idsToUpdate: string[] = [];
        for (const key of existingDuplicateKeys) {
          const id = existingIdByKey.get(key);
          if (id) idsToUpdate.push(id);
        }

        const CHUNK_SIZE = 200;
        for (let i = 0; i < idsToUpdate.length; i += CHUNK_SIZE) {
          const chunk = idsToUpdate.slice(i, i + CHUNK_SIZE);
          const { error: updateErr } = await supabase
            .from("facturas_compras")
            .update({ periodo_libro: normalizedPeriodoLibro })
            .in("id", chunk);
          if (updateErr) {
            console.error("Error actualizando periodo_libro en duplicadas:", updateErr.message);
          }
        }
      }

      const db = readLocalDb();
      if (db.facturas_compras && db.facturas_compras.length > 0) {
        let changed = false;
        db.facturas_compras = db.facturas_compras.map((f) => {
          const k = `${normalizeRut(f.rut_proveedor)}_${f.folio}`;
          if (existingDuplicateKeys.has(k) && f.periodo_libro !== normalizedPeriodoLibro) {
            changed = true;
            return { ...f, periodo_libro: normalizedPeriodoLibro };
          }
          return f;
        });
        if (changed) writeLocalDb(db);
      }
    }
  }

  revalidatePath("/compras-tensacon/facturas-compras");
  revalidatePath("/compras-tensacon/historico-pagos");
  revalidatePath("/compras-tensacon/match-flexline");
  return summary;
}

/**
 * Cambia el estado de una factura de compras entre los estados permitidos
 */
export async function cambiarEstadoCompraAction(input: {
  id: string;
  estado: EstadoFacturaCompra;
  factoringProveedorId?: string | null;
  factoringId?: string | null;
  confirmingId?: string | null;
  nuevaFechaVencimiento?: string | null;
  numeroCheque?: string | null;
  fechaVencimientoCheque?: string | null;
  bancoEmisor?: string | null;
  colaboradorId?: string | null;
  onProyecto?: string | null;
  observacionTc?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    if (input.estado === "COMPRA_TC" && !input.colaboradorId) {
      return {
        success: false,
        error: "Debes seleccionar un colaborador responsable para registrar la modalidad Compra TC.",
      };
    }

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.pagos_compras) db.pagos_compras = [];
    if (!db.mantenedor_colaboradores) db.mantenedor_colaboradores = [];

    const existingLocal = db.facturas_compras.find((x) => x.id === input.id);

    const estadoUpper = input.estado.toUpperCase();
    const factoringIdSeleccionado = input.factoringId || input.factoringProveedorId || null;
    const confirmingIdSeleccionado = input.confirmingId || null;

    const payload: Partial<FacturaCompra> & {
      modalidad_pago?: string;
      modalidad?: string;
      factoring_id?: string | null;
    } = {
      estado: input.estado,
      modalidad_pago: estadoUpper,
      modalidad: estadoUpper,
      updated_at: new Date().toISOString(),
    };

    if (input.estado === "DEUDA_PROVEEDOR") {
      payload.factoring_id = null;
      payload.factoring_proveedor_id = null;
      payload.confirming_id = null;
      payload.numero_cheque = null;
      payload.fecha_vencimiento_cheque = null;
      payload.banco_emisor = null;
      payload.colaborador_id = null;
      payload.on_proyecto = null;
      payload.observacion_tc = null;
      if (existingLocal && existingLocal.estado === "COMPRA_TC") {
        payload.monto_saldo = existingLocal.monto_total;
        payload.deuda_proveedor = existingLocal.monto_total;
      }
    } else if (input.estado === "FACTORING") {
      payload.factoring_id = factoringIdSeleccionado;
      payload.factoring_proveedor_id = factoringIdSeleccionado;
      payload.confirming_id = null;
      payload.numero_cheque = null;
      payload.fecha_vencimiento_cheque = null;
      payload.banco_emisor = null;
      payload.colaborador_id = null;
      payload.on_proyecto = null;
      payload.observacion_tc = null;
    } else if (input.estado === "CONFIRMING") {
      payload.confirming_id = confirmingIdSeleccionado;
      payload.factoring_id = null;
      payload.factoring_proveedor_id = null;
      payload.numero_cheque = null;
      payload.fecha_vencimiento_cheque = null;
      payload.banco_emisor = null;
      payload.colaborador_id = null;
      payload.on_proyecto = null;
      payload.observacion_tc = null;
      if (input.nuevaFechaVencimiento) {
        payload.fecha_vencimiento = input.nuevaFechaVencimiento;
      }
    } else if (input.estado === "CHEQUE") {
      payload.numero_cheque = input.numeroCheque || null;
      payload.fecha_vencimiento_cheque = input.fechaVencimientoCheque || null;
      payload.banco_emisor = input.bancoEmisor || null;
      payload.factoring_id = null;
      payload.factoring_proveedor_id = null;
      payload.confirming_id = null;
      payload.colaborador_id = null;
      payload.on_proyecto = null;
      payload.observacion_tc = null;
    } else if (input.estado === "NETEO_NC") {
      payload.factoring_id = null;
      payload.factoring_proveedor_id = null;
      payload.confirming_id = null;
      payload.numero_cheque = null;
      payload.fecha_vencimiento_cheque = null;
      payload.banco_emisor = null;
      payload.colaborador_id = null;
      payload.on_proyecto = null;
      payload.observacion_tc = null;
    } else if (input.estado === "COMPRA_TC") {
      payload.factoring_id = null;
      payload.factoring_proveedor_id = null;
      payload.confirming_id = null;
      payload.numero_cheque = null;
      payload.fecha_vencimiento_cheque = null;
      payload.banco_emisor = null;
      payload.colaborador_id = input.colaboradorId || null;
      payload.pagado_por = auth.session?.nombre || auth.session?.usuario || "Sistema";
      payload.on_proyecto = input.onProyecto || null;
      payload.observacion_tc = input.observacionTc?.trim() || null;
      payload.monto_saldo = 0;
      payload.deuda_proveedor = 0;
    }

    let supaFacturaRow: Record<string, unknown> | null = null;

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data: existingSupa } = await supabase
        .from("facturas_compras")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();

      if (existingSupa) {
        supaFacturaRow = existingSupa as Record<string, unknown>;
      }

      if (input.estado === "FACTORING") {
        // Actualización estricta de FACTORING en Supabase
        const factoringObj: Record<string, unknown> = {
          estado: "FACTORING",
          modalidad: "FACTORING",
          modalidad_pago: "FACTORING",
          factoring_id: factoringIdSeleccionado,
          factoring_proveedor_id: factoringIdSeleccionado,
          updated_at: new Date().toISOString(),
        };

        let { error: errFact } = await supabase
          .from("facturas_compras")
          .update(factoringObj)
          .eq("id", input.id);

        if (errFact) {
          // Si factoring_id no existe como columna
          delete factoringObj.factoring_id;
          let { error: errFact2 } = await supabase
            .from("facturas_compras")
            .update(factoringObj)
            .eq("id", input.id);

          if (errFact2) {
            // Si factoring_proveedor_id no existe pero factoring_id sí
            delete factoringObj.factoring_proveedor_id;
            factoringObj.factoring_id = factoringIdSeleccionado;
            let { error: errFact3 } = await supabase
              .from("facturas_compras")
              .update(factoringObj)
              .eq("id", input.id);

            if (errFact3) {
              // Si modalidad o factoring_id fallan
              delete factoringObj.modalidad;
              delete factoringObj.factoring_id;
              const { error: errFactFinal } = await supabase
                .from("facturas_compras")
                .update(factoringObj)
                .eq("id", input.id);

              if (errFactFinal) throw new Error(errFactFinal.message);
            }
          }
        }
      } else if (input.estado === "CONFIRMING") {
        // Actualización estricta de CONFIRMING en Supabase
        const confirmingObj: Record<string, unknown> = {
          estado: "CONFIRMING",
          modalidad: "CONFIRMING",
          modalidad_pago: "CONFIRMING",
          confirming_id: confirmingIdSeleccionado,
          updated_at: new Date().toISOString(),
        };
        if (input.nuevaFechaVencimiento) {
          confirmingObj.fecha_vencimiento = input.nuevaFechaVencimiento;
        }

        let { error: errConf } = await supabase
          .from("facturas_compras")
          .update(confirmingObj)
          .eq("id", input.id);

        if (errConf) {
          delete confirmingObj.modalidad;
          let { error: errConf2 } = await supabase
            .from("facturas_compras")
            .update(confirmingObj)
            .eq("id", input.id);

          if (errConf2) {
            delete confirmingObj.modalidad_pago;
            const { error: errConfFinal } = await supabase
              .from("facturas_compras")
              .update(confirmingObj)
              .eq("id", input.id);

            if (errConfFinal) throw new Error(errConfFinal.message);
          }
        }
      } else {
        const { error } = await supabase
          .from("facturas_compras")
          .update(payload)
          .eq("id", input.id);

        if (error) {
          // Fallback si las columnas colaborador_id/on_proyecto/observacion_tc o modalidad aún no existen en Supabase
          const safePayload = { ...payload };
          delete safePayload.modalidad;
          delete safePayload.factoring_id;
          delete safePayload.colaborador_id;
          delete safePayload.on_proyecto;
          delete safePayload.observacion_tc;
          delete safePayload.deuda_proveedor;
          delete safePayload.pagado_por;
          let { error: err2 } = await supabase
            .from("facturas_compras")
            .update(safePayload)
            .eq("id", input.id);

          if (err2) {
            delete safePayload.modalidad_pago;
            const { error: err3 } = await supabase
              .from("facturas_compras")
              .update(safePayload)
              .eq("id", input.id);
            err2 = err3;
          }

          if (err2 && input.estado === "COMPRA_TC") {
            // Si la restricción CHECK de estado aún no permite COMPRA_TC en Supabase, asegurar monto_saldo = 0
            await supabase
              .from("facturas_compras")
              .update({ monto_saldo: 0, updated_at: new Date().toISOString() })
              .eq("id", input.id);
          }
        }
      }
    }

    // Actualizar local fallback y trazabilidad en Histórico de Pagos (buscando por id o por rut_proveedor + folio)
    let idx = db.facturas_compras.findIndex((x) => x.id === input.id);
    if (idx === -1 && supaFacturaRow) {
      const targetKey = `${normalizeRut(String(supaFacturaRow.rut_proveedor || ""))}_${Number(supaFacturaRow.folio || 0)}`;
      idx = db.facturas_compras.findIndex(
        (x) => `${normalizeRut(x.rut_proveedor)}_${x.folio}` === targetKey
      );
      if (idx === -1) {
        const newLocalEntry: FacturaCompra = {
          id: String(supaFacturaRow.id),
          nro: Number(supaFacturaRow.nro || 0),
          tipo_doc: Number(supaFacturaRow.tipo_doc || 33),
          tipo_compra: supaFacturaRow.tipo_compra ? String(supaFacturaRow.tipo_compra) : null,
          rut_proveedor: String(supaFacturaRow.rut_proveedor || ""),
          razon_social: String(supaFacturaRow.razon_social || ""),
          folio: Number(supaFacturaRow.folio || 0),
          fecha_docto: String(supaFacturaRow.fecha_docto || ""),
          fecha_vencimiento: String(supaFacturaRow.fecha_vencimiento || ""),
          condicion_pago: (supaFacturaRow.condicion_pago as CondicionPago) || "CREDITO",
          monto_total: Number(supaFacturaRow.monto_total || 0),
          monto_saldo: Number(supaFacturaRow.monto_saldo ?? supaFacturaRow.monto_total ?? 0),
          deuda_proveedor: Number(supaFacturaRow.deuda_proveedor ?? supaFacturaRow.monto_total ?? 0),
          estado: (supaFacturaRow.estado as EstadoFacturaCompra) || "DEUDA_PROVEEDOR",
          created_at: String(supaFacturaRow.created_at || new Date().toISOString()),
        };
        db.facturas_compras.unshift(newLocalEntry);
        idx = 0;
      }
    }

    if (idx !== -1) {
      db.facturas_compras[idx] = {
        ...db.facturas_compras[idx],
        ...payload,
        estado: input.estado,
        modalidad_pago: estadoUpper,
        modalidad: estadoUpper,
        factoring_id: factoringIdSeleccionado,
        factoring_proveedor_id: factoringIdSeleccionado,
        confirming_id: confirmingIdSeleccionado,
      };

      const fac = db.facturas_compras[idx];
      const pagoTcId = `pago-tc-${fac.id}`;

      if (input.estado === "COMPRA_TC") {
        const nombreUsuario =
          auth.session?.nombre || auth.session?.usuario || "Sistema";
        const usuarioId = auth.session?.id || null;
        const colab = db.mantenedor_colaboradores.find((c) => c.id === input.colaboradorId);
        const colabLabel = colab ? `${colab.nombre} (${colab.rut})` : `ID: ${input.colaboradorId}`;
        const obsParts = [`Compra TC — Colaborador: ${colabLabel}`];
        if (input.onProyecto) obsParts.push(`ON ${input.onProyecto}`);
        if (input.observacionTc?.trim()) obsParts.push(input.observacionTc.trim());

        (db.facturas_compras[idx] as unknown as Record<string, unknown>).pagado_por = nombreUsuario;

        const nuevoPagoTc: PagoCompraHistorico = {
          id: pagoTcId,
          factura_id: fac.id,
          folio: fac.folio,
          rut_proveedor: fac.rut_proveedor,
          razon_social: fac.razon_social,
          tipo_doc: fac.tipo_doc,
          monto_pagado: fac.monto_total,
          fecha_real_pago: new Date().toISOString().slice(0, 10),
          modalidad_pago: "COMPRA_TC",
          comprobante_ref: `TC-${fac.folio}`,
          observacion: obsParts.join(" · "),
          usuario_id: usuarioId,
          usuario_nombre: nombreUsuario,
          pagado_por: nombreUsuario,
          created_at: new Date().toISOString(),
        };

        const existingPagoIdx = db.pagos_compras.findIndex(
          (p) => p.id === pagoTcId || (p.modalidad_pago === "COMPRA_TC" && p.folio === fac.folio)
        );
        if (existingPagoIdx !== -1) {
          db.pagos_compras[existingPagoIdx] = nuevoPagoTc;
        } else {
          db.pagos_compras.unshift(nuevoPagoTc);
        }
      } else {
        // Si cambia de COMPRA_TC a otra modalidad, retirar registro de pago TC
        db.pagos_compras = db.pagos_compras.filter(
          (p) => p.id !== pagoTcId && !(p.modalidad_pago === "COMPRA_TC" && p.folio === fac.folio)
        );
      }

      writeLocalDb(db);
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    revalidatePath("/compras-tensacon/compromisos");
    revalidatePath("/compras-tensacon/historico-pagos");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error cambiando estado de compra";
    return { success: false, error: msg };
  }
}

/**
 * Realiza el Neteo (total o parcial) entre una Factura de Compra (DTE 33) y una Nota de Crédito (DTE 61)
 */
export async function netearFacturaCompraAction(input: {
  facturaId: string;
  notaCreditoId: string;
  montoManual?: number | null;
}): Promise<{
  success: boolean;
  error?: string;
  montoNeteado?: number;
  saldoRestanteFactura?: number;
}> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    if (!input.facturaId || !input.notaCreditoId) {
      return { success: false, error: "Factura y Nota de Crédito son requeridas." };
    }

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.neteos_compras) db.neteos_compras = [];

    // 1. Obtener Factura
    const factura = db.facturas_compras.find((f) => f.id === input.facturaId);
    if (!factura) {
      return { success: false, error: "La factura de compra indicada no fue encontrada." };
    }

    // 2. Obtener Nota de Crédito
    const notaCredito = db.facturas_compras.find((f) => f.id === input.notaCreditoId);
    if (!notaCredito) {
      return { success: false, error: "La Nota de Crédito indicada no fue encontrada." };
    }

    if (notaCredito.tipo_doc !== 61) {
      return { success: false, error: "El documento seleccionado no es una Nota de Crédito (DTE 61)." };
    }

    // 3. Validar coincidencia de RUT Proveedor
    if (normalizeRut(factura.rut_proveedor) !== normalizeRut(notaCredito.rut_proveedor)) {
      return {
        success: false,
        error: `El RUT del proveedor de la factura (${factura.rut_proveedor}) no coincide con el de la Nota de Crédito (${notaCredito.rut_proveedor}).`,
      };
    }

    // 4. Calcular saldo pendiente de la Factura
    const neteosFactura = db.neteos_compras.filter((n) => n.factura_id === factura.id);
    const yaNeteadoFactura = neteosFactura.reduce((acc, n) => acc + Number(n.monto_neteado), 0);
    const saldoFactura = Math.max(0, factura.monto_total - yaNeteadoFactura);

    if (saldoFactura <= 0) {
      return { success: false, error: "Esta factura ya no tiene saldo pendiente por pagar." };
    }

    // 5. Calcular saldo disponible de la Nota de Crédito
    const neteosNC = db.neteos_compras.filter((n) => n.nota_credito_id === notaCredito.id);
    const yaUsadoNC = neteosNC.reduce((acc, n) => acc + Number(n.monto_neteado), 0);
    const saldoNC = Math.max(0, notaCredito.monto_total - yaUsadoNC);

    if (saldoNC <= 0) {
      return { success: false, error: "Esta Nota de Crédito ya ha sido utilizada en su totalidad en otros neteos." };
    }

    // 6. Determinar monto a netear
    let montoANetear = Math.min(saldoFactura, saldoNC);
    if (input.montoManual && input.montoManual > 0) {
      montoANetear = Math.min(input.montoManual, montoANetear);
    }

    if (montoANetear <= 0) {
      return { success: false, error: "El monto a netear debe ser mayor a $0." };
    }

    const nuevoSaldoFactura = saldoFactura - montoANetear;

    // 7. Registrar vinculación en neteos_compras
    const newNeteo: NeteoCompra = {
      id: `net-compra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      factura_id: factura.id,
      nota_credito_id: notaCredito.id,
      monto_neteado: montoANetear,
      saldo_restante: nuevoSaldoFactura,
      factura_folio: factura.folio,
      nota_credito_folio: notaCredito.folio,
      rut_proveedor: factura.rut_proveedor,
      razon_social: factura.razon_social,
      created_at: new Date().toISOString(),
    };

    db.neteos_compras.unshift(newNeteo);

    // 8. Actualizar Factura
    factura.monto_saldo = nuevoSaldoFactura;
    factura.updated_at = new Date().toISOString();
    if (nuevoSaldoFactura === 0) {
      factura.estado = "NETEO_NC";
    }

    writeLocalDb(db);

    // 9. Si Supabase está disponible, persistir
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      await supabase.from("neteos_compras").insert({
        factura_id: factura.id,
        nota_credito_id: notaCredito.id,
        monto_neteado: montoANetear,
        saldo_restante: nuevoSaldoFactura,
      });

      await supabase
        .from("facturas_compras")
        .update({
          monto_saldo: nuevoSaldoFactura,
          estado: nuevoSaldoFactura === 0 ? "NETEO_NC" : factura.estado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", factura.id);
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    return {
      success: true,
      montoNeteado: montoANetear,
      saldoRestanteFactura: nuevoSaldoFactura,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al procesar el neteo de compra";
    return { success: false, error: msg };
  }
}

/**
 * Modifica manualmente la fecha de vencimiento de una factura de compras
 */
export async function editarFechaVencimientoCompraAction(
  id: string,
  nuevaFechaVencimiento: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    if (!nuevaFechaVencimiento) {
      return { success: false, error: "Fecha de vencimiento inválida." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("facturas_compras")
        .update({
          fecha_vencimiento: nuevaFechaVencimiento,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    const idx = db.facturas_compras.findIndex((x) => x.id === id);
    if (idx !== -1) {
      db.facturas_compras[idx].fecha_vencimiento = nuevaFechaVencimiento;
      db.facturas_compras[idx].updated_at = new Date().toISOString();
      writeLocalDb(db);
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error actualizando fecha de vencimiento";
    return { success: false, error: msg };
  }
}

export interface ChequeCompraInputItem {
  numeroCheque: string;
  bancoEmisor: string;
  fechaVencimiento: string;
  montoCheque: number;
  observacion?: string;
}

export interface RegistrarChequesCompraInput {
  facturaId: string;
  cheques: ChequeCompraInputItem[];
  folio?: number;
  rutProveedor?: string;
}

/**
 * Registra uno o múltiples cheques de pago para una factura de compras
 * Soporta pago total (la factura pasa a estado CHEQUE) o abono parcial (se descuenta saldo y permanece en su estado actual)
 */
export async function registrarChequesCompraAction(
  input: RegistrarChequesCompraInput
): Promise<{
  success: boolean;
  error?: string;
  nuevoSaldo?: number;
  totalChequesEmitidos?: number;
}> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    if (!input.facturaId) {
      return { success: false, error: "Identificador de factura no proporcionado." };
    }
    if (!input.cheques || input.cheques.length === 0) {
      return { success: false, error: "Debe ingresar al menos un cheque." };
    }

    // Validar datos de cada cheque
    for (let i = 0; i < input.cheques.length; i++) {
      const c = input.cheques[i];
      if (!c.numeroCheque?.trim()) {
        return { success: false, error: `El cheque #${i + 1} no tiene número ingresado.` };
      }
      if (!c.bancoEmisor?.trim()) {
        return { success: false, error: `El cheque #${i + 1} (${c.numeroCheque}) no tiene banco emisor.` };
      }
      if (!c.fechaVencimiento) {
        return { success: false, error: `El cheque #${i + 1} (${c.numeroCheque}) no tiene fecha de vencimiento.` };
      }
      if (!c.montoCheque || c.montoCheque <= 0) {
        return { success: false, error: `El cheque #${i + 1} (${c.numeroCheque}) debe tener un monto mayor a $0.` };
      }
    }

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.cheques_compras) db.cheques_compras = [];

    // 1. Localizar la factura: Primero en Supabase si está disponible, luego en LocalDB
    let factura: FacturaCompra | null = null;

    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: supaFac } = await supabase
          .from("facturas_compras")
          .select("*")
          .eq("id", input.facturaId)
          .maybeSingle();

        if (supaFac) {
          factura = supaFac as unknown as FacturaCompra;
        } else if (input.folio) {
          const { data: supaFacByFolio } = await supabase
            .from("facturas_compras")
            .select("*")
            .eq("folio", input.folio)
            .maybeSingle();

          if (supaFacByFolio) {
            factura = supaFacByFolio as unknown as FacturaCompra;
          }
        }
      } catch (err) {
        console.error("Error al buscar factura en Supabase:", err);
      }
    }

    if (!factura) {
      factura = db.facturas_compras.find((f) => f.id === input.facturaId) || null;
      if (!factura && input.folio) {
        factura = db.facturas_compras.find((f) => f.folio === input.folio) || null;
      }
    }

    if (!factura) {
      return { success: false, error: "La factura seleccionada no fue encontrada." };
    }

    const sumaCheques = input.cheques.reduce((sum, c) => sum + Number(c.montoCheque || 0), 0);
    const saldoActual = Number(
      factura.monto_saldo !== undefined && factura.monto_saldo !== null
        ? factura.monto_saldo
        : factura.monto_total
    );

    if (sumaCheques > saldoActual) {
      return {
        success: false,
        error: `La suma de los cheques ($${sumaCheques.toLocaleString("es-CL")}) excede el saldo pendiente de la factura ($${saldoActual.toLocaleString("es-CL")}).`,
      };
    }

    // CICLO DE VIDA DE CHEQUE: Al emitir el cheque, el saldo se mantiene ACTIVO (compromiso vigente).
    // NO se reduce a cero ni se inserta en pagos hasta que el cheque sea efectivamente cobrado/pagado.
    const saldoActivo = saldoActual > 0 ? saldoActual : Number(factura.monto_total || 0);

    // Crear entidades ChequeCompra
    const nuevosCheques: ChequeCompra[] = input.cheques.map((c, idx) => ({
      id: `chk-compra-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      factura_id: factura!.id,
      numero_cheque: c.numeroCheque.trim(),
      banco_emisor: c.bancoEmisor.trim(),
      fecha_vencimiento: c.fechaVencimiento,
      monto_cheque: Number(c.montoCheque),
      estado: "EMITIDO",
      observacion: c.observacion?.trim() || null,
      created_at: new Date().toISOString(),
    }));

    // Actualizar localDb
    let localIdx = db.facturas_compras.findIndex((f) => f.id === factura!.id);
    if (localIdx === -1) {
      db.facturas_compras.unshift({ ...factura! });
      localIdx = 0;
    }

    db.cheques_compras.push(...nuevosCheques);

    const refNumCheque =
      input.cheques.length === 1
        ? input.cheques[0].numeroCheque.trim()
        : input.cheques.map((c) => c.numeroCheque.trim()).join(", ");
    const refBanco = input.cheques[0].bancoEmisor.trim();
    const refFechaVcto = input.cheques[0].fechaVencimiento;

    db.facturas_compras[localIdx].monto_saldo = saldoActivo;
    db.facturas_compras[localIdx].deuda_proveedor = saldoActivo;
    db.facturas_compras[localIdx].estado = "CHEQUE";
    (db.facturas_compras[localIdx] as unknown as Record<string, unknown>).modalidad_pago = "CHEQUE";
    (db.facturas_compras[localIdx] as unknown as Record<string, unknown>).modalidad = "CHEQUE";
    db.facturas_compras[localIdx].numero_cheque = refNumCheque;
    db.facturas_compras[localIdx].banco_emisor = refBanco;
    db.facturas_compras[localIdx].fecha_vencimiento_cheque = refFechaVcto;
    db.facturas_compras[localIdx].updated_at = new Date().toISOString();

    writeLocalDb(db);

    // Persistir en Supabase si está disponible
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      try {
        await supabase.from("cheques_compras").insert(
          nuevosCheques.map((c) => ({
            id: c.id,
            factura_id: c.factura_id,
            numero_cheque: c.numero_cheque,
            banco_emisor: c.banco_emisor,
            fecha_vencimiento: c.fecha_vencimiento,
            monto_cheque: c.monto_cheque,
            estado: c.estado,
            observacion: c.observacion,
            created_at: c.created_at,
          }))
        );
      } catch (errChk) {
        console.warn("Advertencia al registrar en cheques_compras:", errChk);
      }

      const updateData: Record<string, unknown> = {
        monto_saldo: saldoActivo,
        saldo_pendiente: saldoActivo,
        deuda_proveedor: saldoActivo,
        estado: "CHEQUE",
        modalidad_pago: "CHEQUE",
        modalidad: "CHEQUE",
        numero_cheque: refNumCheque,
        banco_emisor: refBanco,
        fecha_vencimiento_cheque: refFechaVcto,
        updated_at: new Date().toISOString(),
      };

      const { error: supaUpdErr } = await supabase
        .from("facturas_compras")
        .update(updateData)
        .eq("id", factura.id);

      if (supaUpdErr) {
        // Fallback sin columnas optativas
        delete updateData.modalidad;
        delete updateData.saldo_pendiente;
        delete updateData.deuda_proveedor;
        await supabase
          .from("facturas_compras")
          .update(updateData)
          .eq("id", factura.id);
      }
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    revalidatePath("/compras-tensacon/compromisos");
    revalidatePath("/compras-tensacon/historico-pagos");

    return {
      success: true,
      nuevoSaldo: saldoActivo,
      totalChequesEmitidos: sumaCheques,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Error inesperado al emitir cheques para la factura.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/** Alias para compatibilidad con llamadas de emisión de cheques */
export const emitirChequeCompraAction = registrarChequesCompraAction;

/**
 * Elimina un cheque emitido y restaura el saldo correspondiente en la factura
 */
export async function eliminarChequeCompraAction(
  chequeId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const db = readLocalDb();
    if (!db.cheques_compras) db.cheques_compras = [];
    const idx = db.cheques_compras.findIndex((c) => c.id === chequeId);
    if (idx === -1) {
      return { success: false, error: "Cheque no encontrado." };
    }

    const cheque = db.cheques_compras[idx];
    const factura = db.facturas_compras?.find((f) => f.id === cheque.factura_id);

    db.cheques_compras.splice(idx, 1);

    if (factura) {
      const remainingCheques = db.cheques_compras.filter((c) => c.factura_id === factura.id);
      const remainingNeteos = (db.neteos_compras || []).filter((n) => n.factura_id === factura.id);
      const totalNeteado = remainingNeteos.reduce((s, n) => s + Number(n.monto_neteado || 0), 0);
      const totalCheques = remainingCheques.reduce((s, c) => s + Number(c.monto_cheque || 0), 0);
      const restoredSaldo = Math.max(0, factura.monto_total - totalNeteado - totalCheques);
      factura.monto_saldo = restoredSaldo;
      if (restoredSaldo > 0 && factura.estado === "CHEQUE") {
        factura.estado = "DEUDA_PROVEEDOR";
      }
      if (remainingCheques.length > 0) {
        factura.numero_cheque = remainingCheques.map((c) => c.numero_cheque).join(", ");
        factura.banco_emisor = remainingCheques[0].banco_emisor;
        factura.fecha_vencimiento_cheque = remainingCheques[0].fecha_vencimiento;
      } else {
        factura.numero_cheque = null;
        factura.banco_emisor = null;
        factura.fecha_vencimiento_cheque = null;
      }
      factura.updated_at = new Date().toISOString();
    }

    writeLocalDb(db);

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      await supabase.from("cheques_compras").delete().eq("id", chequeId);
      if (factura) {
        await supabase
          .from("facturas_compras")
          .update({
            monto_saldo: factura.monto_saldo,
            estado: factura.estado,
            numero_cheque: factura.numero_cheque,
            banco_emisor: factura.banco_emisor,
            fecha_vencimiento_cheque: factura.fecha_vencimiento_cheque,
            updated_at: new Date().toISOString(),
          })
          .eq("id", factura.id);
      }
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al eliminar el cheque";
    return { success: false, error: msg };
  }
}

export interface ProrrogarChequeCompraParams {
  facturaId: string;
  chequeId?: string | null;
  nuevaFechaVencimiento: string; // YYYY-MM-DD
  observacion?: string | null;
}

/**
 * Prorroga o modifica la fecha de vencimiento/cobro de un cheque emitido
 * Actualiza cheques_compras y facturas_compras (fecha_vencimiento_cheque y fecha_vencimiento)
 */
export async function prorrogarChequeCompraAction(
  params: ProrrogarChequeCompraParams
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const { facturaId, chequeId, nuevaFechaVencimiento, observacion } = params;
    if (!facturaId) throw new Error("El ID de la factura es obligatorio.");
    if (!nuevaFechaVencimiento) throw new Error("La nueva fecha de vencimiento es obligatoria.");

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.cheques_compras) db.cheques_compras = [];

    const nowIso = new Date().toISOString();

    // 1. Actualizar cheques en Local DB
    let chequesActualizados = 0;
    db.cheques_compras.forEach((c) => {
      if ((chequeId ? c.id === chequeId : c.factura_id === facturaId) && c.estado !== "COBRADO") {
        c.fecha_vencimiento = nuevaFechaVencimiento;
        if (observacion?.trim()) {
          c.observacion = c.observacion
            ? `${c.observacion} · Prórroga: ${observacion.trim()}`
            : `Prórroga: ${observacion.trim()}`;
        }
        c.updated_at = nowIso;
        chequesActualizados++;
      }
    });

    // 2. Actualizar factura en Local DB
    const fIdx = db.facturas_compras.findIndex((f) => f.id === facturaId);
    if (fIdx !== -1) {
      db.facturas_compras[fIdx].fecha_vencimiento_cheque = nuevaFechaVencimiento;
      db.facturas_compras[fIdx].fecha_vencimiento = nuevaFechaVencimiento;
      db.facturas_compras[fIdx].updated_at = nowIso;
    }

    writeLocalDb(db);

    // 3. Persistir en Supabase si está disponible
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      try {
        if (chequeId) {
          await supabase
            .from("cheques_compras")
            .update({
              fecha_vencimiento: nuevaFechaVencimiento,
              updated_at: nowIso,
            })
            .eq("id", chequeId);
        } else {
          await supabase
            .from("cheques_compras")
            .update({
              fecha_vencimiento: nuevaFechaVencimiento,
              updated_at: nowIso,
            })
            .eq("factura_id", facturaId)
            .neq("estado", "COBRADO");
        }

        await supabase
          .from("facturas_compras")
          .update({
            fecha_vencimiento_cheque: nuevaFechaVencimiento,
            fecha_vencimiento: nuevaFechaVencimiento,
            updated_at: nowIso,
          })
          .eq("id", facturaId);
      } catch (errSupa) {
        console.warn("Advertencia al prorrogar cheque en Supabase:", errSupa);
      }
    }

    revalidatePath("/compras-tensacon/facturas-compras");
    revalidatePath("/compras-tensacon/compromisos");
    revalidatePath("/compras-tensacon/historico-pagos");

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al prorrogar el cheque";
    return { success: false, error: msg };
  }
}

export interface RegistrarPagoFacturaCompraParams {
  facturaId: string;
  montoPago: number;
  fechaPago: string; // YYYY-MM-DD
  modalidadPago: ModalidadPagoCompra;
  bancoCuenta?: string | null;
  numeroComprobante?: string | null;
  observacion?: string | null;
}

export async function registrarPagoFacturaCompraAction(
  params: RegistrarPagoFacturaCompraParams
): Promise<{
  success: boolean;
  nuevoSaldo?: number;
  estaSaldada?: boolean;
  error?: string;
}> {
  const auth = await assertCanManage(["facturas_compras", "compras_global"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const {
      facturaId,
      montoPago,
      fechaPago,
      modalidadPago,
      bancoCuenta,
      numeroComprobante,
      observacion,
    } = params;

    if (!facturaId) {
      throw new Error("El ID de la factura es obligatorio.");
    }

    if (!montoPago || montoPago <= 0) {
      throw new Error("El monto a pagar debe ser mayor a 0.");
    }

    if (!fechaPago) {
      throw new Error("La fecha de pago es obligatoria.");
    }

    const db = readLocalDb();
    if (!db.facturas_compras) db.facturas_compras = [];
    if (!db.pagos_compras) db.pagos_compras = [];

    // 1. Localizar la factura en Local DB
    const facturaIdx = db.facturas_compras.findIndex((f) => f.id === facturaId);
    let targetFactura: FacturaCompra | null = facturaIdx !== -1 ? db.facturas_compras[facturaIdx] : null;

    let saldoActual = targetFactura
      ? Number(targetFactura.monto_saldo !== undefined && targetFactura.monto_saldo !== null ? targetFactura.monto_saldo : targetFactura.monto_total)
      : 0;

    // Si no está en Local DB o si Supabase está activo, consultar Supabase
    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: supaFac, error: supaErr } = await supabase
          .from("facturas_compras")
          .select("*")
          .eq("id", facturaId)
          .single();

        if (!supaErr && supaFac) {
          if (!targetFactura) {
            targetFactura = {
              id: String(supaFac.id),
              nro: Number(supaFac.nro || 0),
              tipo_doc: Number(supaFac.tipo_doc || 33),
              tipo_compra: supaFac.tipo_compra ? String(supaFac.tipo_compra) : null,
              rut_proveedor: String(supaFac.rut_proveedor || ""),
              razon_social: String(supaFac.razon_social || ""),
              folio: Number(supaFac.folio || 0),
              fecha_docto: String(supaFac.fecha_docto || ""),
              fecha_vencimiento: String(supaFac.fecha_vencimiento || ""),
              monto_total: Number(supaFac.monto_total || 0),
              monto_saldo: supaFac.monto_saldo !== undefined && supaFac.monto_saldo !== null ? Number(supaFac.monto_saldo) : Number(supaFac.monto_total || 0),
              deuda_proveedor: Number(supaFac.deuda_proveedor ?? supaFac.monto_saldo ?? supaFac.monto_total),
              estado: (supaFac.estado as EstadoFacturaCompra) || "DEUDA_PROVEEDOR",
              created_at: String(supaFac.created_at || new Date().toISOString()),
            };
          }
          saldoActual = Number(
            supaFac.monto_saldo !== undefined && supaFac.monto_saldo !== null
              ? supaFac.monto_saldo
              : supaFac.monto_total
          );
        }
      } catch (err) {
        console.error("Error al consultar factura en Supabase:", err);
      }
    }

    if (!targetFactura) {
      throw new Error("Factura de compra no encontrada.");
    }

    const nuevoSaldo = Math.max(0, Math.round(saldoActual - montoPago));
    const estaSaldada = nuevoSaldo === 0;
    const nowIso = new Date().toISOString();
    const nombreUsuario =
      auth.session?.nombre || auth.session?.usuario || "Sistema";
    const usuarioId = auth.session?.id || null;

    // Glosa compuesta de observación
    const compParts = [
      bancoCuenta ? `Cuenta: ${bancoCuenta}` : null,
      observacion?.trim() || null,
    ].filter(Boolean);
    const glosaFinal = compParts.length > 0 ? compParts.join(" · ") : null;

    // 2. Registrar el nuevo pago en pagos_compras (Histórico Pagos)
    const nuevoPago: PagoCompraHistorico = {
      id: `pago-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      factura_id: targetFactura.id,
      rut_proveedor: targetFactura.rut_proveedor,
      razon_social: targetFactura.razon_social,
      folio: targetFactura.folio,
      tipo_doc: targetFactura.tipo_doc,
      modalidad_pago: modalidadPago,
      monto_pagado: montoPago,
      fecha_real_pago: fechaPago,
      observacion: glosaFinal,
      comprobante_ref: numeroComprobante?.trim() || `PAGO-${targetFactura.folio}`,
      usuario_id: usuarioId,
      usuario_nombre: nombreUsuario,
      pagado_por: nombreUsuario,
      created_at: nowIso,
    };

    db.pagos_compras.unshift(nuevoPago);

    // 2.1 Si la factura o el pago es de modalidad CHEQUE, marcar los cheques como COBRADO
    const esChequePago =
      modalidadPago === "CHEQUE" ||
      targetFactura.estado === "CHEQUE" ||
      (targetFactura as unknown as Record<string, unknown>).modalidad_pago === "CHEQUE";

    if (esChequePago && db.cheques_compras) {
      db.cheques_compras.forEach((c) => {
        if (c.factura_id === targetFactura.id && c.estado !== "COBRADO") {
          c.estado = "COBRADO";
          c.updated_at = nowIso;
        }
      });
    }

    // 3. Actualizar la factura en Local DB
    if (facturaIdx !== -1) {
      db.facturas_compras[facturaIdx].monto_saldo = nuevoSaldo;
      db.facturas_compras[facturaIdx].deuda_proveedor = estaSaldada ? 0 : nuevoSaldo;
      if (estaSaldada) {
        db.facturas_compras[facturaIdx].estado = "PAGADA";
        (db.facturas_compras[facturaIdx] as unknown as Record<string, unknown>).modalidad = "PAGADA";
        (db.facturas_compras[facturaIdx] as unknown as Record<string, unknown>).modalidad_pago = "PAGADA";
      }
      db.facturas_compras[facturaIdx].updated_at = nowIso;
    } else {
      targetFactura.monto_saldo = nuevoSaldo;
      targetFactura.deuda_proveedor = estaSaldada ? 0 : nuevoSaldo;
      if (estaSaldada) {
        targetFactura.estado = "PAGADA";
        (targetFactura as unknown as Record<string, unknown>).modalidad = "PAGADA";
        (targetFactura as unknown as Record<string, unknown>).modalidad_pago = "PAGADA";
      }
      targetFactura.updated_at = nowIso;
      db.facturas_compras.push(targetFactura);
    }
    writeLocalDb(db);

    // 4. Actualizar en Supabase si está configurado
    if (isServerSupabaseConfigured() && !targetFactura.id.startsWith("fc-local-")) {
      try {
        const supabase = await createServerSupabaseClient();

        // 4.0 Actualizar cheques a COBRADO en Supabase si corresponde
        if (esChequePago) {
          try {
            await supabase
              .from("cheques_compras")
              .update({ estado: "COBRADO", updated_at: nowIso })
              .eq("factura_id", targetFactura.id);
          } catch (chkErr) {
            console.warn("Advertencia al marcar cheque como COBRADO en Supabase:", chkErr);
          }
        }

        // 4.1 Insertar pago en tabla pagos_facturas_compras o pagos_compras
        const pagoPayloadBase = {
          id: nuevoPago.id,
          factura_id: targetFactura.id,
          rut_proveedor: targetFactura.rut_proveedor,
          razon_social: targetFactura.razon_social,
          folio: targetFactura.folio,
          tipo_doc: targetFactura.tipo_doc,
          modalidad_pago: modalidadPago,
          monto_pagado: montoPago,
          fecha_real_pago: fechaPago,
          observacion: glosaFinal,
          comprobante_ref: numeroComprobante?.trim() || `PAGO-${targetFactura.folio}`,
          created_at: nowIso,
        };
        const pagoPayloadConUsuario = {
          ...pagoPayloadBase,
          usuario_id: usuarioId,
          usuario_nombre: nombreUsuario,
        };

        let { error: errPagosFac } = await supabase
          .from("pagos_facturas_compras")
          .insert(pagoPayloadConUsuario);

        if (errPagosFac) {
          const retryBase = await supabase
            .from("pagos_facturas_compras")
            .insert(pagoPayloadBase);
          errPagosFac = retryBase.error;
        }

        if (errPagosFac) {
          // Intentar en pagos_compras si pagos_facturas_compras no existe o arrojó error
          const { error: errPagosCompras } = await supabase
            .from("pagos_compras")
            .insert(pagoPayloadConUsuario);
          if (errPagosCompras) {
            await supabase.from("pagos_compras").insert(pagoPayloadBase);
          }
        }

        // 4.2 Actualizar factura en Supabase (sincronizando monto_saldo, saldo_pendiente, estado, modalidad_pago y pagado_por)
        const updateFacturaPayload: Record<string, unknown> = {
          monto_saldo: nuevoSaldo,
          saldo_pendiente: nuevoSaldo,
          deuda_proveedor: estaSaldada ? 0 : nuevoSaldo,
          estado: estaSaldada ? "PAGADA" : targetFactura.estado,
          modalidad_pago: estaSaldada ? "PAGADA" : (targetFactura as unknown as Record<string, unknown>).modalidad_pago || targetFactura.estado,
          modalidad: estaSaldada ? "PAGADA" : (targetFactura as unknown as Record<string, unknown>).modalidad || targetFactura.estado,
          pagado_por: nombreUsuario,
          updated_at: nowIso,
        };

        const { error: updateErr } = await supabase
          .from("facturas_compras")
          .update(updateFacturaPayload)
          .eq("id", targetFactura.id);

        if (updateErr) {
          // Fallback con columnas estándar mínimas
          await supabase
            .from("facturas_compras")
            .update({
              monto_saldo: nuevoSaldo,
              estado: estaSaldada ? "PAGADA" : targetFactura.estado,
              updated_at: nowIso,
            })
            .eq("id", targetFactura.id);
        }
      } catch (supaErr) {
        console.error("Error al actualizar pago en Supabase:", supaErr);
      }
    }

    // 5. Revalidar rutas para refrescar inmediatamente
    revalidatePath("/compras-tensacon/facturas-compras");
    revalidatePath("/compras-tensacon/compromisos");
    revalidatePath("/compras-tensacon/historico-pagos");
    revalidatePath("/compras-tensacon/compromisos");
    revalidatePath("/compras-tensacon/deuda-proveedores");

    return {
      success: true,
      nuevoSaldo,
      estaSaldada,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Error inesperado al registrar el pago de la factura.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}


