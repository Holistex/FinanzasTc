"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  CalendarClock,
  X,
  Receipt,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import {
  LitigioComparendo,
  CuotaComparendo,
  EstadoCuotaComparendo,
} from "@/types/database.types";
import { cn, formatDateCL, formatCLP, formatCLPInput, parseCLPInput } from "@/lib/utils";

export interface CuotaDraftItem extends Partial<CuotaComparendo> {
  monto_raw?: string;
}

interface PlanCuotasModalProps {
  isOpen: boolean;
  onClose: () => void;
  comparendo: LitigioComparendo;
  onSaveAcuerdo: (
    comparendoId: string,
    montoTotal: number,
    cuotas: Array<Partial<CuotaComparendo>>
  ) => Promise<void>;
  canManage?: boolean;
}

export function PlanCuotasModal({
  isOpen,
  onClose,
  comparendo,
  onSaveAcuerdo,
  canManage = true,
}: PlanCuotasModalProps) {
  const [montoAcuerdoInput, setMontoAcuerdoInput] = useState<string>("");
  const [numCuotasInput, setNumCuotasInput] = useState<number>(3);
  const [cuotasDraft, setCuotasDraft] = useState<CuotaDraftItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inicializar estado al abrir el modal o cambiar el comparendo
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    const existingCuotas = comparendo.cuotas || [];
    const totalAcuerdo = Number(comparendo.monto_acuerdo_total || 0);

    // Formatear monto total con máscara CLP inicial
    if (totalAcuerdo > 0) {
      setMontoAcuerdoInput(formatCLPInput(totalAcuerdo));
    } else {
      setMontoAcuerdoInput("");
    }

    setNumCuotasInput(existingCuotas.length > 0 ? existingCuotas.length : 3);

    if (existingCuotas.length > 0) {
      setCuotasDraft(
        existingCuotas.map((q) => ({
          ...q,
          monto_raw: formatCLPInput(q.monto_cuota),
        }))
      );
    } else {
      // Si no tiene cuotas, inicializar 3 cuotas con monto por defecto si hay monto o vacío
      const defaultTotal = totalAcuerdo > 0 ? totalAcuerdo : 1500000;
      if (totalAcuerdo <= 0) {
        setMontoAcuerdoInput(formatCLPInput(defaultTotal));
      }
      generateDraftCuotas(defaultTotal, 3, comparendo.fecha_comparendo);
    }
  }, [isOpen, comparendo]);

  // Función para autogenerar cuotas mensuales equilibradas
  const generateDraftCuotas = (
    total: number,
    num: number,
    baseDateStr?: string
  ) => {
    const validNum = Math.max(1, Math.min(12, num));
    const baseAmount = Math.floor(total / validNum);
    const remainder = total - baseAmount * validNum;

    const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
    const newDraft: CuotaDraftItem[] = [];

    for (let i = 1; i <= validNum; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + (i - 1));

      // Última cuota absorbe el residuo del redondeo para cuadratura exacta
      const montoCuota = i === validNum ? baseAmount + remainder : baseAmount;

      newDraft.push({
        numero_cuota: i,
        monto_cuota: montoCuota,
        monto_raw: formatCLPInput(montoCuota),
        fecha_vencimiento_cuota: d.toISOString().slice(0, 10),
        estado_cuota: "PENDIENTE",
        fecha_pago_real: null,
      });
    }

    setCuotasDraft(newDraft);
  };

  // Botón "Recalcular / Generar Cuotas"
  const handleRegenerateCuotas = () => {
    const total = parseCLPInput(montoAcuerdoInput);
    if (total <= 0) {
      setErrorMessage("Ingrese un monto total válido para el acuerdo.");
      return;
    }
    setErrorMessage(null);
    generateDraftCuotas(
      total,
      numCuotasInput,
      comparendo.fecha_comparendo
    );
  };

  // Actualizar el monto de una cuota con enmascaramiento dinámico
  const handleUpdateCuotaMonto = (index: number, rawValue: string) => {
    const formatted = formatCLPInput(rawValue);
    const parsedNumber = parseCLPInput(rawValue);

    const updated = [...cuotasDraft];
    updated[index] = {
      ...updated[index],
      monto_cuota: parsedNumber,
      monto_raw: formatted,
    };
    setCuotasDraft(updated);
  };

  // Actualizar otros campos de la cuota (fecha, estado, etc.)
  const handleUpdateCuotaField = (
    index: number,
    field: keyof CuotaComparendo,
    value: any
  ) => {
    const updated = [...cuotasDraft];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };

    // Si se marca como PAGADA y no tiene fecha de pago, fijar la fecha actual
    if (field === "estado_cuota" && value === "PAGADA" && !updated[index].fecha_pago_real) {
      updated[index].fecha_pago_real = new Date().toISOString().slice(0, 10);
    }
    // Si se pasa a PENDIENTE, limpiar fecha de pago real
    if (field === "estado_cuota" && value === "PENDIENTE") {
      updated[index].fecha_pago_real = null;
    }

    setCuotasDraft(updated);
  };

  // Eliminar una cuota
  const handleRemoveCuota = (index: number) => {
    if (cuotasDraft.length <= 1) {
      alert("El plan de cuotas debe tener al menos 1 cuota.");
      return;
    }
    const updated = cuotasDraft
      .filter((_, idx) => idx !== index)
      .map((q, idx) => ({
        ...q,
        numero_cuota: idx + 1,
      }));
    setCuotasDraft(updated);
    setNumCuotasInput(updated.length);
  };

  // Agregar una cuota extra
  const handleAddCuota = () => {
    const nextNum = cuotasDraft.length + 1;
    const lastDate =
      cuotasDraft.length > 0 && cuotasDraft[cuotasDraft.length - 1].fecha_vencimiento_cuota
        ? new Date(cuotasDraft[cuotasDraft.length - 1].fecha_vencimiento_cuota!)
        : new Date();
    lastDate.setMonth(lastDate.getMonth() + 1);

    const updated: CuotaDraftItem[] = [
      ...cuotasDraft,
      {
        numero_cuota: nextNum,
        monto_cuota: 0,
        monto_raw: "",
        fecha_vencimiento_cuota: lastDate.toISOString().slice(0, 10),
        estado_cuota: "PENDIENTE" as EstadoCuotaComparendo,
        fecha_pago_real: null,
      },
    ];
    setCuotasDraft(updated);
    setNumCuotasInput(updated.length);
  };

  // Cálculos reactivos con números puros
  const totalMontoAcuerdoParsed = useMemo(() => {
    return parseCLPInput(montoAcuerdoInput);
  }, [montoAcuerdoInput]);

  const sumaMontoCuotas = useMemo(() => {
    return cuotasDraft.reduce((acc, q) => acc + (Number(q.monto_cuota) || 0), 0);
  }, [cuotasDraft]);

  const cuotasPagadasCount = useMemo(() => {
    return cuotasDraft.filter((q) => q.estado_cuota === "PAGADA").length;
  }, [cuotasDraft]);

  const montoTotalPagado = useMemo(() => {
    return cuotasDraft
      .filter((q) => q.estado_cuota === "PAGADA")
      .reduce((acc, q) => acc + (Number(q.monto_cuota) || 0), 0);
  }, [cuotasDraft]);

  const saldoPendiente = useMemo(() => {
    return Math.max(0, totalMontoAcuerdoParsed - montoTotalPagado);
  }, [totalMontoAcuerdoParsed, montoTotalPagado]);

  const is100PercentPaid = useMemo(() => {
    return (
      cuotasDraft.length > 0 &&
      cuotasDraft.every((q) => q.estado_cuota === "PAGADA")
    );
  }, [cuotasDraft]);

  // Guardar Plan de Cuotas
  const handleSave = async () => {
    setErrorMessage(null);

    if (totalMontoAcuerdoParsed <= 0) {
      setErrorMessage("El monto total del acuerdo debe ser mayor a $ 0.");
      return;
    }

    if (cuotasDraft.length === 0) {
      setErrorMessage("Debe definir al menos 1 cuota.");
      return;
    }

    // Validación de cuadratura
    if (Math.abs(sumaMontoCuotas - totalMontoAcuerdoParsed) > 10) {
      const confirmDiff = window.confirm(
        `La suma de las cuotas (${formatCLP(sumaMontoCuotas)}) no coincide exactamente con el monto total del acuerdo (${formatCLP(totalMontoAcuerdoParsed)}). ¿Desea continuar de todas formas?`
      );
      if (!confirmDiff) return;
    }

    setIsSubmitting(true);
    try {
      // Limpiar campos y enviar montos numéricos limpios a la Server Action
      const cleanedCuotas: Array<Partial<CuotaComparendo>> = cuotasDraft.map((q, idx) => ({
        id: q.id,
        comparendo_id: comparendo.id,
        numero_cuota: q.numero_cuota || idx + 1,
        monto_cuota: Number(q.monto_cuota || parseCLPInput(q.monto_raw)),
        fecha_vencimiento_cuota: q.fecha_vencimiento_cuota,
        estado_cuota: q.estado_cuota || "PENDIENTE",
        fecha_pago_real: q.estado_cuota === "PAGADA" ? q.fecha_pago_real : null,
      }));

      await onSaveAcuerdo(comparendo.id, totalMontoAcuerdoParsed, cleanedCuotas);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Error al guardar el plan de cuotas.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#E05A10] flex items-center justify-center shadow-xs">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Plan de Cuotas del Acuerdo
              </h2>
              <p className="text-[11px] text-slate-500">
                Reclamante: <strong className="text-slate-800">{comparendo.nombre_trabajador}</strong> · Citación: {formatDateCL(comparendo.fecha_comparendo)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Datos del Acuerdo: Monto Total y N° de Cuotas con Enmascaramiento Dinámico */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Condiciones Económicas del Acuerdo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              {/* Monto Total con Máscara Dinámica CLP */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Monto Total del Acuerdo ($ CLP) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={montoAcuerdoInput}
                    onChange={(e) => setMontoAcuerdoInput(formatCLPInput(e.target.value))}
                    placeholder="$ 2.400.000"
                    disabled={!canManage}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>
                {totalMontoAcuerdoParsed > 0 && (
                  <div className="text-[11px] font-mono font-semibold text-emerald-700 mt-1 flex items-center gap-1">
                    <span className="text-slate-500 font-sans font-normal">Monto detectado:</span>
                    <span>{formatCLP(totalMontoAcuerdoParsed)}</span>
                  </div>
                )}
              </div>

              {/* N° Cuotas y Botón Generar */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° de Cuotas
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={numCuotasInput}
                    onChange={(e) => setNumCuotasInput(Number(e.target.value))}
                    disabled={!canManage}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "Cuota" : "Cuotas"}
                      </option>
                    ))}
                  </select>
                  {canManage && (
                    <button
                      type="button"
                      onClick={handleRegenerateCuotas}
                      className="px-2.5 py-1.5 text-xs rounded-md bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors shrink-0 shadow-xs"
                      title="Calcular montos y fechas automáticas"
                    >
                      Generar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Grilla Dinámica de Cuotas Pactadas (Columna MONTO con Máscara CLP) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-slate-500" />
                <span>Cronograma de Cuotas Pactadas</span>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={handleAddCuota}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E05A10] hover:text-[#c94e0d]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agregar Cuota</span>
                </button>
              )}
            </div>

            {cuotasDraft.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                Haga clic en &ldquo;Generar&rdquo; para autogenerar las cuotas del acuerdo.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 shadow-2xs">
                {/* Header tabla cuotas */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  <div className="col-span-2">N° Cuota</div>
                  <div className="col-span-3 text-right">MONTO ($ CLP)</div>
                  <div className="col-span-3">Vencimiento</div>
                  <div className="col-span-3 text-center">Estado</div>
                  <div className="col-span-1 text-center">Acción</div>
                </div>

                {/* Fila de cada cuota */}
                {cuotasDraft.map((q, idx) => {
                  const isPagada = q.estado_cuota === "PAGADA";

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-xs transition-colors",
                        isPagada ? "bg-emerald-50/20" : "bg-white hover:bg-slate-50/50"
                      )}
                    >
                      {/* N° Cuota */}
                      <div className="col-span-2 font-semibold text-slate-800 flex items-center gap-1">
                        <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                          {q.numero_cuota || idx + 1}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          de {cuotasDraft.length}
                        </span>
                      </div>

                      {/* Monto de Cuota con Máscara Dinámica CLP */}
                      <div className="col-span-3 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={q.monto_raw !== undefined ? q.monto_raw : formatCLPInput(q.monto_cuota)}
                          onChange={(e) => handleUpdateCuotaMonto(idx, e.target.value)}
                          placeholder="$ 800.000"
                          disabled={!canManage}
                          className="w-full text-right font-mono font-bold px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#E05A10] bg-white text-slate-900"
                        />
                      </div>

                      {/* Fecha Vencimiento */}
                      <div className="col-span-3">
                        <input
                          type="date"
                          value={q.fecha_vencimiento_cuota || ""}
                          onChange={(e) =>
                            handleUpdateCuotaField(
                              idx,
                              "fecha_vencimiento_cuota",
                              e.target.value
                            )
                          }
                          disabled={!canManage}
                          className="w-full font-mono text-[11px] px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#E05A10] bg-white"
                        />
                      </div>

                      {/* Estado Cuota: Toggle o Select */}
                      <div className="col-span-3 flex items-center justify-center gap-1">
                        <select
                          value={q.estado_cuota || "PENDIENTE"}
                          onChange={(e) =>
                            handleUpdateCuotaField(
                              idx,
                              "estado_cuota",
                              e.target.value as EstadoCuotaComparendo
                            )
                          }
                          disabled={!canManage}
                          className={cn(
                            "w-full text-[11px] font-bold px-2 py-1 rounded border transition-colors",
                            isPagada
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          )}
                        >
                          <option value="PENDIENTE">🟡 PENDIENTE</option>
                          <option value="PAGADA">🟢 PAGADA</option>
                        </select>
                      </div>

                      {/* Acción eliminar cuota */}
                      <div className="col-span-1 text-center">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCuota(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Eliminar esta cuota"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Resumen y Regla de Cierre con Etiquetas Claras en CLP */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Suma cuotas:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCLP(sumaMontoCuotas)}
                </span>
                {Math.abs(sumaMontoCuotas - totalMontoAcuerdoParsed) > 10 ? (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                    Difiere en {formatCLP(Math.abs(sumaMontoCuotas - totalMontoAcuerdoParsed))}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                    Coincide al 100%
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Pagado:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatCLP(montoTotalPagado)}
                </span>
                <span className="text-[10px] text-slate-500">
                  ({cuotasPagadasCount} de {cuotasDraft.length} cuotas)
                </span>
              </div>
            </div>

            {/* Saldo Pendiente */}
            <div className="flex items-center justify-between text-xs pt-0.5 border-t border-slate-200/60">
              <span className="font-semibold text-slate-600">Saldo Pendiente:</span>
              <span className="font-mono font-bold text-amber-900">
                {formatCLP(saldoPendiente)}
              </span>
            </div>

            {/* Barra de progreso de pago */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  is100PercentPaid ? "bg-emerald-500" : "bg-[#E05A10]"
                )}
                style={{
                  width: `${
                    cuotasDraft.length > 0
                      ? Math.round((cuotasPagadasCount / cuotasDraft.length) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Regla de Cierre */}
            <div className="flex items-start gap-1.5 pt-1 text-[11px]">
              {is100PercentPaid ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Regla de Cierre activa: Al estar el 100% de las cuotas pagadas, el comparendo quedará como <strong>PAGADO TOTAL</strong> y se trasladará a la pestaña &ldquo;PAGADAS / ACUERDOS SALDADOS&rdquo;.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Info className="h-4 w-4 shrink-0 text-[#E05A10]" />
                  <span>
                    El comparendo mantendrá estado <strong>ACUERDO PAGO</strong> hasta que se marque como pagada la última cuota pactada.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción modal */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            {canManage && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#E05A10] hover:bg-[#c94e0d] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Guardando Acuerdo...</span>
                  </>
                ) : (
                  <span>Guardar Acuerdo y Cuotas</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
