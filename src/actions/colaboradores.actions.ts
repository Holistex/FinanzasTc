"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { MantenedorColaborador } from "@/types/database.types";
import { assertIsAdmin } from "@/lib/auth/session";
import { formatRutDisplay } from "@/lib/utils";

export interface UpsertColaboradorInput {
  id?: string;
  rut: string;
  nombre: string;
  cargo: string;
  activo?: boolean;
}

export interface SincronizacionColaboradoresSummary {
  totalFilasLeidas: number;
  activosSincronizados: number; // X: Colaboradores importados/mantenidos en estado Activo
  nuevosAgregados: number; // Y: Nuevos colaboradores agregados a la base
  actualizadosExistentes: number;
  pasadosANoActivo: number; // Z: Colaboradores cambiados a estado No Activo por no figurar en la planilla
  detalleNuevos: Array<{ rut: string; nombre: string; cargo: string }>;
  detalleInactivados: Array<{ rut: string; nombre: string; cargo: string }>;
  erroresFila: Array<{ fila: number; mensaje: string }>;
  colaboradores: MantenedorColaborador[];
}

/**
 * Normaliza el RUT eliminando puntos, espacios y guion, dejando formato limpio en mayúsculas (ej. "12345678K").
 */
function cleanColaboradorRut(rawRut: string | number | null | undefined): string {
  if (rawRut === null || rawRut === undefined) return "";
  return String(rawRut)
    .replace(/[^0-9kK]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Obtiene el listado consolidado de colaboradores (Supabase + Respaldo Local)
 * garantizando unicidad estricta por RUT limpio.
 */
export async function getColaboradoresAction(
  searchQuery?: string,
  filtroEstado?: "ALL" | "ACTIVO" | "INACTIVO"
): Promise<MantenedorColaborador[]> {
  const q = searchQuery?.trim().toLowerCase() || "";
  const qCleanRut = cleanColaboradorRut(q).toLowerCase();

  const localDb = readLocalDb();
  const localList = [...(localDb.mantenedor_colaboradores || [])];

  let supaList: MantenedorColaborador[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("mantenedor_colaboradores")
        .select("*")
        .order("nombre", { ascending: true });

      if (!error && data) {
        supaList = data as MantenedorColaborador[];
      } else if (error) {
        console.warn(`[getColaboradoresAction Supabase warning]: ${error.message}`);
      }
    } catch (err: any) {
      console.warn(`[getColaboradoresAction Supabase exception]: ${err?.message}`);
    }
  }

  // Consolidar por llave única de RUT limpio (sin puntos ni guion)
  const mapByRut = new Map<string, MantenedorColaborador>();

  for (const item of localList) {
    const clean = cleanColaboradorRut(item.rut);
    if (clean) {
      mapByRut.set(clean, {
        ...item,
        rut: clean,
        nombre: (item.nombre || "").trim().toUpperCase(),
        cargo: (item.cargo || "").trim(),
        activo: item.activo !== false,
      });
    }
  }

  for (const item of supaList) {
    const clean = cleanColaboradorRut(item.rut);
    if (clean) {
      mapByRut.set(clean, {
        ...item,
        rut: clean,
        nombre: (item.nombre || "").trim().toUpperCase(),
        cargo: (item.cargo || "").trim(),
        activo: item.activo !== false,
      });
    }
  }

  let result = Array.from(mapByRut.values());

  if (filtroEstado === "ACTIVO") {
    result = result.filter((item) => item.activo !== false);
  } else if (filtroEstado === "INACTIVO") {
    result = result.filter((item) => item.activo === false);
  }

  if (q) {
    result = result.filter((item) => {
      const formattedRut = formatRutDisplay(item.rut).toLowerCase();
      return (
        item.rut.toLowerCase().includes(q) ||
        (qCleanRut.length > 0 && item.rut.toLowerCase().includes(qCleanRut)) ||
        formattedRut.includes(q) ||
        item.nombre.toLowerCase().includes(q) ||
        item.cargo.toLowerCase().includes(q)
      );
    });
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Crea o actualiza manualmente un colaborador previniendo duplicados por RUT.
 * Si el RUT ya existe, actualiza su nombre, cargo y estado sin duplicar el registro.
 */
export async function upsertColaboradorAction(
  input: UpsertColaboradorInput
): Promise<MantenedorColaborador> {
  const cleanRut = cleanColaboradorRut(input.rut);
  if (!cleanRut || cleanRut.length < 2 || !/^[0-9]+[0-9K]$/.test(cleanRut)) {
    throw new Error("El RUT ingresado no es válido (ej. 12.345.678-9).");
  }

  const cleanNombre = (input.nombre || "").trim().toUpperCase();
  if (!cleanNombre) {
    throw new Error("El Nombre completo del colaborador es obligatorio.");
  }

  const cleanCargo = (input.cargo || "").trim().toUpperCase();
  if (!cleanCargo) {
    throw new Error("El Cargo del colaborador es obligatorio.");
  }

  const now = new Date().toISOString();
  const db = readLocalDb();
  if (!db.mantenedor_colaboradores) {
    db.mantenedor_colaboradores = [];
  }

  // Buscar coincidencia por RUT limpio o por ID
  const existingIdx = db.mantenedor_colaboradores.findIndex(
    (c) =>
      cleanColaboradorRut(c.rut) === cleanRut ||
      (Boolean(input.id) && c.id === input.id)
  );

  let record: MantenedorColaborador;
  const targetActivo = input.activo !== undefined ? input.activo : true;

  if (existingIdx !== -1) {
    record = {
      ...db.mantenedor_colaboradores[existingIdx],
      rut: cleanRut,
      nombre: cleanNombre,
      cargo: cleanCargo,
      activo: targetActivo,
      updated_at: now,
    };
    db.mantenedor_colaboradores[existingIdx] = record;
  } else {
    record = {
      id: input.id || crypto.randomUUID(),
      rut: cleanRut,
      nombre: cleanNombre,
      cargo: cleanCargo,
      activo: targetActivo,
      created_at: now,
      updated_at: now,
    };
    db.mantenedor_colaboradores.push(record);
  }

  // Garantizar que no queden duplicados residuales con el mismo RUT limpio en local
  const seenRuts = new Set<string>();
  db.mantenedor_colaboradores = db.mantenedor_colaboradores.filter((item) => {
    const r = cleanColaboradorRut(item.rut);
    if (seenRuts.has(r)) return false;
    seenRuts.add(r);
    return true;
  });

  writeLocalDb(db);

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("mantenedor_colaboradores")
        .upsert(
          {
            rut: cleanRut,
            nombre: cleanNombre,
            cargo: cleanCargo,
            activo: targetActivo,
            updated_at: now,
          },
          { onConflict: "rut" }
        )
        .select()
        .single();

      if (!error && data) {
        record = {
          ...data,
          rut: cleanColaboradorRut(data.rut),
          nombre: (data.nombre || "").trim().toUpperCase(),
          cargo: (data.cargo || "").trim(),
          activo: data.activo !== false,
        } as MantenedorColaborador;
      }
    } catch (err: any) {
      console.warn(`[Supabase upsert mantenedor_colaboradores warning]: ${err?.message}`);
    }
  }

  revalidatePath("/configuracion/colaboradores");
  return record;
}

/**
 * Conmuta manualmente el estado Activo / No Activo de un colaborador.
 */
export async function toggleColaboradorStatusAction(
  id: string,
  rut: string,
  activo: boolean
): Promise<boolean> {
  const cleanRut = cleanColaboradorRut(rut);
  const now = new Date().toISOString();
  const db = readLocalDb();

  if (db.mantenedor_colaboradores) {
    const item = db.mantenedor_colaboradores.find(
      (c) => c.id === id || cleanColaboradorRut(c.rut) === cleanRut
    );
    if (item) {
      item.activo = activo;
      item.updated_at = now;
      writeLocalDb(db);
    }
  }

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("mantenedor_colaboradores")
        .update({ activo, updated_at: now })
        .or(`id.eq.${id},rut.eq.${cleanRut}`);
    } catch {
      // fallback local
    }
  }

  revalidatePath("/configuracion/colaboradores");
  return true;
}

/**
 * Procesa y sincroniza masivamente una planilla Excel (.xls / .xlsx) con las columnas RUT, NOMBRE, CARGO.
 * Regla 1 (Upsert / No Reingreso):
 *   - Si el RUT existe en la BD -> actualiza nombre, cargo y marca como Activo (activo = true).
 *   - Si el RUT no existe -> se inserta como nuevo con estado Activo (activo = true).
 * Regla 2 (Inactivación Automática de Ausentes):
 *   - Todo colaborador existente en la BD cuyo RUT no figure en la nómina importada pasa automáticamente a No Activo (activo = false).
 */
export async function importarColaboradoresExcelAction(
  input: FormData | { fileBase64: string; fileName: string }
): Promise<SincronizacionColaboradoresSummary> {
  // Restringido a perfil ADMINISTRADOR
  const auth = await assertIsAdmin();
  if (!auth.authorized) {
    throw new Error(
      auth.error ||
        "Acceso denegado: Solo el perfil ADMINISTRADOR puede importar y sincronizar colaboradores."
    );
  }

  let fileBuffer: Buffer;
  if (input instanceof FormData) {
    const file = input.get("file") as File | null;
    if (!file) {
      throw new Error("No se ha adjuntado ningún archivo Excel.");
    }
    const ab = await file.arrayBuffer();
    fileBuffer = Buffer.from(ab);
  } else if (input && typeof input === "object" && "fileBase64" in input) {
    fileBuffer = Buffer.from(input.fileBase64, "base64");
  } else {
    throw new Error("Formato de entrada no válido.");
  }

  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo Excel no contiene hojas válidas.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("La planilla Excel está vacía.");
  }

  // Detectar fila de encabezados (RUT, NOMBRE, CARGO)
  let headerRowIdx = -1;
  let rutColIdx = 0;
  let nombreColIdx = 1;
  let cargoColIdx = 2;

  const normalizeHeader = (val: any): string =>
    String(val ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const headers = row.map(normalizeHeader);

    const foundRut = headers.findIndex(
      (h) => h === "rut" || h.includes("rut") || h === "run" || h.includes("cedula")
    );
    const foundNombre = headers.findIndex(
      (h) =>
        h === "nombre" ||
        h.includes("nombre") ||
        h.includes("trabajador") ||
        h.includes("colaborador") ||
        h.includes("empleado")
    );
    const foundCargo = headers.findIndex(
      (h) =>
        h === "cargo" ||
        h.includes("cargo") ||
        h.includes("puesto") ||
        h.includes("funcion") ||
        h.includes("rol") ||
        h.includes("area")
    );

    if (foundRut !== -1 && (foundNombre !== -1 || foundCargo !== -1)) {
      headerRowIdx = i;
      rutColIdx = foundRut;
      nombreColIdx = foundNombre !== -1 ? foundNombre : foundRut + 1;
      cargoColIdx = foundCargo !== -1 ? foundCargo : nombreColIdx + 1;
      break;
    }
  }

  const dataRows = headerRowIdx !== -1 ? rawRows.slice(headerRowIdx + 1) : rawRows;
  const startRowNumber = headerRowIdx !== -1 ? headerRowIdx + 2 : 1;

  const erroresFila: Array<{ fila: number; mensaje: string }> = [];
  const nominaMap = new Map<
    string,
    { rut: string; nombre: string; cargo: string; fila: number }
  >();

  let totalFilasLeidas = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!Array.isArray(row)) continue;

    const rawRut = row[rutColIdx];
    const rawNombre = row[nombreColIdx];
    const rawCargo = row[cargoColIdx];

    // Ignorar filas completamente vacías
    if (
      !String(rawRut ?? "").trim() &&
      !String(rawNombre ?? "").trim() &&
      !String(rawCargo ?? "").trim()
    ) {
      continue;
    }

    totalFilasLeidas += 1;
    const filaNum = startRowNumber + i;

    const cleanRut = cleanColaboradorRut(rawRut);
    if (!cleanRut || cleanRut.length < 2 || !/^[0-9]+[0-9K]$/.test(cleanRut)) {
      erroresFila.push({
        fila: filaNum,
        mensaje: `RUT inválido o vacío ("${String(rawRut ?? "").trim()}")`,
      });
      continue;
    }

    const cleanNombre = String(rawNombre ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
    if (!cleanNombre) {
      erroresFila.push({
        fila: filaNum,
        mensaje: `Nombre vacío para el RUT ${formatRutDisplay(cleanRut)}`,
      });
      continue;
    }

    const cleanCargo =
      String(rawCargo ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase() || "SIN CARGO ESPECIFICADO";

    // Si el mismo RUT viene repetido dentro del mismo Excel, se consolida (sin duplicar)
    nominaMap.set(cleanRut, {
      rut: cleanRut,
      nombre: cleanNombre,
      cargo: cleanCargo,
      fila: filaNum,
    });
  }

  if (nominaMap.size === 0) {
    throw new Error(
      "No se encontraron registros válidos con columnas RUT, NOMBRE y CARGO en el archivo Excel."
    );
  }

  // Cargar universo actual de colaboradores (Local + Supabase)
  const existingList = await getColaboradoresAction(undefined, "ALL");
  const existingMap = new Map<string, MantenedorColaborador>();
  for (const col of existingList) {
    existingMap.set(cleanColaboradorRut(col.rut), col);
  }

  const now = new Date().toISOString();
  const detalleNuevos: Array<{ rut: string; nombre: string; cargo: string }> = [];
  const detalleInactivados: Array<{ rut: string; nombre: string; cargo: string }> = [];
  let actualizadosExistentes = 0;

  const finalMap = new Map<string, MantenedorColaborador>();

  // Regla 1: Prevención Estricta de Duplicados (Upsert / No Reingreso)
  for (const [cleanRut, row] of nominaMap.entries()) {
    const existing = existingMap.get(cleanRut);
    if (existing) {
      actualizadosExistentes += 1;
      finalMap.set(cleanRut, {
        ...existing,
        rut: cleanRut,
        nombre: row.nombre,
        cargo: row.cargo,
        activo: true,
        updated_at: now,
      });
    } else {
      const nuevo: MantenedorColaborador = {
        id: crypto.randomUUID(),
        rut: cleanRut,
        nombre: row.nombre,
        cargo: row.cargo,
        activo: true,
        created_at: now,
        updated_at: now,
      };
      finalMap.set(cleanRut, nuevo);
      detalleNuevos.push({
        rut: cleanRut,
        nombre: row.nombre,
        cargo: row.cargo,
      });
    }
  }

  // Regla 2: Inactivación Automática de Ausentes
  for (const [cleanRut, existing] of existingMap.entries()) {
    if (!nominaMap.has(cleanRut)) {
      const wasActive = existing.activo !== false;
      finalMap.set(cleanRut, {
        ...existing,
        rut: cleanRut,
        activo: false,
        updated_at: wasActive ? now : existing.updated_at || now,
      });
      if (wasActive) {
        detalleInactivados.push({
          rut: cleanRut,
          nombre: existing.nombre,
          cargo: existing.cargo,
        });
      }
    }
  }

  const consolidatedList = Array.from(finalMap.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );

  // Persistir en Base de Datos Local
  const db = readLocalDb();
  db.mantenedor_colaboradores = consolidatedList;
  writeLocalDb(db);

  // Persistir en Supabase si está configurado
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const payloadToUpsert = consolidatedList.map((c) => ({
        rut: c.rut,
        nombre: c.nombre,
        cargo: c.cargo,
        activo: c.activo,
        updated_at: now,
      }));

      // Upsert en lotes de 500 para máxima confiabilidad
      for (let i = 0; i < payloadToUpsert.length; i += 500) {
        const chunk = payloadToUpsert.slice(i, i + 500);
        await supabase
          .from("mantenedor_colaboradores")
          .upsert(chunk, { onConflict: "rut" });
      }
    } catch (err: any) {
      console.warn(`[Supabase sync mantenedor_colaboradores warning]: ${err?.message}`);
    }
  }

  revalidatePath("/configuracion/colaboradores");

  return {
    totalFilasLeidas,
    activosSincronizados: nominaMap.size,
    nuevosAgregados: detalleNuevos.length,
    actualizadosExistentes,
    pasadosANoActivo: detalleInactivados.length,
    detalleNuevos,
    detalleInactivados,
    erroresFila,
    colaboradores: consolidatedList,
  };
}
