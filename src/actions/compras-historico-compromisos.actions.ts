"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  fetchAllSupabaseRows,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { assertIsAdmin } from "@/lib/auth/session";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  CompromisoCompra,
  PagoCompraHistorico,
  ModalidadCompromiso,
  ModalidadPagoCompra,
} from "@/types/database.types";
import { formatDateCL, normalizeRut, toDateOnlyString } from "@/lib/utils";

// --- SUBMÓDULO 1: HISTÓRICO PAGOS ---

export interface HistoricoPagosKPIs {
  totalPagado: number;
  cantidadTotal: number;
  totalDirecto: number;
  totalCompraTC: number;
  totalCheque: number;
  totalFactoring: number;
  totalConfirming: number;
  totalNeteo: number;
  cantidadDirecto: number;
  cantidadCompraTC: number;
  cantidadCheque: number;
  cantidadFactoring: number;
  cantidadConfirming: number;
}

export interface HistoricoPagosResponse {
  data: PagoCompraHistorico[];
  kpis: HistoricoPagosKPIs;
}

export async function getHistoricoPagosComprasAction(params?: {
  search?: string;
  modalidad?: string;
}): Promise<HistoricoPagosResponse> {
  const db = readLocalDb();
  let rawPagos: PagoCompraHistorico[] = [];

  // 1. Obtener pagos directos registrados localmente (solo montos efectivos > 0)
  if (db.pagos_compras && db.pagos_compras.length > 0) {
    rawPagos.push(
      ...db.pagos_compras.filter((p) => Number(p.monto_pagado || 0) > 0)
    );
  }

  // 2. Extraer pagos derivados de facturas saldadas con gestión explícita en DB local
  // (excluyendo facturas en $ 0 sin gestión y cheques aún no cobrados)
  const facturasSaldadasLocal = (db.facturas_compras || []).filter((f) => {
    if (f.tipo_doc === 61) return false;
    if (Number(f.monto_total || 0) <= 0) return false;
    if (f.estado === "PAGADA" || f.estado === "COMPRA_TC" || f.estado === "NETEO_NC") {
      return true;
    }
    if (f.estado === "CHEQUE") {
      const chks = (db.cheques_compras || []).filter((c) => c.factura_id === f.id);
      return chks.length > 0 && chks.every((c) => c.estado === "COBRADO");
    }
    return false;
  });

  const foliosRegistrados = new Set(rawPagos.map((p) => p.folio));
  const colabMap = new Map((db.mantenedor_colaboradores || []).map((c) => [c.id, c]));

  for (const fc of facturasSaldadasLocal) {
    if (!foliosRegistrados.has(fc.folio)) {
      let mod: ModalidadPagoCompra = "DIRECTO";
      if (fc.estado === "CHEQUE") mod = "CHEQUE";
      else if (fc.estado === "FACTORING") mod = "FACTORING";
      else if (fc.estado === "CONFIRMING") mod = "CONFIRMING";
      else if (fc.estado === "NETEO_NC") mod = "NETEO_NC";
      else if (fc.estado === "COMPRA_TC") mod = "COMPRA_TC";

      const colab = fc.colaborador_id ? colabMap.get(fc.colaborador_id) : null;
      const colabNombreLocal = colab?.nombre || "";
      const comentarioLocal = fc.observacion_tc?.trim() || "";
      const obsCompraTc = comentarioLocal
        ? colabNombreLocal
          ? `${colabNombreLocal} — ${comentarioLocal}`
          : comentarioLocal
        : colabNombreLocal
          ? `Rendición: ${colabNombreLocal}`
          : "Pago Contado / TC";

      rawPagos.push({
        id: `pago-derivado-${fc.id}`,
        factura_id: fc.id,
        rut_proveedor: fc.rut_proveedor,
        razon_social: fc.razon_social,
        folio: fc.folio,
        tipo_doc: fc.tipo_doc,
        modalidad_pago: mod,
        monto_pagado: fc.monto_total,
        fecha_real_pago: fc.fecha_vencimiento_cheque || (fc.updated_at ? fc.updated_at.slice(0, 10) : fc.fecha_vencimiento || fc.fecha_docto),
        observacion: fc.estado === "COMPRA_TC"
          ? obsCompraTc
          : fc.condicion_pago === "CONTADO"
          ? "Fondo por Rendir / Compra al Contado"
          : fc.numero_cheque
          ? `Cheque #${fc.numero_cheque} (${fc.banco_emisor || "Banco"})`
          : fc.estado === "NETEO_NC"
          ? "Saldada 100% por Neteo Nota de Crédito"
          : "Factura saldada en Tesorería",
        comprobante_ref: fc.estado === "COMPRA_TC"
          ? fc.on_proyecto
            ? `ON ${fc.on_proyecto}`
            : null
          : fc.condicion_pago === "CONTADO"
          ? `CONTADO-${fc.folio}`
          : fc.numero_cheque
          ? `CHK-${fc.numero_cheque}`
          : `FAC-${fc.folio}`,
        usuario_nombre:
          ((fc as unknown as Record<string, unknown>).pagado_por as string | null) ||
          null,
        pagado_por:
          ((fc as unknown as Record<string, unknown>).pagado_por as string | null) ||
          null,
        created_at: fc.created_at,
      });
      foliosRegistrados.add(fc.folio);
    }
  }

  // 3. Si Supabase está configurado, consultar pagos_facturas_compras / pagos_compras y facturas_compras saldadas
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();

      const [
        { data: supaFacs },
        { data: supaPagosFac },
        { data: supaPagos },
        { data: supaColabs },
      ] = await Promise.all([
        fetchAllSupabaseRows<Record<string, unknown>>((from, to) =>
          supabase
            .from("facturas_compras")
            .select("*")
            .neq("tipo_doc", 61)
            .gt("monto_total", 0)
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllSupabaseRows<Record<string, unknown>>((from, to) =>
          supabase
            .from("pagos_facturas_compras")
            .select("*")
            .gt("monto_pago", 0)
            .order("fecha_pago", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllSupabaseRows<Record<string, unknown>>((from, to) =>
          supabase
            .from("pagos_compras")
            .select("*")
            .gt("monto_pagado", 0)
            .order("fecha_real_pago", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to)
        ),
        supabase
          .from("mantenedor_colaboradores")
          .select("id, nombre"),
      ]);

      const facMap = new Map<string, Record<string, unknown>>();
      for (const f of supaFacs || []) {
        facMap.set(String(f.id), f as unknown as Record<string, unknown>);
      }

      const colabMap = new Map<string, string>();
      for (const c of supaColabs || []) {
        if (c.id && c.nombre) colabMap.set(String(c.id), String(c.nombre));
      }

      const facturasIdRegistrados = new Set(rawPagos.map((p) => p.factura_id).filter(Boolean));

      const normalizarPagoSupa = (p: Record<string, unknown>): PagoCompraHistorico | null => {
        const montoPagado = Number(p.monto_pago ?? p.monto_pagado ?? 0);
        if (montoPagado <= 0) return null;
        const facId = p.factura_id ? String(p.factura_id) : "";
        const facRef = facId ? facMap.get(facId) : undefined;
        const folioNum = Number(p.folio || facRef?.folio || 0);
        const modRaw = String(p.modalidad || p.modalidad_pago || "DIRECTO").toUpperCase();
        const modalidadNorm = (
          ["CHEQUE", "FACTORING", "CONFIRMING", "NETEO_NC", "COMPRA_TC", "DIRECTO"].includes(modRaw)
            ? modRaw
            : "DIRECTO"
        ) as ModalidadPagoCompra;

        const rawObs = p.observacion ? String(p.observacion) : "";
        const uuidMatch = rawObs.match(/ID:\s*([0-9a-fA-F-]{8,})/);
        const colabIdFromFac = facRef?.colaborador_id ? String(facRef.colaborador_id) : "";
        const colabNombre =
          (colabIdFromFac ? colabMap.get(colabIdFromFac) : undefined) ||
          (uuidMatch ? colabMap.get(uuidMatch[1]) : undefined) ||
          "";

        let obsLimpia: string | null = rawObs || null;
        if (modalidadNorm === "COMPRA_TC") {
          const comentarioLimpio = rawObs
            .replace(/Compra TC\s*[—-]\s*/gi, "")
            .replace(/Colaborador:\s*ID:\s*[0-9a-fA-F-]+/gi, "")
            .replace(/ID:\s*[0-9a-fA-F-]+/gi, "")
            .replace(/^[\s·—-]+|[\s·—-]+$/g, "")
            .trim();

          if (comentarioLimpio && comentarioLimpio !== "Rendición de Trabajador") {
            obsLimpia =
              colabNombre && !comentarioLimpio.includes(colabNombre)
                ? `${colabNombre} — ${comentarioLimpio}`
                : comentarioLimpio;
          } else {
            obsLimpia = colabNombre ? `Rendición: ${colabNombre}` : "Pago Contado / TC";
          }
        }

        const rawRef = p.comprobante_ref ? String(p.comprobante_ref).trim() : "";
        const esRefTcRedundante =
          rawRef.startsWith("TC-") || rawRef.toUpperCase() === "RENDICIÓN TC / CONTADO";
        const refLimpia = esRefTcRedundante
          ? facRef?.on_proyecto
            ? `ON ${facRef.on_proyecto}`
            : null
          : rawRef || null;

        return {
          id: String(p.id || `pago-${facId || folioNum}`),
          factura_id: facId,
          rut_proveedor: String(p.rut_proveedor || facRef?.rut_proveedor || ""),
          razon_social: String(p.razon_social || facRef?.razon_social || ""),
          folio: folioNum,
          tipo_doc: Number(p.tipo_doc || facRef?.tipo_doc || 33),
          modalidad_pago: modalidadNorm,
          monto_pagado: montoPagado,
          fecha_real_pago: String(
            p.fecha_pago ||
              p.fecha_real_pago ||
              (p.created_at ? String(p.created_at).slice(0, 10) : "") ||
              ""
          ),
          observacion: obsLimpia,
          comprobante_ref: refLimpia,
          usuario_id: p.usuario_id ? String(p.usuario_id) : null,
          usuario_nombre: p.usuario_nombre ? String(p.usuario_nombre) : null,
          pagado_por: p.usuario_nombre ? String(p.usuario_nombre) : null,
          created_at: String(p.created_at || new Date().toISOString()),
        };
      };

      // 3.1 Consolidar pagos_facturas_compras (sumando múltiples abonos de una misma factura)
      const pagosFacAgrupados = new Map<string, PagoCompraHistorico>();
      for (const rawP of supaPagosFac || []) {
        const p = normalizarPagoSupa(rawP as Record<string, unknown>);
        if (!p) continue;
        const groupKey = p.factura_id
          ? `id:${p.factura_id}`
          : p.folio > 0
          ? `folio:${p.folio}`
          : `row:${p.id}`;
        const existing = pagosFacAgrupados.get(groupKey);
        if (existing) {
          existing.monto_pagado += p.monto_pagado;
        } else {
          pagosFacAgrupados.set(groupKey, { ...p });
        }
      }
      for (const p of pagosFacAgrupados.values()) {
        rawPagos.unshift(p);
        if (p.folio > 0) foliosRegistrados.add(p.folio);
        if (p.factura_id) facturasIdRegistrados.add(p.factura_id);
      }

      // 3.2 Consolidar pagos_compras (sumando múltiples abonos si la factura no vino de pagos_facturas_compras)
      const pagosComprasAgrupados = new Map<string, PagoCompraHistorico>();
      for (const rawP of supaPagos || []) {
        const p = normalizarPagoSupa(rawP as Record<string, unknown>);
        if (!p) continue;
        if (
          foliosRegistrados.has(p.folio) ||
          (p.factura_id && facturasIdRegistrados.has(p.factura_id))
        ) {
          continue;
        }
        const groupKey = p.factura_id
          ? `id:${p.factura_id}`
          : p.folio > 0
          ? `folio:${p.folio}`
          : `row:${p.id}`;
        const existing = pagosComprasAgrupados.get(groupKey);
        if (existing) {
          existing.monto_pagado += p.monto_pagado;
        } else {
          pagosComprasAgrupados.set(groupKey, { ...p });
        }
      }
      for (const p of pagosComprasAgrupados.values()) {
        rawPagos.unshift(p);
        if (p.folio > 0) foliosRegistrados.add(p.folio);
        if (p.factura_id) facturasIdRegistrados.add(p.factura_id);
      }

      // 3.3 Respaldo: facturas saldadas o COMPRA_TC en facturas_compras no presentes en pagos_facturas_compras
      if (supaFacs && supaFacs.length > 0) {
        for (const sFac of supaFacs) {
          const folioNum = Number(sFac.folio || 0);
          const facId = String(sFac.id);
          const montoTotalNum = Number(sFac.monto_total || 0);
          if (montoTotalNum <= 0) continue;

          const mods = [
            sFac.estado,
            (sFac as unknown as Record<string, unknown>).modalidad_pago,
            (sFac as unknown as Record<string, unknown>).modalidad,
          ].map((v) => (v ? String(v).toUpperCase() : ""));

          const esSaldada =
            mods.includes("PAGADA") ||
            mods.includes("COMPRA_TC") ||
            mods.includes("NETEO_NC");

          if (
            esSaldada &&
            folioNum > 0 &&
            !foliosRegistrados.has(folioNum) &&
            !facturasIdRegistrados.has(facId)
          ) {
            let mod: ModalidadPagoCompra = "DIRECTO";
            if (mods.includes("CHEQUE")) mod = "CHEQUE";
            else if (mods.includes("FACTORING")) mod = "FACTORING";
            else if (mods.includes("CONFIRMING")) mod = "CONFIRMING";
            else if (mods.includes("NETEO_NC")) mod = "NETEO_NC";
            else if (mods.includes("COMPRA_TC")) mod = "COMPRA_TC";
            else mod = "DIRECTO";

            const sFacRec = sFac as unknown as Record<string, unknown>;
            const pagadoPorVal = sFacRec.pagado_por ? String(sFacRec.pagado_por) : null;
            const colabNombre = sFacRec.colaborador_id
              ? colabMap.get(String(sFacRec.colaborador_id))
              : undefined;
            const onProyectoVal = sFacRec.on_proyecto ? String(sFacRec.on_proyecto) : "";

            rawPagos.push({
              id: `pago-supa-${sFac.id}`,
              factura_id: facId,
              rut_proveedor: String(sFac.rut_proveedor || ""),
              razon_social: String(sFac.razon_social || ""),
              folio: folioNum,
              tipo_doc: Number(sFac.tipo_doc || 33),
              modalidad_pago: mod,
              monto_pagado: montoTotalNum,
              fecha_real_pago: String(
                (sFacRec.fecha_pago_real ? String(sFacRec.fecha_pago_real).slice(0, 10) : "") ||
                  sFac.fecha_vencimiento_cheque ||
                  (sFac.updated_at
                    ? String(sFac.updated_at).slice(0, 10)
                    : sFac.fecha_vencimiento || sFac.fecha_docto || new Date().toISOString().slice(0, 10))
              ),
              observacion: mods.includes("COMPRA_TC")
                ? sFacRec.observacion_tc && String(sFacRec.observacion_tc).trim()
                  ? colabNombre
                    ? `${colabNombre} — ${String(sFacRec.observacion_tc).trim()}`
                    : String(sFacRec.observacion_tc).trim()
                  : colabNombre
                    ? `Rendición: ${colabNombre}`
                    : "Pago Contado / TC"
                : sFac.condicion_pago === "CONTADO"
                ? "Fondo por Rendir / Compra al Contado"
                : sFac.numero_cheque
                ? `Cheque #${sFac.numero_cheque}`
                : "Factura saldada en Tesorería",
              comprobante_ref: mods.includes("COMPRA_TC")
                ? onProyectoVal
                  ? `ON ${onProyectoVal}`
                  : null
                : sFac.condicion_pago === "CONTADO"
                ? `CONTADO-${folioNum}`
                : sFac.numero_cheque
                ? `CHK-${sFac.numero_cheque}`
                : `FAC-${folioNum}`,
              usuario_nombre: pagadoPorVal,
              pagado_por: pagadoPorVal,
              created_at: String(sFac.created_at || new Date().toISOString()),
            });
            foliosRegistrados.add(folioNum);
            facturasIdRegistrados.add(facId);
          }
        }
      }
    } catch {
      // Usar fallback local
    }
  }

  // Cálculo de KPIs globales
  let totalPagado = 0;
  let totalDirecto = 0;
  let totalCompraTC = 0;
  let totalCheque = 0;
  let totalFactoring = 0;
  let totalConfirming = 0;
  let totalNeteo = 0;

  let cantidadDirecto = 0;
  let cantidadCompraTC = 0;
  let cantidadCheque = 0;
  let cantidadFactoring = 0;
  let cantidadConfirming = 0;

  for (const p of rawPagos) {
    const m = Number(p.monto_pagado || 0);
    totalPagado += m;

    const mod = String(
      p.modalidad_pago || (p as unknown as Record<string, unknown>).modalidad || ""
    )
      .trim()
      .toUpperCase()
      .replace(/_/g, " ");

    if (mod === "CHEQUE") {
      totalCheque += m;
      cantidadCheque++;
    } else if (mod === "FACTORING") {
      totalFactoring += m;
      cantidadFactoring++;
    } else if (mod === "CONFIRMING") {
      totalConfirming += m;
      cantidadConfirming++;
    } else if (mod === "NETEO NC") {
      totalNeteo += m;
    } else if (mod === "COMPRA TC") {
      totalCompraTC += m;
      cantidadCompraTC++;
    } else if (
      mod === "DIRECTO" ||
      mod === "DEUDA PROVEEDOR" ||
      mod === "TRANSFERENCIA" ||
      mod === "EFECTIVO" ||
      mod === "PAGADA"
    ) {
      totalDirecto += m;
      cantidadDirecto++;
    }
  }

  // Filtrado
  let filtered = [...rawPagos];
  const q = params?.search?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (p) =>
        p.folio.toString().includes(q) ||
        p.rut_proveedor.toLowerCase().includes(q) ||
        p.razon_social.toLowerCase().includes(q) ||
        (p.observacion && p.observacion.toLowerCase().includes(q)) ||
        (p.comprobante_ref && p.comprobante_ref.toLowerCase().includes(q))
    );
  }

  if (params?.modalidad && params.modalidad !== "TODOS") {
    const targetMod = params.modalidad.toUpperCase();
    filtered = filtered.filter((p) => {
      const pMod = String(p.modalidad_pago || "").toUpperCase();
      if (targetMod === "DIRECTO") {
        return (
          pMod === "DIRECTO" ||
          pMod === "TRANSFERENCIA" ||
          pMod === "EFECTIVO" ||
          pMod === "PAGADA" ||
          pMod === "DEUDA_PROVEEDOR"
        );
      }
      return pMod === targetMod;
    });
  }

  // Ordenar por fecha descendente
  filtered.sort((a, b) => b.fecha_real_pago.localeCompare(a.fecha_real_pago));

  return {
    data: filtered,
    kpis: {
      totalPagado,
      cantidadTotal: rawPagos.length,
      totalDirecto,
      totalCompraTC,
      totalCheque,
      totalFactoring,
      totalConfirming,
      totalNeteo,
      cantidadDirecto,
      cantidadCompraTC,
      cantidadCheque,
      cantidadFactoring,
      cantidadConfirming,
    },
  };
}

export interface ReversarPagoCompraParams {
  pagoId: string;
  facturaId?: string | null;
  montoPagado: number;
  folio?: number;
  rutProveedor?: string;
  modalidadPago?: string;
}

/**
 * Reversa un pago o abono registrado en Histórico de Pagos (solo perfil ADMINISTRADOR),
 * eliminando el registro de pago y devolviendo el monto al saldo pendiente de la factura.
 */
export async function reversarPagoCompraAction(
  params: ReversarPagoCompraParams
): Promise<{
  success: boolean;
  nuevoSaldo?: number;
  error?: string;
}> {
  const auth = await assertIsAdmin();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const { pagoId, facturaId, montoPagado, folio, rutProveedor, modalidadPago } = params;
    if (!pagoId) {
      return { success: false, error: "ID de pago inválido." };
    }
    const montoReversa = Math.max(0, Math.round(Number(montoPagado || 0)));
    if (montoReversa <= 0) {
      return { success: false, error: "El monto a reversar debe ser mayor a $0." };
    }

    const nowIso = new Date().toISOString();
    const resolvedFacturaId =
      facturaId && facturaId.trim() !== ""
        ? facturaId.trim()
        : pagoId.startsWith("pago-derivado-")
        ? pagoId.replace("pago-derivado-", "")
        : null;

    let nuevoSaldoFinal: number | undefined;

    // 1. Actualizar Local DB
    const db = readLocalDb();
    if (!db.pagos_compras) db.pagos_compras = [];
    if (!db.facturas_compras) db.facturas_compras = [];

    db.pagos_compras = db.pagos_compras.filter((p) => p.id !== pagoId);

    const localFacIdx = db.facturas_compras.findIndex((f) => {
      if (resolvedFacturaId && f.id === resolvedFacturaId) return true;
      if (folio && rutProveedor) {
        return (
          Number(f.folio) === Number(folio) &&
          normalizeRut(f.rut_proveedor) === normalizeRut(rutProveedor)
        );
      }
      return false;
    });

    if (localFacIdx !== -1) {
      const fac = db.facturas_compras[localFacIdx];
      const facRec = fac as unknown as Record<string, unknown>;
      const estadoUpper = String(fac.estado || "").toUpperCase();
      const saldoActual = ["PAGADA", "COMPRA_TC", "NETEO_NC"].includes(estadoUpper)
        ? 0
        : Number(facRec.saldo_pendiente ?? fac.monto_saldo ?? 0);
      const nuevoSaldo = Math.min(
        Number(fac.monto_total || 0),
        Math.max(0, Math.round(saldoActual + montoReversa))
      );
      const nuevoEstado = ["FACTORING", "CONFIRMING"].includes(estadoUpper)
        ? fac.estado
        : "DEUDA_PROVEEDOR";

      fac.monto_saldo = nuevoSaldo;
      facRec.saldo_pendiente = nuevoSaldo;
      fac.deuda_proveedor = nuevoSaldo;
      fac.estado = nuevoEstado;
      facRec.modalidad_pago = nuevoEstado;
      facRec.modalidad = nuevoEstado;
      fac.updated_at = nowIso;
      nuevoSaldoFinal = nuevoSaldo;

      if (modalidadPago?.toUpperCase() === "CHEQUE" && db.cheques_compras) {
        db.cheques_compras.forEach((c) => {
          if (c.factura_id === fac.id && c.estado === "COBRADO") {
            c.estado = "EMITIDO";
            c.updated_at = nowIso;
          }
        });
      }
    }
    writeLocalDb(db);

    // 2. Actualizar Supabase si está configurado
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();

      // 2.1 Eliminar registro de pago en pagos_facturas_compras y pagos_compras (si no es derivado)
      if (!pagoId.startsWith("pago-derivado-")) {
        const [{ error: delFacErr }, { error: delCompErr }] = await Promise.all([
          supabase.from("pagos_facturas_compras").delete().eq("id", pagoId),
          supabase.from("pagos_compras").delete().eq("id", pagoId),
        ]);
        if (delFacErr) {
          console.warn("[ReversaPago] pagos_facturas_compras delete:", delFacErr.message);
        }
        if (delCompErr) {
          console.warn("[ReversaPago] pagos_compras delete:", delCompErr.message);
        }
      }

      // 2.2 Localizar factura en Supabase y devolver monto al saldo pendiente
      let supaFac: Record<string, unknown> | null = null;
      if (resolvedFacturaId && !resolvedFacturaId.startsWith("fc-local-")) {
        const { data } = await supabase
          .from("facturas_compras")
          .select("*")
          .eq("id", resolvedFacturaId)
          .maybeSingle();
        if (data) supaFac = data as unknown as Record<string, unknown>;
      }

      if (!supaFac && folio) {
        const { data: candidates } = await supabase
          .from("facturas_compras")
          .select("*")
          .eq("folio", folio);
        if (candidates && candidates.length > 0) {
          const match = (candidates as Array<Record<string, unknown>>).find(
            (c) =>
              !rutProveedor ||
              normalizeRut(String(c.rut_proveedor || "")) === normalizeRut(rutProveedor)
          );
          if (match) supaFac = match;
        }
      }

      if (supaFac) {
        const montoTotal = Number(supaFac.monto_total || 0);
        const estadoUpper = String(supaFac.estado || "").toUpperCase();
        const saldoActual = ["PAGADA", "COMPRA_TC", "NETEO_NC"].includes(estadoUpper)
          ? 0
          : Number(supaFac.saldo_pendiente ?? supaFac.monto_saldo ?? 0);
        const nuevoSaldo = Math.min(
          montoTotal,
          Math.max(0, Math.round(saldoActual + montoReversa))
        );
        const nuevoEstado = ["FACTORING", "CONFIRMING"].includes(estadoUpper)
          ? String(supaFac.estado)
          : "DEUDA_PROVEEDOR";

        nuevoSaldoFinal = nuevoSaldo;

        const { error: updErr } = await supabase
          .from("facturas_compras")
          .update({
            saldo_pendiente: nuevoSaldo,
            monto_saldo: nuevoSaldo,
            deuda_proveedor: nuevoSaldo,
            estado: nuevoEstado,
            modalidad_pago: nuevoEstado,
            modalidad: nuevoEstado,
            updated_at: nowIso,
          })
          .eq("id", String(supaFac.id));

        if (updErr) {
          const { error: fallbackErr } = await supabase
            .from("facturas_compras")
            .update({
              saldo_pendiente: nuevoSaldo,
              monto_saldo: nuevoSaldo,
              estado: nuevoEstado,
              updated_at: nowIso,
            })
            .eq("id", String(supaFac.id));

          if (fallbackErr) {
            await supabase
              .from("facturas_compras")
              .update({
                monto_saldo: nuevoSaldo,
                estado: nuevoEstado,
                updated_at: nowIso,
              })
              .eq("id", String(supaFac.id));
          }
        }

        if (modalidadPago?.toUpperCase() === "CHEQUE") {
          await supabase
            .from("cheques_compras")
            .update({ estado: "EMITIDO", updated_at: nowIso })
            .eq("factura_id", String(supaFac.id))
            .eq("estado", "COBRADO");
        }
      }
    }

    revalidatePath("/compras-tensacon/historico-pagos");
    revalidatePath("/compras-tensacon/facturas-compras");
    revalidatePath("/compras-tensacon/deuda-proveedores");
    revalidatePath("/compras-tensacon/compromisos");

    return { success: true, nuevoSaldo: nuevoSaldoFinal };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al reversar el pago.",
    };
  }
}

// --- SUBMÓDULO 2: COMPROMISOS FINANCIEROS PENDIENTES ---

export interface SemanaOption {
  id: string; // e.g. "2026-W42" o "TODAS"
  semanaNumero: number;
  label: string; // e.g. "Semana 42: 12-10-2026 al 18-10-2026"
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  isCurrent: boolean;
  count: number;
  totalMonto: number;
}

export interface CompromisosComprasKPIs {
  granTotalSemana: number;
  totalCheques: number;
  totalFactoring: number;
  totalConfirming: number;
  cantidadTotal: number;
  cantidadCheques: number;
  cantidadFactoring: number;
  cantidadConfirming: number;
}

export interface CompromisosComprasResponse {
  data: CompromisoCompra[];
  semanasDisponibles: SemanaOption[];
  semanaActualId: string;
  kpis: CompromisosComprasKPIs;
}

// Helper para cálculo de semanas ISO y normalización de fechas puras
function getMondayFromDate(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.getFullYear(), date.getMonth(), diff, 12, 0, 0);
}

function getSundayFromMonday(monday: Date): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12, 0, 0);
}

function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatDayMonth(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

export async function getCompromisosComprasAction(params?: {
  semana?: string;
  search?: string;
  modalidad?: string;
}): Promise<CompromisosComprasResponse> {
  const db = readLocalDb();
  let rawCompromisos: CompromisoCompra[] = [];

  // Fecha base actual en hora Chile (America/Santiago) para proyección de semanas vigentes
  const chileNowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [by, bm, bd] = chileNowStr.split("-").map(Number);
  const baseDate = new Date(by, bm - 1, bd, 12, 0, 0);

  // 1. Intentar consultar vista en Supabase si está disponible
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("vista_compromisos_compras")
        .select("*")
        .order("fecha_vencimiento", { ascending: true });

      const { data: viewData, error } = await query;

      if (!error && viewData && viewData.length > 0) {
        rawCompromisos = (viewData as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          modalidad: String(r.modalidad || "").trim().toUpperCase() as ModalidadCompromiso,
          rut_proveedor: String(r.rut_proveedor || ""),
          razon_social: String(r.razon_social || ""),
          referencia_doc: String(r.referencia_doc || ""),
          fecha_vencimiento: toDateOnlyString(String(r.fecha_vencimiento || "")),
          monto: Number(r.monto || 0),
          created_at: String(r.created_at || ""),
        }));
      }
    } catch {
      // Ignorar y usar fallback
    }
  }

  // 2. Fallback local consolidando cheques, factoring y confirming
  if (rawCompromisos.length === 0) {
    // 2.1 Cheques Emitidos
    const chequesEmitidos = (db.cheques_compras || []).filter(
      (c) => c.estado === "EMITIDO"
    );
    const facturasMap = new Map((db.facturas_compras || []).map((f) => [f.id, f]));

    for (const c of chequesEmitidos) {
      const fac = facturasMap.get(c.factura_id);
      rawCompromisos.push({
        id: c.id,
        modalidad: "CHEQUE",
        rut_proveedor: fac?.rut_proveedor || "99.510.510-1",
        razon_social: fac?.razon_social || "PROVEEDOR CON CHEQUE",
        referencia_doc: `Cheque #${c.numero_cheque}`,
        fecha_vencimiento: toDateOnlyString(c.fecha_vencimiento),
        monto: Number(c.monto_cheque),
        created_at: c.created_at,
      });
    }

    // 2.2 Facturas en Factoring
    const facturasFactoring = (db.facturas_compras || []).filter(
      (f) =>
        (f.estado === "FACTORING" ||
          ((f as unknown as Record<string, unknown>).modalidad_pago as string)?.toUpperCase() === "FACTORING") &&
        f.monto_total > 0
    );
    for (const f of facturasFactoring) {
      rawCompromisos.push({
        id: `comp-fac-${f.id}`,
        modalidad: "FACTORING",
        rut_proveedor: f.rut_proveedor,
        razon_social: f.razon_social,
        referencia_doc: `FAC #${f.folio}`,
        fecha_vencimiento: toDateOnlyString(f.fecha_vencimiento || "2026-10-30"),
        monto: Number(f.monto_total),
        created_at: f.created_at,
      });
    }

    // 2.3 Facturas en Confirming
    const facturasConfirming = (db.facturas_compras || []).filter(
      (f) =>
        (f.estado === "CONFIRMING" ||
          ((f as unknown as Record<string, unknown>).modalidad_pago as string)?.toUpperCase() === "CONFIRMING") &&
        f.monto_total > 0
    );
    for (const f of facturasConfirming) {
      rawCompromisos.push({
        id: `comp-conf-${f.id}`,
        modalidad: "CONFIRMING",
        rut_proveedor: f.rut_proveedor,
        razon_social: f.razon_social,
        referencia_doc: `FAC #${f.folio}`,
        fecha_vencimiento: toDateOnlyString(f.fecha_vencimiento || "2026-11-15"),
        monto: Number(f.monto_total),
        created_at: f.created_at,
      });
    }

    // 2.4 Asegurar que facturas con estado o modalidad CHEQUE tengan presencia si cheques_compras no las tenía
    const facturasChequeSaldadas = (db.facturas_compras || []).filter(
      (f) =>
        f.estado !== "PAGADA" &&
        !((f as unknown as Record<string, unknown>).modalidad_pago as string)?.toUpperCase().includes("PAGADA") &&
        (f.estado === "CHEQUE" ||
          ((f as unknown as Record<string, unknown>).modalidad_pago as string)?.toUpperCase() === "CHEQUE")
    );
    for (const f of facturasChequeSaldadas) {
      if (!rawCompromisos.some((rc) => rc.referencia_doc.includes(String(f.folio)) || (f.numero_cheque && rc.referencia_doc.includes(f.numero_cheque)))) {
        rawCompromisos.push({
          id: `comp-chk-${f.id}`,
          modalidad: "CHEQUE",
          rut_proveedor: f.rut_proveedor,
          razon_social: f.razon_social,
          referencia_doc: f.numero_cheque ? `Cheque #${f.numero_cheque}` : `FAC #${f.folio}`,
          fecha_vencimiento: toDateOnlyString(f.fecha_vencimiento_cheque || f.fecha_vencimiento || "2026-10-29"),
          monto: Number(f.monto_total),
          created_at: f.created_at,
        });
      }
    }

    // 2.5 Enriquecer con facturas en modalidades especiales desde Supabase si la vista no estaba disponible
    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: supaFacs } = await fetchAllSupabaseRows<Record<string, unknown>>(
          (from, to) =>
            supabase
              .from("facturas_compras")
              .select("*")
              .neq("tipo_doc", 61)
              .order("id", { ascending: true })
              .range(from, to)
        );

        const { data: supaCheques } = await fetchAllSupabaseRows<Record<string, unknown>>(
          (from, to) =>
            supabase
              .from("cheques_compras")
              .select("factura_id, numero_cheque, monto_cheque, fecha_vencimiento, estado")
              .neq("estado", "PAGADO")
              .neq("estado", "ANULADO")
              .order("id", { ascending: true })
              .range(from, to)
        );

        const chequesMap = new Map<
          string,
          { totalMonto: number; folios: string[]; minFecha: string }
        >();
        for (const ch of supaCheques || []) {
          const fid = String(ch.factura_id || "");
          if (!fid) continue;
          const prev = chequesMap.get(fid) || {
            totalMonto: 0,
            folios: [],
            minFecha: "",
          };
          prev.totalMonto += Number(ch.monto_cheque || 0);
          const num = String(ch.numero_cheque || "").trim();
          if (num && !prev.folios.includes(num)) prev.folios.push(num);
          const fVenc = toDateOnlyString(String(ch.fecha_vencimiento || ""));
          if (fVenc && (!prev.minFecha || fVenc < prev.minFecha)) {
            prev.minFecha = fVenc;
          }
          chequesMap.set(fid, prev);
        }

        if (supaFacs && supaFacs.length > 0) {
          for (const sf of supaFacs) {
            const fol = Number(sf.folio || 0);
            const mods = [
              sf.estado,
              (sf as unknown as Record<string, unknown>).modalidad_pago,
              (sf as unknown as Record<string, unknown>).modalidad,
            ].map((v) => (v ? String(v).toUpperCase() : ""));

            const esCompromiso =
              !mods.includes("PAGADA") &&
              (mods.includes("FACTORING") ||
                mods.includes("CONFIRMING") ||
                mods.includes("CHEQUE"));

            if (esCompromiso && !rawCompromisos.some((rc) => rc.referencia_doc.includes(String(fol)))) {
              const mod: ModalidadCompromiso =
                mods.includes("CHEQUE")
                  ? "CHEQUE"
                  : mods.includes("CONFIRMING")
                  ? "CONFIRMING"
                  : "FACTORING";

              const chequeInfo = chequesMap.get(String(sf.id));
              const montoFinal =
                mod === "CHEQUE" && chequeInfo && chequeInfo.totalMonto > 0
                  ? chequeInfo.totalMonto
                  : Number(sf.monto_total || 0);
              const refFinal =
                mod === "CHEQUE" && chequeInfo && chequeInfo.folios.length > 0
                  ? `Cheque #${chequeInfo.folios.join(", #")}`
                  : sf.numero_cheque
                  ? `Cheque #${sf.numero_cheque}`
                  : `FAC #${fol}`;
              const fechaFinal =
                mod === "CHEQUE" && chequeInfo?.minFecha
                  ? chequeInfo.minFecha
                  : toDateOnlyString(
                      String(sf.fecha_vencimiento_cheque || sf.fecha_vencimiento || "2026-10-30")
                    );

              rawCompromisos.push({
                id: `comp-supa-${sf.id}`,
                modalidad: mod,
                rut_proveedor: String(sf.rut_proveedor || ""),
                razon_social: String(sf.razon_social || ""),
                referencia_doc: refFinal,
                fecha_vencimiento: fechaFinal,
                monto: montoFinal,
                created_at: String(sf.created_at || ""),
              });
            }
          }
        }
      } catch {
        // Fallback local completado
      }
    }
  }

  // 2.5 Incorporar Cuotas de Comparendos Pendientes (Litigios -> Compromisos)
  const cuotasExistentesIds = new Set<string>();
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const [{ data: supaCuotas }, { data: supaComps }] = await Promise.all([
        supabase
          .from("litigios_cuotas_comparendo")
          .select("*")
          .eq("estado_cuota", "PENDIENTE"),
        supabase
          .from("litigios_comparendos")
          .select("id, nombre_trabajador, rut_trabajador"),
      ]);

      const compMap = new Map<
        string,
        { nombre_trabajador: string; rut_trabajador?: string | null }
      >();
      for (const comp of (supaComps || []) as Array<Record<string, unknown>>) {
        compMap.set(String(comp.id), {
          nombre_trabajador: String(comp.nombre_trabajador || "Trabajador"),
          rut_trabajador: comp.rut_trabajador ? String(comp.rut_trabajador) : null,
        });
      }

      for (const q of (supaCuotas || []) as Array<Record<string, unknown>>) {
        const montoCuota = Number(q.monto_cuota || 0);
        if (montoCuota <= 0) continue;
        const qId = `comp-cuota-${q.id}`;
        cuotasExistentesIds.add(qId);

        const compInfo = compMap.get(String(q.comparendo_id));
        const metodo = String(q.metodo_pago || "TRANSFERENCIA").toUpperCase();
        const isCheque = metodo === "CHEQUE";
        const nroCheque = q.numero_cheque ? String(q.numero_cheque) : "";
        const bancoEmisor = q.banco_emisor ? String(q.banco_emisor) : "";

        rawCompromisos.push({
          id: qId,
          modalidad: isCheque ? "CHEQUE" : "ACUERDO_LITIGIO",
          rut_proveedor: compInfo?.rut_trabajador || "SIN RUT",
          razon_social: `${compInfo?.nombre_trabajador || "Trabajador"} — Acuerdo Comparendo`,
          referencia_doc:
            isCheque && nroCheque
              ? `Cuota ${q.numero_cuota} — Cheque #${nroCheque}${bancoEmisor ? ` (${bancoEmisor})` : ""}`
              : `Cuota ${q.numero_cuota} — Transferencia`,
          fecha_vencimiento: toDateOnlyString(String(q.fecha_vencimiento_cuota || "")),
          monto: montoCuota,
          created_at: String(q.created_at || new Date().toISOString()),
        });
      }
    } catch (err) {
      console.error("[Compromisos] Error proyectando cuotas de comparendos:", err);
    }
  } else {
    const compLocalMap = new Map(
      (db.litigios_comparendos || []).map((c) => [c.id, c])
    );
    for (const q of db.litigios_cuotas_comparendo || []) {
      if (q.estado_cuota !== "PENDIENTE" || Number(q.monto_cuota || 0) <= 0) continue;
      const qId = `comp-cuota-${q.id}`;
      if (cuotasExistentesIds.has(qId)) continue;
      const comp = compLocalMap.get(q.comparendo_id);
      const isCheque = q.metodo_pago === "CHEQUE";
      rawCompromisos.push({
        id: qId,
        modalidad: isCheque ? "CHEQUE" : "ACUERDO_LITIGIO",
        rut_proveedor: comp?.rut_trabajador || "SIN RUT",
        razon_social: `${comp?.nombre_trabajador || "Trabajador"} — Acuerdo Comparendo`,
        referencia_doc:
          isCheque && q.numero_cheque
            ? `Cuota ${q.numero_cuota} — Cheque #${q.numero_cheque}${q.banco_emisor ? ` (${q.banco_emisor})` : ""}`
            : `Cuota ${q.numero_cuota} — Transferencia`,
        fecha_vencimiento: toDateOnlyString(q.fecha_vencimiento_cuota),
        monto: Number(q.monto_cuota || 0),
        created_at: q.created_at || new Date().toISOString(),
      });
    }
  }

  // 3. Enriquecer con cálculo de días faltantes y color de alerta basado en fecha pura
  const enrichedCompromisos: CompromisoCompra[] = rawCompromisos.map((c) => {
    const vctoStr = toDateOnlyString(c.fecha_vencimiento);
    let diasFaltantes = 0;
    if (vctoStr) {
      const [vy, vm, vd] = vctoStr.split("-").map(Number);
      const vctoMidday = new Date(vy, vm - 1, vd, 12, 0, 0);
      const diffTime = vctoMidday.getTime() - baseDate.getTime();
      diasFaltantes = Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    let badgeColor: "emerald" | "amber" | "rose" = "emerald";
    if (diasFaltantes <= 7) {
      badgeColor = "rose";
    } else if (diasFaltantes <= 15) {
      badgeColor = "amber";
    } else {
      badgeColor = "emerald";
    }

    return {
      ...c,
      fecha_vencimiento: vctoStr,
      dias_faltantes: diasFaltantes,
      badge_color: badgeColor,
    };
  });

  // 4. Construir lista de Semanas (desde 1 semana antes hasta 6 semanas adelante)
  const currentMonday = getMondayFromDate(baseDate);
  const currentISOWeek = getISOWeekNumber(currentMonday);
  const currentSemanaId = `2026-W${currentISOWeek}`;

  const semanasDisponibles: SemanaOption[] = [];

  // Agregar opción "TODAS"
  semanasDisponibles.push({
    id: "TODAS",
    semanaNumero: 0,
    label: "Todas las Semanas (Consolidado Global)",
    fechaInicio: "",
    fechaFin: "",
    isCurrent: false,
    count: enrichedCompromisos.length,
    totalMonto: enrichedCompromisos.reduce((s, c) => s + c.monto, 0),
  });

  // Generar semanas desde -1 hasta +6 usando matemática de calendario sin desfase horario
  for (let offset = -1; offset <= 6; offset++) {
    const monday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + offset * 7, 12, 0, 0);
    const sunday = getSundayFromMonday(monday);

    const weekNum = getISOWeekNumber(monday);
    const weekId = `${monday.getFullYear()}-W${weekNum}`;

    const fechaInicioStr = toDateOnlyString(monday);
    const fechaFinStr = toDateOnlyString(sunday);

    // Contar compromisos de esta semana comparando estrictamente YYYY-MM-DD
    const inWeek = enrichedCompromisos.filter((c) => {
      const vcto = toDateOnlyString(c.fecha_vencimiento);
      if (!vcto) return false;
      return vcto >= fechaInicioStr && vcto <= fechaFinStr;
    });

    semanasDisponibles.push({
      id: weekId,
      semanaNumero: weekNum,
      label: `Semana ${weekNum}: ${formatDayMonth(monday)} al ${formatDayMonth(sunday)}`,
      fechaInicio: fechaInicioStr,
      fechaFin: fechaFinStr,
      isCurrent: weekId === currentSemanaId,
      count: inWeek.length,
      totalMonto: inWeek.reduce((s, c) => s + c.monto, 0),
    });
  }

  // 5. Aplicar Filtro de Semana solo si el cliente lo solicita explícitamente y no es "TODAS"
  let filtered = [...enrichedCompromisos];

  if (params?.semana && params.semana !== "TODAS") {
    const semOption = semanasDisponibles.find((s) => s.id === params.semana);
    if (semOption && semOption.fechaInicio && semOption.fechaFin) {
      filtered = filtered.filter((c) => {
        const vcto = toDateOnlyString(c.fecha_vencimiento);
        return vcto >= semOption.fechaInicio && vcto <= semOption.fechaFin;
      });
    }
  }

  // Filtro de Búsqueda
  const q = params?.search?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (c) =>
        c.razon_social.toLowerCase().includes(q) ||
        c.rut_proveedor.toLowerCase().includes(q) ||
        c.referencia_doc.toLowerCase().includes(q)
    );
  }

  // Filtro de Modalidad
  if (params?.modalidad && params.modalidad !== "TODOS" && params.modalidad !== "TODAS") {
    filtered = filtered.filter((c) => c.modalidad === params.modalidad);
  }

  // Ordenar por fecha de vencimiento ascendente
  filtered.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  // 6. KPIs de la selección
  let totalCheques = 0;
  let totalFactoring = 0;
  let totalConfirming = 0;
  let granTotalSemana = 0;

  let cantidadCheques = 0;
  let cantidadFactoring = 0;
  let cantidadConfirming = 0;

  for (const c of filtered) {
    granTotalSemana += c.monto;
    const mod = (c.modalidad || "").toUpperCase();
    if (mod === "CHEQUE") {
      totalCheques += c.monto;
      cantidadCheques++;
    } else if (mod === "FACTORING") {
      totalFactoring += c.monto;
      cantidadFactoring++;
    } else if (mod === "CONFIRMING") {
      totalConfirming += c.monto;
      cantidadConfirming++;
    }
  }

  return {
    data: filtered,
    semanasDisponibles,
    semanaActualId: currentSemanaId,
    kpis: {
      granTotalSemana,
      totalCheques,
      totalFactoring,
      totalConfirming,
      cantidadTotal: filtered.length,
      cantidadCheques,
      cantidadFactoring,
      cantidadConfirming,
    },
  };
}
