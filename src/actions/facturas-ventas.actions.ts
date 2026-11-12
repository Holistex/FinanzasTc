"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  ActualizacionVencimientoResult,
  FacturasVentasFilterParams,
  FacturaVenta,
  GestionPagoTipo,
  PagoFactura,
  PaginatedFacturasResponse,
  SiiCsvValidationSummary,
} from "@/types/database.types";
import {
  EXCLUDED_DTE_TYPES,
  parseAndValidateSiiCsv,
} from "@/services/sii-csv-parser";
import { normalizeRut } from "@/lib/utils";
import { assertIsAdmin, getServerUserSession } from "@/lib/auth/session";
import {
  queryFacturasVentasServer,
  resolveDeudaCliente,
} from "@/lib/data/facturas-ventas.server";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

function parseDateToIso(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    try {
      const p = XLSX.SSF.parse_date_code(val);
      if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    } catch {}
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/**
 * Obtiene el listado paginado de Facturas de Ventas separando entre:
 * - Pestaña 1: PENDIENTES (Facturas con deuda saldo > 0)
 * - Pestaña 2: PAGADAS (Facturas saldadas a $0 con pagos reales en `pagos_facturas`)
 * - Pestaña 3: FAC_NC (Notas de Crédito DTE 61 y Facturas DTE 33 neteadas a $0 por NC sin flujo de caja)
 */
export async function getFacturasVentasAction(
  params: FacturasVentasFilterParams = {}
): Promise<PaginatedFacturasResponse> {
  return queryFacturasVentasServer(params);
}

/**
 * Registra un pago o abono sobre una factura, descontando su deuda_cliente (y monto_neto_saldo).
 * Cuando la deuda llega a $0 mediante pago real, la factura pasa a la pestaña "Facturas Pagadas".
 */
export async function registrarPagoFacturaAction(params: {
  facturaId: string;
  montoPago: number;
  fechaPago: string;
  observacion?: string | null;
}): Promise<{
  success: boolean;
  nuevaDeuda: number;
  pagadaCompletamente: boolean;
}> {
  const monto = Math.round(Number(params.montoPago) || 0);
  if (monto <= 0) {
    throw new Error("El monto del pago debe ser mayor a $ 0.");
  }
  if (!params.fechaPago) {
    throw new Error("La fecha de pago real es obligatoria.");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();

    // 1. Obtener la factura actual
    const { data: factura, error: fetchErr } = await supabase
      .from("facturas_ventas")
      .select("*")
      .eq("id", params.facturaId)
      .single();

    if (fetchErr || !factura) {
      throw new Error("No se encontró la factura seleccionada.");
    }

    const deudaActual = resolveDeudaCliente(factura as FacturaVenta);
    if (monto > deudaActual) {
      throw new Error(
        `El monto ingresado supera la deuda actual pendiente ($ ${deudaActual.toLocaleString(
          "es-CL"
        )}).`
      );
    }

    const nuevaDeuda = Math.max(0, deudaActual - monto);
    const comentarioLimpio = params.observacion?.trim() || null;

    // 2. Intentar insertar en la tabla pagos_facturas en Supabase (soportando monto_pagado/comentario o monto_pago/observacion)
    const { error: insertPagoErr } = await supabase
      .from("pagos_facturas")
      .insert({
        factura_id: params.facturaId,
        monto_pagado: monto,
        fecha_pago: params.fechaPago,
        comentario: comentarioLimpio,
      });

    if (insertPagoErr) {
      const { error: altInsertErr } = await supabase
        .from("pagos_facturas")
        .insert({
          factura_id: params.facturaId,
          monto_pago: monto,
          fecha_pago: params.fechaPago,
          observacion: comentarioLimpio,
        });

      // Respaldo en store local si la tabla pagos_facturas aún no fue creada en Supabase SQL Editor
      if (altInsertErr) {
        const localDb = readLocalDb();
        localDb.pagos_facturas.unshift({
          id: `pago-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          factura_id: params.facturaId,
          monto_pago: monto,
          fecha_pago: params.fechaPago,
          observacion: comentarioLimpio,
          created_at: new Date().toISOString(),
        });
        writeLocalDb(localDb);
      }
    }

    // 3. Actualizar deuda_cliente y monto_neto_saldo en facturas_ventas
    const { error: updateWithDeudaErr } = await supabase
      .from("facturas_ventas")
      .update({
        deuda_cliente: nuevaDeuda,
        monto_neto_saldo: nuevaDeuda,
      })
      .eq("id", params.facturaId);

    if (updateWithDeudaErr) {
      // Fallback si la columna deuda_cliente aún no ha sido agregada en Supabase SQL Editor
      const { error: fallbackErr } = await supabase
        .from("facturas_ventas")
        .update({
          monto_neto_saldo: nuevaDeuda,
        })
        .eq("id", params.facturaId);

      if (fallbackErr) {
        throw new Error(
          `Error actualizando deuda de factura: ${fallbackErr.message}`
        );
      }
    }

    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/finanzas/facturas-ventas/factoring-clientes");
    return {
      success: true,
      nuevaDeuda,
      pagadaCompletamente: nuevaDeuda === 0,
    };
  }

  // Fallback Local
  const db = readLocalDb();
  const idx = db.facturas_ventas.findIndex((f) => f.id === params.facturaId);
  if (idx === -1) {
    throw new Error("Factura no encontrada.");
  }

  const deudaActual = resolveDeudaCliente(db.facturas_ventas[idx]);
  if (monto > deudaActual) {
    throw new Error("El monto del pago supera la deuda actual pendiente.");
  }

  const nuevaDeuda = Math.max(0, deudaActual - monto);
  db.facturas_ventas[idx].deuda_cliente = nuevaDeuda;
  db.facturas_ventas[idx].monto_neto_saldo = nuevaDeuda;

  db.pagos_facturas.unshift({
    id: `pago-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    factura_id: params.facturaId,
    monto_pago: monto,
    fecha_pago: params.fechaPago,
    observacion: params.observacion?.trim() || null,
    created_at: new Date().toISOString(),
  });

  writeLocalDb(db);
  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/finanzas/facturas-ventas/factoring-clientes");

  return {
    success: true,
    nuevaDeuda,
    pagadaCompletamente: nuevaDeuda === 0,
  };
}

/**
 * Obtiene todas las facturas cedidas a Factoring con deuda vigente
 * para construir el Submódulo de Factoring Clientes.
 */
export async function getFacturasFactoringClientesAction(): Promise<
  FacturaVenta[]
> {
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("facturas_ventas")
      .select("*, empresa_factoring_cliente(*)")
      .neq("tipo_doc", 46)
      .neq("tipo_doc", 61)
      .or("gestion_pago.eq.FACTORING,factoring_cliente_id.not.is.null")
      .order("fecha_docto", { ascending: false })
      .order("folio", { ascending: false });

    if (error) {
      throw new Error(
        `Error consultando facturas en factoring: ${error.message}`
      );
    }
    return ((data as FacturaVenta[]) || []).map((f) => {
      const deuda = resolveDeudaCliente(f);
      return {
        ...f,
        deuda_cliente: deuda,
        monto_neto_saldo: deuda,
      };
    });
  }

  const db = readLocalDb();
  const clientesMap = new Map(
    db.empresa_factoring_cliente.map((c) => [c.id, c])
  );

  return db.facturas_ventas
    .filter(
      (f) =>
        !EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc)) &&
        f.tipo_doc !== 61 &&
        (f.gestion_pago === "FACTORING" || f.factoring_cliente_id !== null)
    )
    .map((f) => {
      const deuda = resolveDeudaCliente(f);
      return {
        ...f,
        deuda_cliente: deuda,
        monto_neto_saldo: deuda,
        empresa_factoring_cliente: f.factoring_cliente_id
          ? clientesMap.get(f.factoring_cliente_id) || null
          : null,
      };
    })
    .sort((a, b) => {
      if (a.fecha_docto !== b.fecha_docto) {
        return b.fecha_docto.localeCompare(a.fecha_docto);
      }
      return b.folio - a.folio;
    });
}

function calculateKpis(rows: FacturaVenta[]) {
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
 * Paso 1 Importación SII: Valida el archivo CSV contra los registros actuales de la BD
 * descartando automáticamente registros DTE 46.
 */
export async function previewSiiCsvAction(
  csvText: string
): Promise<SiiCsvValidationSummary> {
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: existing, error } = await supabase
      .from("facturas_ventas")
      .select("rut_cliente, folio, monto_total, monto_neto_saldo, tipo_doc")
      .neq("tipo_doc", 46);

    if (error) {
      throw new Error(`Error leyendo llaves existentes: ${error.message}`);
    }

    return parseAndValidateSiiCsv(csvText, existing || []);
  }

  const db = readLocalDb();
  return parseAndValidateSiiCsv(csvText, db.facturas_ventas);
}

/**
 * Paso 2 Importación SII: Inyecta masivamente los registros nuevos validados (sin DTE 46)
 * y ejecuta la actualización de saldos por Notas de Crédito (Tipo 61).
 */
export async function injectSiiCsvBatchAction(csvText: string): Promise<{
  insertedCount: number;
  omittedCount: number;
  creditNotesApplied: number;
}> {
  const auth = await assertIsAdmin();
  if (auth.error) {
    throw new Error(auth.error || "Acceso denegado: Solo el perfil ADMINISTRADOR puede importar archivos CSV.");
  }

  const summary = await previewSiiCsvAction(csvText);

  // 1. Consulta previa y exhaustiva de llaves existentes (RUT + Folio) en la BD
  let existingKeys = new Set<string>();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: existingRows } = await supabase
      .from("facturas_ventas")
      .select("rut_cliente, folio");

    if (existingRows) {
      for (const r of existingRows as Array<{ rut_cliente: string; folio: number }>) {
        existingKeys.add(`${normalizeRut(r.rut_cliente)}__${r.folio}`);
      }
    }
  } else {
    const db = readLocalDb();
    for (const f of db.facturas_ventas || []) {
      existingKeys.add(`${normalizeRut(f.rut_cliente)}__${f.folio}`);
    }
  }

  // 2. Filtrado en memoria: omitir de forma estricta registros existentes o duplicados en el lote
  const seenBatchKeys = new Set<string>();
  const finalNewRows: typeof summary.nuevosAInyectar = [];
  let totalOmitted = summary.omitidosPorDuplicidad.length;

  for (const row of summary.nuevosAInyectar) {
    if (EXCLUDED_DTE_TYPES.has(Number(row.tipo_doc))) {
      continue;
    }

    const compositeKey = `${normalizeRut(row.rut_cliente)}__${row.folio}`;
    if (existingKeys.has(compositeKey) || seenBatchKeys.has(compositeKey)) {
      totalOmitted++;
      continue;
    }

    seenBatchKeys.add(compositeKey);
    finalNewRows.push(row);
  }

  if (finalNewRows.length === 0) {
    return {
      insertedCount: 0,
      omittedCount: totalOmitted,
      creditNotesApplied: 0,
    };
  }

  // 3. Inserción con ON CONFLICT DO NOTHING (ignoreDuplicates: true)
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();

    await supabase.from("facturas_ventas").delete().eq("tipo_doc", 46);

    const sortedRows = [...finalNewRows].sort((a, b) => {
      if (a.tipo_doc === 61 && b.tipo_doc !== 61) return 1;
      if (a.tipo_doc !== 61 && b.tipo_doc === 61) return -1;
      return 0;
    });

    const payload = sortedRows.map((row) => ({
      rut_cliente: row.rut_cliente,
      folio: row.folio,
      razon_social: row.razon_social,
      tipo_doc: row.tipo_doc,
      fecha_docto: row.fecha_docto,
      monto_total: row.monto_total,
      tipo_docto_ref: row.tipo_docto_ref,
      folio_docto_ref: row.folio_docto_ref,
      gestion_pago: "DIRECTO_CLIENTE" as GestionPagoTipo,
      factoring_cliente_id: null,
      monto_neto_saldo: row.monto_neto_saldo,
    }));

    const { error } = await supabase.from("facturas_ventas").upsert(payload, {
      onConflict: "rut_cliente,folio",
      ignoreDuplicates: true,
    });

    if (error) {
      console.warn("Error en upsert Supabase facturas_ventas:", error.message);
    }

    for (const neteo of summary.neteoNotasCredito) {
      if (
        neteo.origen_ubicacion === "EN_BASE_DE_DATOS" &&
        neteo.nuevo_saldo_neto !== null
      ) {
        await supabase
          .from("facturas_ventas")
          .update({ monto_neto_saldo: neteo.nuevo_saldo_neto })
          .eq("rut_cliente", neteo.rut_cliente)
          .eq("folio", neteo.factura_origen_folio);
      }
    }

    revalidatePath("/finanzas/facturas-ventas");
    return {
      insertedCount: finalNewRows.length,
      omittedCount: totalOmitted,
      creditNotesApplied: summary.neteoNotasCredito.filter(
        (n) => n.origen_ubicacion !== "SIN_FACTURA_ORIGEN"
      ).length,
    };
  }

  // Fallback Local Persistente con deduplicación estricta
  const db = readLocalDb();
  const nowIso = new Date().toISOString();

  if (!db.facturas_ventas) db.facturas_ventas = [];
  db.facturas_ventas = db.facturas_ventas.filter(
    (f) => !EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc))
  );

  for (const neteo of summary.neteoNotasCredito) {
    if (
      neteo.origen_ubicacion === "EN_BASE_DE_DATOS" &&
      neteo.nuevo_saldo_neto !== null
    ) {
      const targetIndex = db.facturas_ventas.findIndex(
        (f) =>
          normalizeRut(f.rut_cliente) === neteo.rut_cliente &&
          Number(f.folio) === Number(neteo.factura_origen_folio) &&
          f.tipo_doc !== 61
      );
      if (targetIndex !== -1) {
        db.facturas_ventas[targetIndex].monto_neto_saldo =
          neteo.nuevo_saldo_neto;
        db.facturas_ventas[targetIndex].deuda_cliente = neteo.nuevo_saldo_neto;
      }
    }
  }

  const localExistingKeys = new Set(
    db.facturas_ventas.map((f) => `${normalizeRut(f.rut_cliente)}__${f.folio}`)
  );

  const trulyNewRows = finalNewRows.filter(
    (row: (typeof finalNewRows)[number]) =>
      !localExistingKeys.has(`${normalizeRut(row.rut_cliente)}__${row.folio}`)
  );

  for (const row of trulyNewRows) {
    db.facturas_ventas.push({
      id: `fv-${Date.now()}-${row.folio}-${Math.random().toString(36).slice(2, 6)}`,
      rut_cliente: row.rut_cliente,
      folio: row.folio,
      razon_social: row.razon_social,
      tipo_doc: row.tipo_doc,
      fecha_docto: row.fecha_docto,
      monto_total: row.monto_total,
      tipo_docto_ref: row.tipo_docto_ref,
      folio_docto_ref: row.folio_docto_ref,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: row.monto_neto_saldo,
      deuda_cliente: row.monto_neto_saldo,
      created_at: nowIso,
    });
  }

  writeLocalDb(db);
  revalidatePath("/finanzas/facturas-ventas");

  return {
    insertedCount: trulyNewRows.length,
    omittedCount: totalOmitted + (finalNewRows.length - trulyNewRows.length),
    creditNotesApplied: summary.neteoNotasCredito.filter(
      (n) => n.origen_ubicacion !== "SIN_FACTURA_ORIGEN"
    ).length,
  };
}

/**
 * Actualiza la Gestión de Pago de una factura (DIRECTO_CLIENTE vs FACTORING + entidad asociada)
 */
export async function updateGestionPagoAction(params: {
  facturaId: string;
  gestionPago: GestionPagoTipo;
  factoringClienteId: string | null;
}): Promise<{ success: boolean }> {
  const effectiveFactoringId =
    params.gestionPago === "FACTORING" ? params.factoringClienteId : null;

  if (params.gestionPago === "FACTORING" && !effectiveFactoringId) {
    throw new Error(
      "Debe seleccionar una Empresa de Factoring Cliente para asignar la modalidad Factoring."
    );
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("facturas_ventas")
      .update({
        gestion_pago: params.gestionPago,
        factoring_cliente_id: effectiveFactoringId,
      })
      .eq("id", params.facturaId);

    if (error) {
      throw new Error(`Error actualizando gestión de pago: ${error.message}`);
    }

    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/finanzas/facturas-ventas/factoring-clientes");
    return { success: true };
  }

  const db = readLocalDb();
  const idx = db.facturas_ventas.findIndex((f) => f.id === params.facturaId);
  if (idx === -1) {
    throw new Error("Factura no encontrada.");
  }

  db.facturas_ventas[idx].gestion_pago = params.gestionPago;
  db.facturas_ventas[idx].factoring_cliente_id = effectiveFactoringId;
  writeLocalDb(db);

  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/finanzas/facturas-ventas/factoring-clientes");
  return { success: true };
}

/**
 * Asigna la Orden de Número (ON) a una factura de venta para habilitar sus operaciones
 */
export async function asignarOnFacturaAction(params: {
  facturaId: string;
  onProyecto: string;
}): Promise<{ success: boolean; on_proyecto: string }> {
  const cleanOn = params.onProyecto.trim();
  if (!cleanOn || !/^[0-9]{3}$/.test(cleanOn)) {
    throw new Error("Debe ingresar o seleccionar un Código ON válido de 3 dígitos (ej. 701, 740).");
  }

  // 1. Guardar de inmediato en la base de datos local para disponibilidad instantánea y tolerancia a fallos
  const db = readLocalDb();
  if (!db.facturas_ventas) {
    db.facturas_ventas = [];
  }
  const idx = db.facturas_ventas.findIndex((f) => f.id === params.facturaId);
  if (idx !== -1) {
    db.facturas_ventas[idx].on_proyecto = cleanOn;
  } else {
    db.facturas_ventas.push({
      id: params.facturaId,
      on_proyecto: cleanOn,
    } as any);
  }
  writeLocalDb(db);

  // 2. Si Supabase está configurado, persistir en la nube
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("facturas_ventas")
        .update({
          on_proyecto: cleanOn,
        })
        .eq("id", params.facturaId);

      if (error) {
        console.warn(
          `[Supabase Update Warning]: ${error.message}. Asignación persistida en almacenamiento local.`
        );
        // Si el error es por falta de columna en Supabase o cache de esquema PostgREST,
        // no arrojar excepción fatal para no bloquear al usuario, ya que quedó guardado en el fallback local.
        if (
          error.message.includes("on_proyecto") ||
          error.message.includes("schema cache") ||
          error.message.includes("Could not find the 'on_proyecto' column")
        ) {
          revalidatePath("/finanzas/facturas-ventas");
          return { success: true, on_proyecto: cleanOn };
        }
        throw new Error(`Error asignando ON a la factura: ${error.message}`);
      }
    } catch (err: any) {
      if (
        err?.message?.includes("on_proyecto") ||
        err?.message?.includes("schema cache") ||
        err?.message?.includes("Could not find the 'on_proyecto' column")
      ) {
        console.warn(
          `[Supabase Schema Cache Warning]: ${err.message}. Continúa con almacenamiento local.`
        );
        revalidatePath("/finanzas/facturas-ventas");
        return { success: true, on_proyecto: cleanOn };
      }
      throw err;
    }
  }

  revalidatePath("/finanzas/facturas-ventas");
  return { success: true, on_proyecto: cleanOn };
}

/**
 * Sube y asocia el archivo de respaldo (PDF o Imagen) a una Factura de Venta
 * Cumpliendo con el segundo requisito del Doble Candado Operativo
 */
export async function subirRespaldoFacturaVentaAction(
  formData: FormData
): Promise<{ success: boolean; url_pdf: string }> {
  const facturaId = formData.get("facturaId") as string;
  const archivo = formData.get("archivo") as File | null;

  if (!facturaId || !archivo) {
    throw new Error("Debe proporcionar la factura y el archivo de respaldo.");
  }

  const allowedExtensions = ["pdf", "png", "jpg", "jpeg"];
  const ext = (archivo.name.split(".").pop() || "").toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error("El archivo debe ser en formato PDF o Imagen (.pdf, .png, .jpg, .jpeg).");
  }

  const arrayBuffer = await archivo.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const cleanFileName = `respaldo-${facturaId}-${Date.now()}.${ext}`;
  let urlPdf: string = "";

  // 1. Intentar subir al bucket de Supabase Storage: 'facturas-ventas-respaldos'
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      try {
        await supabase.storage.createBucket("facturas-ventas-respaldos", {
          public: true,
          allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/jpg"],
        });
      } catch {
        // Bucket ya existe o permisos de lectura
      }

      const mimeType =
        archivo.type || (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);

      const { error: uploadError } = await supabase.storage
        .from("facturas-ventas-respaldos")
        .upload(cleanFileName, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicData } = supabase.storage
          .from("facturas-ventas-respaldos")
          .getPublicUrl(cleanFileName);

        if (publicData?.publicUrl) {
          urlPdf = publicData.publicUrl;
        }
      } else {
        console.warn(`[Supabase Storage Warning]: ${uploadError.message}. Guardando respaldo localmente.`);
      }
    } catch (err: any) {
      console.warn(`[Supabase Storage Exception]: ${err?.message}. Guardando respaldo localmente.`);
    }
  }

  // 2. Almacenamiento local de respaldo (solo fuera de Vercel)
  if (!urlPdf) {
    if (process.env.VERCEL === "1") {
      throw new Error("No se pudo subir el archivo de respaldo a Supabase Storage.");
    }
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "respaldos");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localPath = path.join(uploadsDir, cleanFileName);
    fs.writeFileSync(localPath, buffer);
    urlPdf = `/uploads/respaldos/${cleanFileName}`;
  }

  // 3. Persistir en Base de Datos Local
  const db = readLocalDb();
  if (!db.facturas_ventas) {
    db.facturas_ventas = [];
  }
  const idx = db.facturas_ventas.findIndex((f) => f.id === facturaId);
  if (idx !== -1) {
    db.facturas_ventas[idx].url_pdf = urlPdf;
  } else {
    db.facturas_ventas.push({
      id: facturaId,
      url_pdf: urlPdf,
    } as any);
  }
  writeLocalDb(db);

  // 4. Persistir en tabla 'facturas_ventas' de Supabase
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("facturas_ventas")
        .update({ url_pdf: urlPdf })
        .eq("id", facturaId);

      if (error) {
        console.warn(
          `[Supabase Update Warning]: ${error.message}. url_pdf persistido en almacenamiento local.`
        );
      }
    } catch (err: any) {
      console.warn(`[Supabase Update Exception]: ${err?.message}. url_pdf persistido localmente.`);
    }
  }

  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/ventas-tensacon/facturas-ventas");

  return { success: true, url_pdf: urlPdf };
}

/**
 * Elimina o desvincula el archivo de respaldo de una factura de venta
 */
export async function eliminarRespaldoFacturaVentaAction(
  facturaId: string
): Promise<{ success: boolean }> {
  // 1. Desvincular en Local DB
  const db = readLocalDb();
  if (db.facturas_ventas) {
    const idx = db.facturas_ventas.findIndex((f) => f.id === facturaId);
    if (idx !== -1) {
      db.facturas_ventas[idx].url_pdf = null;
      writeLocalDb(db);
    }
  }

  // 2. Desvincular en Supabase
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("facturas_ventas")
        .update({ url_pdf: null })
        .eq("id", facturaId);
    } catch (err: any) {
      console.warn(`[Supabase Delete Warning]: ${err?.message}`);
    }
  }

  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/ventas-tensacon/facturas-ventas");

  return { success: true };
}

/**
 * Actualiza de forma masiva las fechas de vencimiento de las Facturas de Ventas
 * a partir de un archivo Excel (.xls / .xlsx) mediante la llave única compuesta RUT Cliente + Folio.
 * Visible y ejecutable exclusivamente para el perfil ADMINISTRADOR.
 */
export async function actualizarFechasVencimientoVentasAction(
  input: FormData | { fileBase64: string; fileName: string }
): Promise<ActualizacionVencimientoResult> {
  // 1. Verificación estricta de permisos de ADMINISTRADOR
  try {
    const session = await getServerUserSession();
    if (!session.esAdmin && session.perfil !== "ADMINISTRADOR") {
      throw new Error(
        "Acción no autorizada: Solo usuarios con perfil ADMINISTRADOR pueden importar fechas de vencimiento."
      );
    }
  } catch (err: any) {
    if (err?.message?.includes("Acción no autorizada")) {
      throw err;
    }
  }

  // 2. Extraer buffer de archivo
  let buffer: Buffer;
  if (typeof (input as FormData).get === "function") {
    const file = (input as FormData).get("file") as File;
    if (!file) {
      throw new Error("No se ha seleccionado ningún archivo Excel para procesar.");
    }
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    const obj = input as { fileBase64: string; fileName: string };
    if (!obj.fileBase64) {
      throw new Error("Buffer de archivo inválido o vacío.");
    }
    buffer = Buffer.from(obj.fileBase64, "base64");
  }

  // 3. Procesar primera hoja con SheetJS (XLSX)
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo Excel no contiene hojas de cálculo legibles.");
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) {
    throw new Error("El archivo Excel seleccionado está vacío.");
  }

  // 4. Mapeo de columnas:
  // Folio Factura: Columna C (Índice 2)
  // RUT Cliente (receptor): Columna E (Índice 4)
  // Fecha Vencimiento: Columna AA (Índice 26)
  let folioCol = 2;
  let receptorCol = 4;
  let vencCol = 26;

  const headerRow = rawRows[0] || [];
  const isHeaderRow = headerRow.some(
    (cell: any) =>
      typeof cell === "string" &&
      ["folio", "receptor", "rut", "fecha_vencimiento", "vencimiento"].some((k) =>
        cell.toLowerCase().includes(k)
      )
  );

  if (isHeaderRow) {
    headerRow.forEach((cell: any, idx: number) => {
      const str = String(cell || "").toLowerCase().trim();
      if (str === "folio") folioCol = idx;
      else if (str === "receptor" || str === "rut_receptor" || str === "rut_cliente") receptorCol = idx;
      else if (str === "fecha_vencimiento" || str === "vencimiento") vencCol = idx;
    });
  }

  const dataRows = isHeaderRow ? rawRows.slice(1) : rawRows;

  // 5. Cargar universo de facturas existentes para match exacto
  let existingFacturas: Array<{
    id: string;
    rut_cliente: string;
    folio: number;
    razon_social?: string;
  }> = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase
        .from("facturas_ventas")
        .select("id, rut_cliente, folio, razon_social");
      if (data) existingFacturas = data;
    } catch {
      // Continuar con base local
    }
  }

  const localDb = readLocalDb();
  if (localDb.facturas_ventas) {
    for (const lf of localDb.facturas_ventas) {
      if (!existingFacturas.some((ef) => ef.id === lf.id)) {
        existingFacturas.push(lf);
      }
    }
  }

  const cleanNormalize = (r: string) => (r || "").replace(/\./g, "").trim().toUpperCase();

  const invoiceMap = new Map<string, typeof existingFacturas[0]>();
  const invoiceByFolioMap = new Map<number, typeof existingFacturas[0]>();

  for (const f of existingFacturas) {
    const key = `${cleanNormalize(f.rut_cliente)}_${Number(f.folio)}`;
    invoiceMap.set(key, f);
    invoiceByFolioMap.set(Number(f.folio), f);
  }

  let actualizadasCount = 0;
  let noEncontradasCount = 0;
  const detalles: ActualizacionVencimientoResult["detalles"] = [];

  if (!localDb.facturas_ventas) {
    localDb.facturas_ventas = [];
  }

  const supabaseUpdates: Array<{ id: string; folio: number; rut: string; fechaVenc: string }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0) continue;

    const rawFolio = row[folioCol];
    const rawReceptor = row[receptorCol];
    const rawVenc = row[vencCol];

    if (rawFolio === undefined || rawFolio === null || !rawReceptor) continue;
    const folioNum = Number(String(rawFolio).replace(/[^\d]/g, ""));
    if (!folioNum || isNaN(folioNum)) continue;

    const cleanRut = cleanNormalize(String(rawReceptor));
    if (!cleanRut) continue;

    const fechaIso = parseDateToIso(rawVenc);
    if (!fechaIso) {
      // Celda vacía o no convertible -> omitir actualización
      continue;
    }

    const key = `${cleanRut}_${folioNum}`;
    const targetInvoice = invoiceMap.get(key) || invoiceByFolioMap.get(folioNum);

    if (targetInvoice) {
      actualizadasCount++;
      detalles.push({
        rut: cleanRut,
        folio: folioNum,
        fechaVencimiento: fechaIso,
        encontrada: true,
        razonSocial: targetInvoice.razon_social,
      });

      // Persistir inmediatamente en localDb
      const localIdx = localDb.facturas_ventas.findIndex(
        (f) => f.id === targetInvoice.id || (cleanNormalize(f.rut_cliente) === cleanRut && Number(f.folio) === folioNum)
      );
      if (localIdx !== -1) {
        localDb.facturas_ventas[localIdx].fecha_vencimiento = fechaIso;
      } else {
        localDb.facturas_ventas.push({
          id: targetInvoice.id,
          rut_cliente: targetInvoice.rut_cliente,
          folio: folioNum,
          razon_social: targetInvoice.razon_social || "",
          fecha_vencimiento: fechaIso,
        } as any);
      }

      supabaseUpdates.push({
        id: targetInvoice.id,
        folio: folioNum,
        rut: targetInvoice.rut_cliente,
        fechaVenc: fechaIso,
      });
    } else {
      noEncontradasCount++;
      detalles.push({
        rut: cleanRut,
        folio: folioNum,
        fechaVencimiento: fechaIso,
        encontrada: false,
      });
    }
  }

  // Guardar en almacenamiento local persistente
  writeLocalDb(localDb);

  // Actualizar en Supabase si está disponible
  if (isServerSupabaseConfigured() && supabaseUpdates.length > 0) {
    try {
      const supabase = await createServerSupabaseClient();
      for (const item of supabaseUpdates) {
        try {
          await supabase
            .from("facturas_ventas")
            .update({
              fecha_vencimiento: item.fechaVenc,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        } catch {
          // Ignorar error de schema cache si la columna no existe en Supabase todavía
        }
      }
    } catch {
      // Fallback silencioso
    }
  }

  // Revalidar rutas requeridas
  try {
    revalidatePath("/ventas-tensacon/facturas-ventas");
    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/ventas-tensacon/gestion-cobranza");
  } catch {
    // Permite invocación limpia en tests y scripts fuera del ciclo de Next.js
  }

  return {
    success: true,
    actualizadasCount,
    noEncontradasCount,
    totalFilasProcesadas: actualizadasCount + noEncontradasCount,
    detalles,
  };
}


