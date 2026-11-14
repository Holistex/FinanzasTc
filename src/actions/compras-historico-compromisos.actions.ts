"use server";

import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
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
  totalCheque: number;
  totalFactoring: number;
  totalConfirming: number;
  totalNeteo: number;
  cantidadDirecto: number;
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
      const obsCompraTc = [
        colab ? `Compra TC — Colaborador: ${colab.nombre} (${colab.rut})` : "Compra TC — Rendición de Trabajador",
        fc.on_proyecto ? `ON ${fc.on_proyecto}` : null,
        fc.observacion_tc || null,
      ]
        .filter(Boolean)
        .join(" · ");

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
          ? `TC-${fc.folio}`
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

      // 3.1 Consultar pagos_facturas_compras (solo monto_pagado > 0)
      const { data: supaPagosFac } = await supabase
        .from("pagos_facturas_compras")
        .select("*")
        .gt("monto_pagado", 0)
        .order("fecha_real_pago", { ascending: false });

      const facturasIdRegistrados = new Set(rawPagos.map((p) => p.factura_id).filter(Boolean));

      if (supaPagosFac && supaPagosFac.length > 0) {
        for (const p of supaPagosFac as PagoCompraHistorico[]) {
          if (
            Number(p.monto_pagado || 0) > 0 &&
            !foliosRegistrados.has(p.folio) &&
            (!p.factura_id || !facturasIdRegistrados.has(p.factura_id))
          ) {
            rawPagos.unshift(p);
            foliosRegistrados.add(p.folio);
            if (p.factura_id) facturasIdRegistrados.add(p.factura_id);
          }
        }
      }

      // 3.2 Consultar pagos_compras (solo monto_pagado > 0)
      const { data: supaPagos } = await supabase
        .from("pagos_compras")
        .select("*")
        .gt("monto_pagado", 0)
        .order("fecha_real_pago", { ascending: false });

      if (supaPagos && supaPagos.length > 0) {
        for (const p of supaPagos as PagoCompraHistorico[]) {
          if (
            Number(p.monto_pagado || 0) > 0 &&
            !foliosRegistrados.has(p.folio) &&
            (!p.factura_id || !facturasIdRegistrados.has(p.factura_id))
          ) {
            rawPagos.unshift(p);
            foliosRegistrados.add(p.folio);
            if (p.factura_id) facturasIdRegistrados.add(p.factura_id);
          }
        }
      }

      // 3.3 Consultar facturas saldadas con modalidad explícita en Supabase (excluyendo $0 sin gestión)
      const { data: supaFacs } = await supabase
        .from("facturas_compras")
        .select("*")
        .neq("tipo_doc", 61)
        .gt("monto_total", 0);

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

            const pagadoPorVal = (sFac as unknown as Record<string, unknown>).pagado_por
              ? String((sFac as unknown as Record<string, unknown>).pagado_por)
              : null;

            rawPagos.push({
              id: `pago-supa-${sFac.id}`,
              factura_id: facId,
              rut_proveedor: String(sFac.rut_proveedor || ""),
              razon_social: String(sFac.razon_social || ""),
              folio: folioNum,
              tipo_doc: Number(sFac.tipo_doc || 33),
              modalidad_pago: mod,
              monto_pagado: montoTotalNum,
              fecha_real_pago:
                sFac.fecha_vencimiento_cheque ||
                (sFac.updated_at
                  ? String(sFac.updated_at).slice(0, 10)
                  : sFac.fecha_vencimiento || sFac.fecha_docto || new Date().toISOString().slice(0, 10)),
              observacion: mods.includes("COMPRA_TC")
                ? "Compra TC — Rendición de Trabajador"
                : sFac.condicion_pago === "CONTADO"
                ? "Fondo por Rendir / Compra al Contado"
                : sFac.numero_cheque
                ? `Cheque #${sFac.numero_cheque}`
                : "Factura saldada en Tesorería",
              comprobante_ref: mods.includes("COMPRA_TC")
                ? `TC-${folioNum}`
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
  let totalCheque = 0;
  let totalFactoring = 0;
  let totalConfirming = 0;
  let totalNeteo = 0;

  let cantidadDirecto = 0;
  let cantidadCheque = 0;
  let cantidadFactoring = 0;
  let cantidadConfirming = 0;

  for (const p of rawPagos) {
    const m = Number(p.monto_pagado || 0);
    totalPagado += m;

    const mod = String(p.modalidad_pago || "").toUpperCase();

    if (mod === "CHEQUE") {
      totalCheque += m;
      cantidadCheque++;
    } else if (mod === "FACTORING") {
      totalFactoring += m;
      cantidadFactoring++;
    } else if (mod === "CONFIRMING") {
      totalConfirming += m;
      cantidadConfirming++;
    } else if (mod === "NETEO_NC") {
      totalNeteo += m;
    } else {
      // DIRECTO, TRANSFERENCIA, EFECTIVO, PAGADA, COMPRA_TC
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
      totalCheque,
      totalFactoring,
      totalConfirming,
      totalNeteo,
      cantidadDirecto,
      cantidadCheque,
      cantidadFactoring,
      cantidadConfirming,
    },
  };
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

  // Fecha base del sistema: 18 de octubre de 2026 (Semana 42)
  const baseDate = new Date(2026, 9, 18, 12, 0, 0);
  const baseDateStr = "2026-10-18";

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
          modalidad: r.modalidad as ModalidadCompromiso,
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
        const { data: supaFacs } = await supabase
          .from("facturas_compras")
          .select("*")
          .neq("tipo_doc", 61);

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

              rawCompromisos.push({
                id: `comp-supa-${sf.id}`,
                modalidad: mod,
                rut_proveedor: String(sf.rut_proveedor || ""),
                razon_social: String(sf.razon_social || ""),
                referencia_doc: sf.numero_cheque ? `Cheque #${sf.numero_cheque}` : `FAC #${fol}`,
                fecha_vencimiento: toDateOnlyString(sf.fecha_vencimiento_cheque || sf.fecha_vencimiento || "2026-10-30"),
                monto: Number(sf.monto_total || 0),
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
    if (c.modalidad === "CHEQUE") {
      totalCheques += c.monto;
      cantidadCheques++;
    } else if (c.modalidad === "FACTORING") {
      totalFactoring += c.monto;
      cantidadFactoring++;
    } else if (c.modalidad === "CONFIRMING") {
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
