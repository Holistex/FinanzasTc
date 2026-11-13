"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { assertIsAdmin } from "@/lib/auth/session";
import {
  BancoCartola,
  CartolaBancaria,
  CartolaLinea,
  MantenedorTipoPago,
} from "@/types/database.types";

export interface CartolasTesoreriaKPIs {
  totalCartolas: number;
  totalMovimientos: number;
  totalGiros: number;
  totalAbonos: number;
  movimientosSinClasificar: number;
}

export interface CartolasTesoreriaResponse {
  lineas: CartolaLinea[];
  cartolas: CartolaBancaria[];
  tiposPago: MantenedorTipoPago[];
  kpis: CartolasTesoreriaKPIs;
}

export interface ImportacionCartolaResult {
  success: boolean;
  error?: string;
  cartola?: CartolaBancaria;
  movimientosImportados?: number;
  movimientosOmitidosDuplicados?: number;
  totalMovimientosArchivo?: number;
}

// ============================================================================
// HELPERS INTERNOS (NO EXPORTADOS POR REGLA NEXT.JS "USE SERVER")
// ============================================================================

const MONTH_MAP: Record<string, string> = {
  ENE: "01",
  JAN: "01",
  FEB: "02",
  MAR: "03",
  ABR: "04",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08",
  AUG: "08",
  SEP: "09",
  SET: "09",
  OCT: "10",
  NOV: "11",
  DIC: "12",
  DEC: "12",
};

function parseMontoClp(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : 0;

  let str = String(raw).trim();
  if (!str) return 0;

  // Detectar signo negativo (incluyendo formato contable entre paréntesis o signo al final)
  const isNegative =
    str.startsWith("-") ||
    str.endsWith("-") ||
    (str.startsWith("(") && str.endsWith(")"));

  // Si tiene coma decimal con 1 o 2 decimales al final y puntos de miles (ej. 1.234.567,00)
  if (/\.\d{3},\d{1,2}$/.test(str)) {
    str = str.replace(/,\d{1,2}$/, "");
  }

  const digits = str.replace(/[^0-9]/g, "");
  if (!digits) return 0;

  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return 0;
  return isNegative ? -num : num;
}

function parseFechaCartola(raw: unknown, fallbackYear: number = 2026): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Si es objeto Date nativo
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  // Si es número serial de Excel (valores típicos entre año 2020 y 2035: ~43831 a ~49673)
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 40000 && raw <= 55000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + raw * 86400000);
    return d.toISOString().slice(0, 10);
  }

  const str = String(raw).trim().toUpperCase();
  if (!str) return null;

  // 1. Formato Itaú: "01SEP", "15-SEP", "01 SEP", "01/SEP", "01SEP2026"
  const matchItau = str.match(/^(\d{1,2})[\s\-\/]*([A-Z]{3})(?:[\s\-\/]*(\d{2,4}))?$/);
  if (matchItau) {
    const day = matchItau[1].padStart(2, "0");
    const monthCode = matchItau[2];
    const month = MONTH_MAP[monthCode];
    if (month) {
      let year = fallbackYear;
      if (matchItau[3]) {
        year =
          matchItau[3].length === 2
            ? 2000 + parseInt(matchItau[3], 10)
            : parseInt(matchItau[3], 10);
      }
      return `${year}-${month}-${day}`;
    }
  }

  // 2. Formato DD/MM/YYYY o DD-MM-YYYY (Santander / estándar chileno)
  const matchDMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (matchDMY) {
    const day = matchDMY[1].padStart(2, "0");
    const month = matchDMY[2].padStart(2, "0");
    let year = parseInt(matchDMY[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${month}-${day}`;
  }

  // 3. Formato YYYY-MM-DD
  const matchYMD = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchYMD) {
    const year = matchYMD[1];
    const month = matchYMD[2].padStart(2, "0");
    const day = matchYMD[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

function getCellString(matrix: unknown[][], row1Based: number, col0Based: number): string {
  const row = matrix[row1Based - 1];
  if (!row) return "";
  const val = row[col0Based];
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Genera una clave unívoca compuesta para cada movimiento bancario:
 * HASH(banco + numeroCuenta + fecha + monto + descripcionLimpia + numeroOperacion) + _seq
 */
function generarMovimientoKey(
  banco: string,
  numeroCuenta: string,
  fecha: string,
  montoSigned: number,
  descripcion: string,
  seq: number,
  numeroOperacion?: string | null
): string {
  const normBanco = banco.trim().toUpperCase();
  const normCuenta = numeroCuenta.trim().toUpperCase();
  const normFecha = fecha.trim();
  const normMonto = String(Math.round(montoSigned));
  const normDesc = descripcion.trim().toUpperCase().replace(/\s+/g, " ");
  const normOp = numeroOperacion ? String(numeroOperacion).trim().toUpperCase() : "";

  const rawSeed = `${normBanco}|${normCuenta}|${normFecha}|${normMonto}|${normDesc}|${normOp}`;
  const hash = crypto.createHash("sha256").update(rawSeed).digest("hex").slice(0, 16);
  return `mov-${normFecha}-${hash}-${seq}`;
}

// ============================================================================
// 1. MANTENEDOR DE TIPOS DE PAGO (CATÁLOGO DE CLASIFICACIÓN)
// ============================================================================

export async function getTiposPagoAction(search?: string): Promise<MantenedorTipoPago[]> {
  const db = readLocalDb();
  let tipos: MantenedorTipoPago[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("mantenedor_tipos_pago")
        .select("*")
        .order("nombre", { ascending: true });

      if (!error && data && data.length > 0) {
        tipos = (data as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          nombre: String(r.nombre || "").toUpperCase(),
          descripcion: r.descripcion ? String(r.descripcion) : null,
          activo: r.activo !== false,
          created_at: String(r.created_at || new Date().toISOString()),
          updated_at: r.updated_at ? String(r.updated_at) : undefined,
        }));
      }
    } catch {
      // Fallback a localDb
    }
  }

  if (tipos.length === 0) {
    tipos = [...(db.mantenedor_tipos_pago || [])];
  } else {
    // Sincronizar con localDb por si se crearon registros localmente
    const supaNames = new Set(tipos.map((t) => t.nombre.toUpperCase()));
    for (const localTipo of db.mantenedor_tipos_pago || []) {
      if (!supaNames.has(localTipo.nombre.toUpperCase())) {
        tipos.push(localTipo);
      }
    }
  }

  tipos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    tipos = tipos.filter(
      (t) =>
        t.nombre.toLowerCase().includes(q) ||
        (t.descripcion && t.descripcion.toLowerCase().includes(q))
    );
  }

  return tipos;
}

export async function upsertTipoPagoAction(input: {
  id?: string;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
}): Promise<MantenedorTipoPago> {
  const cleanNombre = input.nombre.trim().toUpperCase();
  if (!cleanNombre) {
    throw new Error("El nombre del Tipo de Pago es obligatorio.");
  }

  const cleanDesc = input.descripcion?.trim() || null;
  const activo = input.activo !== false;
  const now = new Date().toISOString();

  const db = readLocalDb();
  if (!db.mantenedor_tipos_pago) db.mantenedor_tipos_pago = [];

  // Verificar duplicado por nombre
  const existingIdx = db.mantenedor_tipos_pago.findIndex(
    (t) =>
      t.nombre.toUpperCase() === cleanNombre ||
      (input.id && t.id === input.id)
  );

  let savedItem: MantenedorTipoPago = {
    id:
      input.id ||
      (existingIdx !== -1
        ? db.mantenedor_tipos_pago[existingIdx].id
        : `mtp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    nombre: cleanNombre,
    descripcion: cleanDesc,
    activo,
    created_at:
      existingIdx !== -1 ? db.mantenedor_tipos_pago[existingIdx].created_at : now,
    updated_at: now,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("mantenedor_tipos_pago")
      .upsert(
        {
          ...(input.id && !input.id.startsWith("mtp-") ? { id: input.id } : {}),
          nombre: cleanNombre,
          descripcion: cleanDesc,
          activo,
        },
        { onConflict: "nombre" }
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(`Error al guardar Tipo de Pago en Supabase: ${error.message}`);
    }

    if (data) {
      savedItem = {
        id: String(data.id),
        nombre: String(data.nombre).toUpperCase(),
        descripcion: data.descripcion ? String(data.descripcion) : null,
        activo: data.activo !== false,
        created_at: String(data.created_at || now),
        updated_at: now,
      };
    }
  }

  if (existingIdx !== -1) {
    db.mantenedor_tipos_pago[existingIdx] = savedItem;
  } else {
    db.mantenedor_tipos_pago.push(savedItem);
  }
  writeLocalDb(db);

  revalidatePath("/configuracion/colaboradores");
  revalidatePath("/tesoreria/cartolas-bancarias");
  return savedItem;
}

export async function toggleTipoPagoStatusAction(
  id: string,
  activo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = readLocalDb();
    if (!db.mantenedor_tipos_pago) db.mantenedor_tipos_pago = [];

    const idx = db.mantenedor_tipos_pago.findIndex((t) => t.id === id);
    let targetNombre: string | null = null;
    if (idx !== -1) {
      db.mantenedor_tipos_pago[idx].activo = activo;
      db.mantenedor_tipos_pago[idx].updated_at = new Date().toISOString();
      targetNombre = db.mantenedor_tipos_pago[idx].nombre;
      writeLocalDb(db);
    }

    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        if (!id.startsWith("mtp-")) {
          await supabase
            .from("mantenedor_tipos_pago")
            .update({ activo })
            .eq("id", id);
        } else if (targetNombre) {
          await supabase
            .from("mantenedor_tipos_pago")
            .update({ activo })
            .eq("nombre", targetNombre);
        }
      } catch {
        // Ignorar si la tabla aún no fue migrada en Supabase
      }
    }

    revalidatePath("/configuracion/colaboradores");
    revalidatePath("/tesoreria/cartolas-bancarias");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al actualizar estado",
    };
  }
}

// ============================================================================
// 2. CONSULTA Y CLASIFICACIÓN DE CARTOLAS BANCARIAS
// ============================================================================

export async function getCartolasBancariasAction(params?: {
  banco?: string;
  numeroCartola?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  search?: string;
}): Promise<CartolasTesoreriaResponse> {
  const db = readLocalDb();
  const tiposPago = await getTiposPagoAction();
  const tiposMap = new Map(tiposPago.map((t) => [t.id, t]));

  let cartolas: CartolaBancaria[] = [...(db.cartolas_bancarias || [])];
  let lineas: CartolaLinea[] = [...(db.cartolas_lineas || [])];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const [{ data: supaCartolas }, { data: supaLineas }] = await Promise.all([
        supabase
          .from("cartolas_bancarias")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("cartolas_lineas")
          .select("*")
          .order("fecha", { ascending: false }),
      ]);

      if (supaCartolas && supaCartolas.length > 0) {
        const supaMappedCartolas: CartolaBancaria[] = (
          supaCartolas as Array<Record<string, unknown>>
        ).map((c) => ({
          id: String(c.id),
          banco: String(c.banco || ""),
          numero_cartola: String(c.numero_cartola || ""),
          numero_cuenta: String(c.numero_cuenta || ""),
          fecha_desde: c.fecha_desde ? String(c.fecha_desde) : null,
          fecha_hasta: c.fecha_hasta ? String(c.fecha_hasta) : null,
          saldo_inicial: Number(c.saldo_inicial || 0),
          saldo_final: Number(c.saldo_final || 0),
          created_at: String(c.created_at || ""),
        }));

        // Combinar con locales evitando duplicados por (banco, numero_cartola, numero_cuenta)
        const seenKeys = new Set(
          supaMappedCartolas.map(
            (c) => `${c.banco}|${c.numero_cartola}|${c.numero_cuenta}`
          )
        );
        for (const lc of cartolas) {
          const key = `${lc.banco}|${lc.numero_cartola}|${lc.numero_cuenta}`;
          if (!seenKeys.has(key)) {
            supaMappedCartolas.push(lc);
          }
        }
        cartolas = supaMappedCartolas;
      }

      if (supaLineas && supaLineas.length > 0) {
        const localLineasMap = new Map(lineas.map((l) => [l.id, l]));
        const supaMappedLineas: CartolaLinea[] = (
          supaLineas as Array<Record<string, unknown>>
        ).map((l) => {
          const id = String(l.id);
          const localMatch = localLineasMap.get(id);
          return {
            id,
            cartola_id: String(l.cartola_id || ""),
            banco: l.banco ? String(l.banco) : undefined,
            numero_cuenta: l.numero_cuenta ? String(l.numero_cuenta) : undefined,
            movimiento_key: l.movimiento_key ? String(l.movimiento_key) : null,
            fecha: String(l.fecha || ""),
            numero_operacion: l.numero_operacion ? String(l.numero_operacion) : null,
            descripcion: String(l.descripcion || ""),
            giro: Number(l.giro || 0),
            abono: Number(l.abono || 0),
            saldo: l.saldo !== null && l.saldo !== undefined ? Number(l.saldo) : null,
            tipo_pago_id: l.tipo_pago_id
              ? String(l.tipo_pago_id)
              : localMatch?.tipo_pago_id || null,
            created_at: String(l.created_at || ""),
          };
        });

        const seenLineIds = new Set(supaMappedLineas.map((l) => l.id));
        for (const ll of lineas) {
          if (!seenLineIds.has(ll.id)) {
            supaMappedLineas.push(ll);
          }
        }
        lineas = supaMappedLineas;
      }
    } catch {
      // Usar respaldo local
    }
  }

  const cartolasById = new Map(cartolas.map((c) => [c.id, c]));

  // Hidratar banco, numero_cartola, numero_cuenta y tipo_pago en cada línea
  const hydratedLineas: CartolaLinea[] = lineas.map((l) => {
    const parent = cartolasById.get(l.cartola_id);
    const tipoPago = l.tipo_pago_id ? tiposMap.get(l.tipo_pago_id) || null : null;
    return {
      ...l,
      banco: l.banco || parent?.banco || "Banco Itaú",
      numero_cartola: l.numero_cartola || parent?.numero_cartola || "—",
      numero_cuenta: l.numero_cuenta || parent?.numero_cuenta || "—",
      tipo_pago: tipoPago,
    };
  });

  // Ordenar por fecha descendente y luego por orden de creación
  hydratedLineas.sort((a, b) => {
    const cmp = b.fecha.localeCompare(a.fecha);
    if (cmp !== 0) return cmp;
    return b.created_at.localeCompare(a.created_at);
  });

  // Cálculo de KPIs globales (sobre el universo o filtrado)
  let filtered = [...hydratedLineas];

  if (params?.banco && params.banco !== "TODOS") {
    filtered = filtered.filter((l) => l.banco === params.banco);
  }
  if (params?.numeroCartola && params.numeroCartola !== "TODAS") {
    filtered = filtered.filter((l) => l.numero_cartola === params.numeroCartola);
  }
  if (params?.fechaDesde) {
    filtered = filtered.filter((l) => l.fecha >= params.fechaDesde!);
  }
  if (params?.fechaHasta) {
    filtered = filtered.filter((l) => l.fecha <= params.fechaHasta!);
  }
  if (params?.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.descripcion.toLowerCase().includes(q) ||
        (l.numero_operacion && l.numero_operacion.toLowerCase().includes(q)) ||
        (l.numero_cartola && l.numero_cartola.toLowerCase().includes(q)) ||
        (l.banco && l.banco.toLowerCase().includes(q))
    );
  }

  const totalGiros = filtered.reduce((acc, l) => acc + Number(l.giro || 0), 0);
  const totalAbonos = filtered.reduce((acc, l) => acc + Number(l.abono || 0), 0);
  const movimientosSinClasificar = filtered.filter((l) => !l.tipo_pago_id).length;

  return {
    lineas: filtered,
    cartolas,
    tiposPago,
    kpis: {
      totalCartolas: cartolas.length,
      totalMovimientos: filtered.length,
      totalGiros,
      totalAbonos,
      movimientosSinClasificar,
    },
  };
}

export async function asignarTipoPagoLineaCartolaAction(
  lineaId: string,
  tipoPagoId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanTipoId = tipoPagoId && tipoPagoId.trim() !== "" ? tipoPagoId : null;

    const db = readLocalDb();
    if (!db.cartolas_lineas) db.cartolas_lineas = [];

    const idx = db.cartolas_lineas.findIndex((l) => l.id === lineaId);
    if (idx !== -1) {
      db.cartolas_lineas[idx].tipo_pago_id = cleanTipoId;
      writeLocalDb(db);
    }

    if (isServerSupabaseConfigured() && !lineaId.startsWith("cl-")) {
      const supabase = await createServerSupabaseClient();
      let resolvedSupaTipoId: string | null = cleanTipoId ? String(cleanTipoId) : null;

      // Si el tipo proviene del catálogo local ("mtp-..."), asegurar su existencia en mantenedor_tipos_pago de Supabase
      if (resolvedSupaTipoId && resolvedSupaTipoId.startsWith("mtp-")) {
        const localTipo = (db.mantenedor_tipos_pago || []).find(
          (t) => t.id === resolvedSupaTipoId
        );
        if (localTipo) {
          const { data: existingSupa } = await supabase
            .from("mantenedor_tipos_pago")
            .select("id")
            .ilike("nombre", localTipo.nombre.trim())
            .maybeSingle();

          if (existingSupa?.id) {
            resolvedSupaTipoId = String(existingSupa.id);
          } else {
            const { data: insertedSupa } = await supabase
              .from("mantenedor_tipos_pago")
              .upsert(
                {
                  nombre: localTipo.nombre.trim().toUpperCase(),
                  descripcion: localTipo.descripcion || null,
                  activo: localTipo.activo !== false,
                },
                { onConflict: "nombre" }
              )
              .select("id")
              .single();
            if (insertedSupa?.id) {
              resolvedSupaTipoId = String(insertedSupa.id);
            }
          }
        }
      }

      const { error } = await supabase
        .from("cartolas_lineas")
        .update({
          tipo_pago_id: resolvedSupaTipoId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lineaId);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidatePath("/tesoreria/saldos-bancarios");
    revalidatePath("/tesoreria/cartolas-bancarias");
    revalidatePath("/tesoreria/pagos");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al clasificar el movimiento de cartola.",
    };
  }
}

// 1. Clasificar línea (Traslada a pestaña Movimientos Clasificados)
export async function clasificarLineaCartolaAction(
  lineaId: string,
  tipoPagoId: string
): Promise<{ success: boolean; error?: string }> {
  return asignarTipoPagoLineaCartolaAction(lineaId, tipoPagoId);
}

// 2. Reversar línea (Devuelve a Líneas por clasificar)
export async function reversarLineaCartolaAction(
  lineaId: string
): Promise<{ success: boolean; error?: string }> {
  return asignarTipoPagoLineaCartolaAction(lineaId, null);
}

// 3. Asignación Masiva de Tipo de Movimiento
export async function asignarTipoMovimientoMasivoAction(
  lineaIds: string[],
  tipoPagoId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!lineaIds || lineaIds.length === 0) {
      throw new Error("No se han seleccionado movimientos para clasificar.");
    }

    const cleanTipoId = tipoPagoId && tipoPagoId.trim() !== "" ? tipoPagoId.trim() : null;
    if (!cleanTipoId) {
      throw new Error("Debe seleccionar un Tipo de Movimiento válido.");
    }

    const idSet = new Set(lineaIds);

    // 1. Actualización en Local DB
    const db = readLocalDb();
    if (!db.cartolas_lineas) db.cartolas_lineas = [];

    db.cartolas_lineas.forEach((l) => {
      if (idSet.has(l.id)) {
        l.tipo_pago_id = cleanTipoId;
      }
    });
    writeLocalDb(db);

    // 2. Actualización en Supabase si está configurado
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const validSupaIds = lineaIds.filter((id) => !id.startsWith("cl-"));
      if (validSupaIds.length > 0) {
        let finalSupaTipoId: string | null = String(cleanTipoId);
        if (finalSupaTipoId.startsWith("mtp-")) {
          const localTipo = (db.mantenedor_tipos_pago || []).find(
            (t) => t.id === finalSupaTipoId
          );
          if (localTipo) {
            const { data: existingSupa } = await supabase
              .from("mantenedor_tipos_pago")
              .select("id")
              .ilike("nombre", localTipo.nombre.trim())
              .maybeSingle();

            if (existingSupa?.id) {
              finalSupaTipoId = String(existingSupa.id);
            } else {
              const { data: insertedSupa } = await supabase
                .from("mantenedor_tipos_pago")
                .upsert(
                  {
                    nombre: localTipo.nombre.trim().toUpperCase(),
                    descripcion: localTipo.descripcion || null,
                    activo: localTipo.activo !== false,
                  },
                  { onConflict: "nombre" }
                )
                .select("id")
                .single();
              if (insertedSupa?.id) {
                finalSupaTipoId = String(insertedSupa.id);
              }
            }
          }
        }

        const { error } = await supabase
          .from("cartolas_lineas")
          .update({
            tipo_pago_id: finalSupaTipoId,
            updated_at: new Date().toISOString(),
          })
          .in("id", validSupaIds);

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    revalidatePath("/tesoreria/saldos-bancarios");
    revalidatePath("/tesoreria/cartolas-bancarias");
    revalidatePath("/tesoreria/pagos");

    return { success: true, count: lineaIds.length };
  } catch (err: unknown) {
    return {
      success: false,
      count: 0,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado en la asignación masiva de movimientos.",
    };
  }
}

// ============================================================================
// 3. PARSER Y HOMOLOGACIÓN MASIVA DE CARTOLAS BANCARIAS (ITAÚ & SANTANDER)
// ============================================================================

export async function importarCartolaBancariaExcelAction(
  formData: FormData
): Promise<ImportacionCartolaResult> {
  const auth = await assertIsAdmin();
  if (auth.error) {
    return {
      success: false,
      error: auth.error,
    };
  }

  try {
    const bancoRaw = formData.get("banco");
    const file = formData.get("file");

    if (!bancoRaw || typeof bancoRaw !== "string") {
      return {
        success: false,
        error: "Debe seleccionar el Banco de origen (Banco Itaú o Banco Santander).",
      };
    }

    const banco = bancoRaw.trim() as BancoCartola;
    if (banco !== "Banco Itaú" && banco !== "Banco Santander") {
      return {
        success: false,
        error: "Banco no válido. Seleccione Banco Itaú o Banco Santander.",
      };
    }

    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: "Debe adjuntar un archivo de saldos bancarios en formato Excel (.xls o .xlsx).",
      };
    }

    const fileName = (file.name || "").toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return {
        success: false,
        error: "Formato no permitido. El sistema solo admite archivos Excel (.xlsx o .xls).",
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", raw: false });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        success: false,
        error: "El archivo Excel no contiene hojas válidas.",
      };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });

    if (!matrix || matrix.length < 8) {
      return {
        success: false,
        error: "El archivo no posee la estructura mínima de filas requerida para una cartola bancaria.",
      };
    }

    let numeroCuenta = "";
    let numeroCartola = "";
    let fechaDesde: string | null = null;
    let fechaHasta: string | null = null;
    const parsedMovimientos: Array<{
      fecha: string;
      numero_operacion: string | null;
      descripcion: string;
      giro: number;
      abono: number;
      saldo: number | null;
    }> = [];

    if (banco === "Banco Itaú") {
      // ======================================================================
      // A. PARSER BANCO ITAÚ (SaldosMovimientos_*.xlsx o Cartola Oficial)
      // Encabezado:
      // - N° Cuenta: Celda B5 (índice [4][1]), o celdas A8..A12, D1..D10
      // - N° Cartola: D10 o "MOV" si es reporte de movimientos
      // - Período: Celda E10 (fila 10, col 4) o filas 3..12
      // ======================================================================
      // 1. Detección precisa de N° de Cuenta
      // Verificar celda B5 (fila 5, col 1) común en SaldosMovimientos
      const cellB5 = getCellString(matrix, 5, 1);
      const matchB5 = cellB5.match(/(\d{6,})/);
      if (matchB5) {
        numeroCuenta = matchB5[1];
      }

      // Si no estaba en B5, buscar en celdas cercanas (filas 1 a 12)
      if (!numeroCuenta) {
        for (let r = 1; r <= 12; r++) {
          for (let c = 0; c <= 4; c++) {
            const cellVal = getCellString(matrix, r, c);
            if (/cuenta|cta/i.test(cellVal)) {
              const m = cellVal.match(/(\d{6,})/);
              if (m) {
                numeroCuenta = m[1];
                break;
              }
              const nextVal = getCellString(matrix, r, c + 1);
              const mNext = nextVal.match(/(\d{6,})/);
              if (mNext) {
                numeroCuenta = mNext[1];
                break;
              }
            }
          }
          if (numeroCuenta) break;
        }
      }

      // Si aún no se encuentra, buscar cualquier secuencia de 8 a 12 dígitos en filas superiores
      if (!numeroCuenta) {
        for (let r = 2; r <= 10; r++) {
          for (let c = 0; c <= 3; c++) {
            const val = getCellString(matrix, r, c);
            const m = val.match(/\b(\d{8,12})\b/);
            if (m) {
              numeroCuenta = m[1];
              break;
            }
          }
          if (numeroCuenta) break;
        }
      }

      if (!numeroCuenta) {
        numeroCuenta = "0212350410"; // Fallback por defecto si no viene explícita
      }

      // 2. N° de Cartola
      let rawCartola = getCellString(matrix, 10, 3);
      if (rawCartola && !/saldo/i.test(rawCartola)) {
        const m = rawCartola.match(/(\d+)/);
        if (m) numeroCartola = m[1];
      }
      if (!numeroCartola) {
        for (let r = 8; r <= 12; r++) {
          for (let c = 2; c <= 5; c++) {
            const cellText = getCellString(matrix, r, c);
            if (/cartola/i.test(cellText) && !/saldo/i.test(cellText)) {
              const m = cellText.match(/(\d+)/);
              if (m) {
                numeroCartola = m[1];
                break;
              }
            }
          }
          if (numeroCartola) break;
        }
      }
      if (!numeroCartola || /saldo/i.test(numeroCartola)) {
        numeroCartola = "MOV"; // En reportes de movimientos se usa identificador "MOV"
      }

      // 3. Período
      let rawPeriodo = getCellString(matrix, 10, 4);
      if (!rawPeriodo || !/\d{4}/.test(rawPeriodo)) {
        for (let r = 3; r <= 12; r++) {
          for (let c = 0; c <= 6; c++) {
            const cellText = getCellString(matrix, r, c);
            if (/20\d{2}/.test(cellText)) {
              rawPeriodo = cellText;
              break;
            }
          }
          if (/20\d{2}/.test(rawPeriodo)) break;
        }
      }

      const yearMatch = rawPeriodo.match(/(20\d{2})/);
      const periodYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

      const datesInPeriodo = rawPeriodo.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g);
      if (datesInPeriodo && datesInPeriodo.length >= 1) {
        fechaDesde = parseFechaCartola(datesInPeriodo[0], periodYear);
        if (datesInPeriodo.length >= 2) {
          fechaHasta = parseFechaCartola(datesInPeriodo[1], periodYear);
        }
      }

      // 4. Movimientos desde fila 15 (1-indexed = 15 -> 0-indexed = 14)
      // Mapeo oficial Banco Itaú:
      // - Columna A (0): Fecha
      // - Columna B (1): Documentos (N° Operación)
      // - Columna D (3): Movimientos (Glosa / Descripción)
      // - Columna E (4): Depósitos o abonos (ABONO)
      // - Columna F (5): Giros o cargos (GIRO)
      // - Columna G (6): Saldos
      for (let r = 14; r < matrix.length; r++) {
        const row = matrix[r];
        if (!row || row.length === 0) continue;

        const colA = row[0]; // Fecha
        const colB = row[1]; // Documentos / N° Operación
        const colC = row[2];
        const colD = row[3]; // Movimientos / Descripción
        const colE = row[4]; // Depósitos o abonos -> ABONO
        const colF = row[5]; // Giros o cargos -> GIRO
        const colG = row[6]; // Saldos

        const fechaParsed = parseFechaCartola(colA, periodYear);
        if (!fechaParsed) continue;

        const descripcion = String(colD || colC || "").trim();
        if (!descripcion || /^saldo\s+(inicial|final|anterior|disponible)/i.test(descripcion)) {
          continue;
        }

        // Mapeo corregido: Col E = Abono, Col F = Giro
        const abono = Math.abs(parseMontoClp(colE));
        const giro = Math.abs(parseMontoClp(colF));
        if (giro === 0 && abono === 0) continue;

        const saldoRaw = String(colG ?? "").trim();
        const saldo = saldoRaw !== "" && !/disponible/i.test(saldoRaw) ? parseMontoClp(colG) : null;
        
        const rawNumOp = String(colB ?? "").trim();
        const numOp = rawNumOp && rawNumOp !== "000000000" && rawNumOp !== "0" ? rawNumOp : null;

        parsedMovimientos.push({
          fecha: fechaParsed,
          numero_operacion: numOp,
          descripcion,
          giro,
          abono,
          saldo,
        });
      }
    } else {
      // ======================================================================
      // B. PARSER BANCO SANTANDER
      // Encabezado:
      // - N° Cuenta: Celda A7 (ej. 0-000-0187993-6)
      // - N° Cartola: Celda A8 (extraer 488 de "Número cartola: 488")
      // - Período: Celdas C8 y D8
      // Movimientos (Desde fila 17):
      // - Fecha: Columna C (19/10/2026)
      // - Descripción: Columna B
      // - N° Operación / Documento: Columna D
      // - Giros vs Abonos (Regla Columna F y A):
      //   * Si Columna F es 'A' o Monto > 0: Abono = ABS(Monto), Giro = 0
      //   * Si Columna F es 'C' o Monto < 0: Giro = ABS(Monto), Abono = 0
      // ======================================================================
      // 1. Detección de Cuenta en Cabecera (Evitar celdas con "ejecutivo", "saldo", etc.)
      for (let r = 0; r < Math.min(15, matrix.length); r++) {
        const row = matrix[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim();
          if (/ejecutivo|saldo\s+disponible|nombre/i.test(val)) continue;
          if (/cuenta/i.test(val)) {
            const m = val.match(/(\d[\d\-\.]{4,}[\dkK])/i);
            if (m) {
              numeroCuenta = m[1];
              break;
            }
            // Revisar celda siguiente
            const nextVal = String(row[c + 1] || "").trim();
            if (nextVal && !/ejecutivo|saldo/i.test(nextVal)) {
              const m2 = nextVal.match(/(\d[\d\-\.]{4,}[\dkK])/i);
              if (m2) {
                numeroCuenta = m2[1];
                break;
              }
            }
          }
        }
        if (numeroCuenta) break;
      }

      if (!numeroCuenta) {
        for (let r = 4; r <= 12; r++) {
          const txt = getCellString(matrix, r, 0);
          if (txt && !/ejecutivo|saldo/i.test(txt)) {
            const m = txt.match(/(\d[\d\-\.]{4,}[\dkK])/i);
            if (m) {
              numeroCuenta = m[1];
              break;
            }
          }
        }
      }
      if (!numeroCuenta) numeroCuenta = "SANTANDER-CTA";

      // 2. Detección de N° Cartola en Cabecera
      for (let r = 0; r < Math.min(15, matrix.length); r++) {
        const row = matrix[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim();
          if (/ejecutivo/i.test(val)) continue;
          if (/cartola/i.test(val)) {
            const m = val.match(/(\d+)/);
            if (m) {
              numeroCartola = m[1];
              break;
            }
            const nextVal = String(row[c + 1] || "").trim();
            const m2 = nextVal.match(/(\d+)/);
            if (m2) {
              numeroCartola = m2[1];
              break;
            }
          }
        }
        if (numeroCartola) break;
      }
      if (!numeroCartola) numeroCartola = "MOV";

      // 3. Detección Dinámica de Fila de Encabezados y Mapeo de Columnas
      let headerRowIndex = -1;
      const colMap: {
        monto: number;
        descripcion: number;
        fecha: number;
        saldo: number;
        numDoc: number;
        numMov: number;
        tipo: number;
      } = {
        monto: -1,
        descripcion: -1,
        fecha: -1,
        saldo: -1,
        numDoc: -1,
        numMov: -1,
        tipo: -1,
      };

      for (let r = 0; r < Math.min(25, matrix.length); r++) {
        const row = matrix[r];
        if (!row || !Array.isArray(row)) continue;

        const rowUpper = row.map((cell) => String(cell || "").trim().toUpperCase());
        const hasMonto = rowUpper.some((txt) => txt === "MONTO" || txt.includes("MONTO"));
        const hasFecha = rowUpper.some((txt) => txt === "FECHA" || txt.includes("FECHA"));
        const hasDesc = rowUpper.some((txt) => txt.includes("DESCRIP") || txt.includes("MOVIMIENTO"));

        if (hasMonto && (hasFecha || hasDesc)) {
          headerRowIndex = r;
          row.forEach((cell, idx) => {
            const val = String(cell || "").trim().toUpperCase();
            if (val === "MONTO" && colMap.monto === -1) colMap.monto = idx;
            else if (val.includes("MONTO") && colMap.monto === -1) colMap.monto = idx;

            if (val.includes("DESCRIP") && colMap.descripcion === -1) colMap.descripcion = idx;

            if (val === "FECHA" && colMap.fecha === -1) colMap.fecha = idx;
            else if (val.includes("FECHA") && colMap.fecha === -1) colMap.fecha = idx;

            if (val === "SALDO" && colMap.saldo === -1) colMap.saldo = idx;

            if ((val.includes("DOCUMENTO") || val.includes("N° DOC") || val === "DOC") && colMap.numDoc === -1) {
              colMap.numDoc = idx;
            }

            if ((val.includes("MOVIMIENTO") || val.includes("N° MOV") || val.includes("OPERACION")) && !val.includes("DESCRIP") && colMap.numMov === -1) {
              colMap.numMov = idx;
            }

            if ((val.includes("CARGO") || val.includes("ABONO") || val === "C/A" || val === "TIPO") && colMap.tipo === -1) {
              colMap.tipo = idx;
            }
          });
          break;
        }
      }

      // Si no se encontró fila de encabezado explícita, usar defaults seguros Santander
      const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 16;
      if (colMap.monto === -1) colMap.monto = 0;
      if (colMap.descripcion === -1) colMap.descripcion = 1;
      if (colMap.fecha === -1) colMap.fecha = 2; // Col C (índice 2)
      if (colMap.saldo === -1) colMap.saldo = 3; // Col D (índice 3)
      if (colMap.numDoc === -1) colMap.numDoc = 4; // Col E (índice 4)
      if (colMap.tipo === -1) colMap.tipo = 7; // Col H o F

      // 4. Procesar Filas de Movimientos
      for (let r = startRow; r < matrix.length; r++) {
        const row = matrix[r];
        if (!row || row.length === 0) continue;

        // A. Descripción
        const descIdx = colMap.descripcion !== -1 ? colMap.descripcion : 1;
        const rawDescripcion = row[descIdx];
        if (rawDescripcion === undefined || rawDescripcion === null || String(rawDescripcion).trim() === "") {
          continue;
        }
        const descripcion = String(rawDescripcion).trim();
        if (/^saldo\s+(inicial|final|anterior)/i.test(descripcion)) {
          continue;
        }

        // B. Fecha: leer estrictamente de la columna mapeada como FECHA
        let fechaParsed: string | null = null;
        if (colMap.fecha !== -1 && row[colMap.fecha] !== undefined && row[colMap.fecha] !== null) {
          const rawFechaCell = row[colMap.fecha];
          const strFecha = String(rawFechaCell).trim();

          // Formato chileno estricto DD/MM/YYYY o DD-MM-YYYY
          const matchChileno = strFecha.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
          if (matchChileno) {
            const dia = matchChileno[1].padStart(2, "0");
            const mes = matchChileno[2].padStart(2, "0");
            let anio = parseInt(matchChileno[3], 10);
            if (anio < 100) anio += 2000;
            fechaParsed = `${anio}-${mes}-${dia}`;
          } else {
            fechaParsed = parseFechaCartola(rawFechaCell);
          }
        }

        // Si la columna de fecha no contenía una fecha válida, buscar de manera restrictiva en celdas de la fila
        // pero NUNCA en la columna de saldo ni de monto
        if (!fechaParsed) {
          for (let c = 0; c < row.length; c++) {
            if (c === colMap.saldo || c === colMap.monto || c === colMap.descripcion) continue;
            const cellVal = row[c];
            const strVal = String(cellVal || "").trim();
            const match = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
            if (match) {
              const dia = match[1].padStart(2, "0");
              const mes = match[2].padStart(2, "0");
              let anio = parseInt(match[3], 10);
              if (anio < 100) anio += 2000;
              fechaParsed = `${anio}-${mes}-${dia}`;
              break;
            }
          }
        }

        if (!fechaParsed) continue; // Si no es una fila transaccional con fecha, saltar

        // C. Monto
        const montoIdx = colMap.monto !== -1 ? colMap.monto : 0;
        const rawMonto = row[montoIdx];
        const montoSigned = parseMontoClp(rawMonto);
        const absMonto = Math.abs(montoSigned);
        if (absMonto === 0) continue;

        // D. Saldo (opcional)
        let saldoVal: number | null = null;
        if (colMap.saldo !== -1 && row[colMap.saldo] !== undefined && row[colMap.saldo] !== null) {
          const s = parseMontoClp(row[colMap.saldo]);
          if (s !== 0 || String(row[colMap.saldo]).trim() === "0") {
            saldoVal = s;
          }
        }

        // E. Indicador Cargo / Abono ('C' o 'A')
        let flagCA = "";
        if (colMap.tipo !== -1 && row[colMap.tipo] !== undefined && row[colMap.tipo] !== null) {
          const s = String(row[colMap.tipo]).trim().toUpperCase();
          if (s === "C" || s === "A") flagCA = s;
        }

        if (!flagCA) {
          for (let c = 0; c < row.length; c++) {
            if (c === colMap.descripcion || c === colMap.monto || c === colMap.fecha || c === colMap.saldo) {
              continue;
            }
            const s = String(row[c] ?? "").trim().toUpperCase();
            if (s === "C" || s === "A") {
              flagCA = s;
              break;
            }
          }
        }

        let giro = 0;
        let abono = 0;
        if (flagCA === "C" || (flagCA === "" && montoSigned < 0)) {
          giro = absMonto;
          abono = 0;
        } else if (flagCA === "A" || (flagCA === "" && montoSigned > 0)) {
          abono = absMonto;
          giro = 0;
        } else {
          giro = absMonto;
          abono = 0;
        }

        // F. N° Documento / N° Movimiento / N° Operación
        let numDocStr = "";
        const docIdx = colMap.numDoc !== -1 ? colMap.numDoc : colMap.numMov;
        if (docIdx !== -1 && row[docIdx] !== undefined && row[docIdx] !== null) {
          const s = String(row[docIdx]).trim();
          if (s !== "" && s !== "0" && s !== flagCA) {
            numDocStr = s;
          }
        }

        // Si no se capturó documento y hay otra columna numMov/numDoc disponible
        if (!numDocStr && colMap.numMov !== -1 && row[colMap.numMov] !== undefined) {
          const s = String(row[colMap.numMov]).trim();
          if (s !== "" && s !== "0" && s !== flagCA) {
            numDocStr = s;
          }
        }

        parsedMovimientos.push({
          fecha: fechaParsed,
          numero_operacion: numDocStr || null,
          descripcion,
          giro,
          abono,
          saldo: saldoVal,
        });
      }
    }

    if (!numeroCartola) {
      return {
        success: false,
        error: `No fue posible detectar el N° de Cartola en el archivo para ${banco}. Verifique que el formato corresponda a la cartola oficial.`,
      };
    }

    if (parsedMovimientos.length === 0) {
      return {
        success: false,
        error: `No se encontraron movimientos válidos en la cartola N° ${numeroCartola} (${banco}). Verifique el formato del archivo.`,
      };
    }

    // Completar fechaDesde / fechaHasta a partir de los movimientos si no venían en cabecera
    const sortedDates = parsedMovimientos.map((m) => m.fecha).sort();
    if (!fechaDesde) fechaDesde = sortedDates[0] || null;
    if (!fechaHasta) fechaHasta = sortedDates[sortedDates.length - 1] || null;

    // ========================================================================
    // NUEVO MOTOR DE IMPORTACIÓN POR MOVIMIENTOS BANCARIOS CON KEY ANTIDUPLICADOS
    // ========================================================================
    const now = new Date().toISOString();
    const cartolaDisplay = numeroCartola ? numeroCartola : "MOV";
    const cuentaDisplay = numeroCuenta ? numeroCuenta : banco;

    // 1. Asignar movimiento_key con correlativo intra-día para duplicados idénticos en la misma fecha
    const dailySeqMap = new Map<string, number>();

    const movimientosConKey = parsedMovimientos.map((m) => {
      const montoSigned = m.giro > 0 ? -m.giro : m.abono;
      const opKey = m.numero_operacion ? m.numero_operacion.trim().toUpperCase() : "";
      const dayKey = `${banco}|${cuentaDisplay}|${m.fecha}|${Math.round(montoSigned)}|${m.descripcion.trim().toUpperCase()}|${opKey}`;
      const seq = (dailySeqMap.get(dayKey) || 0) + 1;
      dailySeqMap.set(dayKey, seq);

      const movimientoKey = generarMovimientoKey(
        banco,
        cuentaDisplay,
        m.fecha,
        montoSigned,
        m.descripcion,
        seq,
        m.numero_operacion
      );

      return {
        ...m,
        movimientoKey,
      };
    });

    // 2. Obtener claves ya existentes en la base de datos local y Supabase
    const db = readLocalDb();
    if (!db.cartolas_bancarias) db.cartolas_bancarias = [];
    if (!db.cartolas_lineas) db.cartolas_lineas = [];

    const existingKeysLocal = new Set<string>();
    db.cartolas_lineas.forEach((l) => {
      if (l.movimiento_key) existingKeysLocal.add(l.movimiento_key);
    });

    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        const candidateKeys = movimientosConKey.map((m) => m.movimientoKey);
        // Consultar claves existentes en lotes de hasta 500
        for (let i = 0; i < candidateKeys.length; i += 500) {
          const chunk = candidateKeys.slice(i, i + 500);
          const { data: supaKeys } = await supabase
            .from("cartolas_lineas")
            .select("movimiento_key")
            .in("movimiento_key", chunk);

          if (supaKeys) {
            supaKeys.forEach((k: { movimiento_key?: string | null }) => {
              if (k.movimiento_key) existingKeysLocal.add(k.movimiento_key);
            });
          }
        }
      } catch {
        // Fallback a verificación local
      }
    }

    // 3. Filtrar movimientos nuevos omitiendo los que ya existen por movimiento_key
    const movimientosNuevos = movimientosConKey.filter(
      (m) => !existingKeysLocal.has(m.movimientoKey)
    );
    const movimientosOmitidosDuplicados =
      movimientosConKey.length - movimientosNuevos.length;

    if (movimientosNuevos.length === 0) {
      return {
        success: false,
        error: `Todos los movimientos del archivo (${movimientosConKey.length}) ya fueron importados previamente. No se registraron duplicados.`,
        movimientosImportados: 0,
        movimientosOmitidosDuplicados,
        totalMovimientosArchivo: movimientosConKey.length,
      };
    }

    // 4. Crear o reutilizar registro de cartola bancaria para agrupar
    const cartolaId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const saldoFinal =
      movimientosConKey[movimientosConKey.length - 1]?.saldo ?? 0;

    const nuevaCartola: CartolaBancaria = {
      id: cartolaId,
      banco,
      numero_cartola: cartolaDisplay,
      numero_cuenta: cuentaDisplay,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      saldo_inicial: 0,
      saldo_final: saldoFinal,
      created_at: now,
    };

    // 5. Preparar nuevas líneas
    const nuevasLineas: CartolaLinea[] = movimientosNuevos.map((m, idx) => ({
      id: `cl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      cartola_id: cartolaId,
      banco,
      numero_cartola: cartolaDisplay,
      numero_cuenta: cuentaDisplay,
      movimiento_key: m.movimientoKey,
      fecha: m.fecha,
      numero_operacion: m.numero_operacion,
      descripcion: m.descripcion,
      giro: m.giro,
      abono: m.abono,
      saldo: m.saldo,
      tipo_pago_id: null,
      created_at: now,
    }));

    // 6. Inserción en Supabase con validación explícita de errores
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error: errCartola } = await supabase.from("cartolas_bancarias").insert({
        id: cartolaId,
        banco,
        numero_cartola: cartolaDisplay,
        numero_cuenta: cuentaDisplay,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        saldo_inicial: 0,
        saldo_final: saldoFinal,
      });

      if (errCartola) {
        throw new Error(`Error al insertar cartola en Supabase: ${errCartola.message}`);
      }

      // Insertar líneas con ON CONFLICT (movimiento_key) DO NOTHING
      const { error: errLineas } = await supabase.from("cartolas_lineas").upsert(
        nuevasLineas.map((l) => ({
          banco: l.banco,
          numero_cuenta: l.numero_cuenta,
          numero_cartola: l.numero_cartola,
          fecha: l.fecha,
          numero_operacion: l.numero_operacion,
          sucursal: null,
          descripcion: l.descripcion,
          giro: l.giro,
          abono: l.abono,
          saldo: l.saldo,
          movimiento_key: l.movimiento_key,
          cartola_id: l.cartola_id,
          tipo_pago_id: null,
        })),
        { onConflict: "movimiento_key", ignoreDuplicates: true }
      );

      if (errLineas) {
        throw new Error(`Error al insertar movimientos en cartolas_lineas: ${errLineas.message}`);
      }
    }

    // 7. Persistencia Local
    db.cartolas_bancarias.unshift(nuevaCartola);
    db.cartolas_lineas = [...nuevasLineas, ...db.cartolas_lineas];
    writeLocalDb(db);

    revalidatePath("/tesoreria/saldos-bancarios");
    revalidatePath("/tesoreria/cartolas-bancarias");
    revalidatePath("/tesoreria/pagos");

    return {
      success: true,
      cartola: nuevaCartola,
      movimientosImportados: nuevasLineas.length,
      movimientosOmitidosDuplicados,
      totalMovimientosArchivo: movimientosConKey.length,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al procesar el archivo de cartola bancaria.",
    };
  }
}

export async function vaciarTesoreriaAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 1. Vaciar Base de Datos Local
    const db = readLocalDb();
    db.cartolas_bancarias = [];
    db.cartolas_lineas = [];
    writeLocalDb(db);

    // 2. Vaciar Supabase si está configurado
    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        await supabase
          .from("cartolas_lineas")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase
          .from("cartolas_bancarias")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (supaErr) {
        console.error("Error al vaciar tablas de tesorería en Supabase:", supaErr);
      }
    }

    // 3. Revalidar Caché de Next.js
    revalidatePath("/tesoreria/cartolas-bancarias");
    revalidatePath("/tesoreria/pagos");

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al vaciar el módulo de tesorería.",
    };
  }
}
