"use client";

import React, { useState, useTransition, useEffect, useMemo, useRef } from "react";
import {
  X,
  Building2,
  Calendar,
  CreditCard,
  Layers,
  Banknote,
  Loader2,
  AlertCircle,
  FileCheck2,
  FileDiff,
  CheckCircle2,
  ArrowRight,
  Plus,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  Receipt,
  AlertTriangle,
  UserCheck,
  Search,
} from "lucide-react";
import {
  EmpresaConfirming,
  EmpresaFactoringProveedor,
  EstadoFacturaCompra,
  FacturaCompra,
  ChequeCompra,
  MantenedorColaborador,
  MantenedorON,
  MantenedorBanco,
} from "@/types/database.types";
import { getBancosAction } from "@/actions/mantenedores.actions";
import {
  cambiarEstadoCompraAction,
  editarFechaVencimientoCompraAction,
  netearFacturaCompraAction,
  registrarChequesCompraAction,
  eliminarChequeCompraAction,
  prorrogarChequeCompraAction,
} from "@/actions/facturas-compras.actions";
import { formatCLP, formatRutDisplay, normalizeRut } from "@/lib/utils";

interface CambiarEstadoCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  factura: FacturaCompra | null;
  factoringProveedores: EmpresaFactoringProveedor[];
  empresasConfirming: EmpresaConfirming[];
  colaboradores?: MantenedorColaborador[];
  catalogoOn?: MantenedorON[];
  todasLasFacturas?: FacturaCompra[];
}

interface ChequeCuotaRow {
  id: string;
  numeroCheque: string;
  bancoEmisor: string;
  fechaVencimiento: string;
  montoCapital: number;
  montoInteres: number;
  montoCheque: number;
  observacion?: string;
}

function formatClpInput(val: number | string): string {
  const num =
    typeof val === "number"
      ? Math.round(val)
      : Number(String(val || "").replace(/\D/g, ""));
  if (!num) return "";
  return num.toLocaleString("es-CL");
}

function parseClpInput(raw: string): number {
  const clean = String(raw || "").replace(/\D/g, "");
  return clean ? Number(clean) : 0;
}

export function CambiarEstadoCompraModal({
  isOpen,
  onClose,
  onSuccess,
  factura,
  factoringProveedores,
  empresasConfirming,
  colaboradores = [],
  catalogoOn = [],
  todasLasFacturas = [],
}: CambiarEstadoCompraModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [estado, setEstado] = useState<EstadoFacturaCompra>("DEUDA_PROVEEDOR");
  const [factoringProveedorId, setFactoringProveedorId] = useState<string>("");
  const [confirmingId, setConfirmingId] = useState<string>("");
  const [nuevaFechaVencimiento, setNuevaFechaVencimiento] = useState<string>("");

  // Compra TC states
  const [colaboradorId, setColaboradorId] = useState<string>("");
  const [colaboradorSearch, setColaboradorSearch] = useState<string>("");
  const [isColabDropdownOpen, setIsColabDropdownOpen] = useState<boolean>(false);
  const [onProyecto, setOnProyecto] = useState<string>("");
  const [observacionTc, setObservacionTc] = useState<string>("");
  const colabDropdownRef = useRef<HTMLDivElement>(null);

  // Cheque Mode: UNICO vs CUOTAS
  const [chequeMode, setChequeMode] = useState<"UNICO" | "CUOTAS">("UNICO");

  // Modo A (Único)
  const [numeroCheque, setNumeroCheque] = useState<string>("");
  const [fechaVencimientoCheque, setFechaVencimientoCheque] = useState<string>("");
  const [bancoEmisor, setBancoEmisor] = useState<string>("");
  const [montoChequeUnico, setMontoChequeUnico] = useState<number>(0);
  const [montoInteresUnico, setMontoInteresUnico] = useState<number>(0);

  // Modo B (Múltiples Cuotas)
  const [cuotasCheques, setCuotasCheques] = useState<ChequeCuotaRow[]>([]);
  const [showHistorialCheques, setShowHistorialCheques] = useState<boolean>(true);

  // Neteo NC
  const [selectedNcId, setSelectedNcId] = useState<string>("");

  // Edición directa de fecha de vencimiento general
  const [fechaVencimientoGeneral, setFechaVencimientoGeneral] = useState<string>("");

  // Filtrar Colaboradores Activos con búsqueda predictiva por Nombre o RUT
  const colaboradoresActivos = useMemo(() => {
    return colaboradores.filter((c) => c.activo !== false);
  }, [colaboradores]);

  const filteredColaboradores = useMemo(() => {
    const q = colaboradorSearch.trim().toLowerCase();
    if (!q) return colaboradoresActivos;
    const qCleanRut = q.replace(/[^0-9kk]/g, "");
    return colaboradoresActivos.filter((c) => {
      const matchNombre = c.nombre.toLowerCase().includes(q);
      const matchCargo = (c.cargo || "").toLowerCase().includes(q);
      const matchRutRaw = c.rut.toLowerCase().includes(q);
      const matchRutFormatted = formatRutDisplay(c.rut).toLowerCase().includes(q);
      const matchRutClean = qCleanRut.length > 0 && c.rut.toLowerCase().replace(/[^0-9kk]/g, "").includes(qCleanRut);
      return matchNombre || matchCargo || matchRutRaw || matchRutFormatted || matchRutClean;
    });
  }, [colaboradoresActivos, colaboradorSearch]);

  const selectedColaborador = useMemo(() => {
    return colaboradores.find((c) => c.id === colaboradorId) || null;
  }, [colaboradores, colaboradorId]);

  const proyectosOnActivos = useMemo(() => {
    return catalogoOn.filter((o) => o.activo !== false);
  }, [catalogoOn]);

  // Cerrar dropdown de colaborador al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colabDropdownRef.current && !colabDropdownRef.current.contains(event.target as Node)) {
        setIsColabDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtrar Notas de Crédito disponibles del mismo proveedor con saldo > 0
  const availableNCs = useMemo(() => {
    if (!factura) return [];
    const fRut = normalizeRut(factura.rut_proveedor);
    return todasLasFacturas.filter((item) => {
      if (item.tipo_doc !== 61) return false;
      if (item.id === factura.id) return false;
      if (normalizeRut(item.rut_proveedor) !== fRut) return false;
      const saldoDisp =
        item.saldo_restante_nc !== undefined
          ? item.saldo_restante_nc
          : item.monto_total;
      return saldoDisp > 0;
    });
  }, [factura, todasLasFacturas]);

  const [bancosCatalog, setBancosCatalog] = useState<MantenedorBanco[]>([]);

  useEffect(() => {
    getBancosAction(undefined, true)
      .then((list) => setBancosCatalog(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (factura) {
      const currentSaldo =
        factura.monto_saldo !== undefined ? factura.monto_saldo : factura.monto_total;

      setEstado(factura.estado || "DEUDA_PROVEEDOR");
      setFactoringProveedorId(
        factura.factoring_proveedor_id || (factoringProveedores[0]?.id ?? "")
      );
      setConfirmingId(
        factura.confirming_id || (empresasConfirming[0]?.id ?? "")
      );
      setNuevaFechaVencimiento(factura.fecha_vencimiento || "");
      setFechaVencimientoGeneral(factura.fecha_vencimiento || "");

      // Compra TC initial values
      const initColabId = factura.colaborador_id || "";
      setColaboradorId(initColabId);
      const initColab = colaboradores.find((c) => c.id === initColabId);
      setColaboradorSearch(
        initColab
          ? `${formatRutDisplay(initColab.rut)} — ${initColab.nombre} (${initColab.cargo || "SIN CARGO"})`
          : ""
      );
      setIsColabDropdownOpen(false);
      setOnProyecto(factura.on_proyecto || "");
      setObservacionTc(factura.observacion_tc || "");

      // Modo A initial values
      setNumeroCheque(factura.numero_cheque || "");
      setFechaVencimientoCheque(factura.fecha_vencimiento_cheque || factura.fecha_vencimiento || "");
      setBancoEmisor(factura.banco_emisor || "Banco de Chile");
      setMontoChequeUnico(currentSaldo);
      setMontoInteresUnico(0);

      // Modo B initial rows
      const half = Math.floor(currentSaldo / 2);
      setCuotasCheques([
        {
          id: `cuota-${Date.now()}-1`,
          numeroCheque: "",
          bancoEmisor: factura.banco_emisor || "Banco de Chile",
          fechaVencimiento: factura.fecha_vencimiento || new Date().toISOString().split("T")[0],
          montoCapital: half > 0 ? half : currentSaldo,
          montoInteres: 0,
          montoCheque: half > 0 ? half : currentSaldo,
        },
        {
          id: `cuota-${Date.now()}-2`,
          numeroCheque: "",
          bancoEmisor: factura.banco_emisor || "Banco de Chile",
          fechaVencimiento: "",
          montoCapital: currentSaldo - (half > 0 ? half : currentSaldo),
          montoInteres: 0,
          montoCheque: currentSaldo - (half > 0 ? half : currentSaldo),
        },
      ]);

      setSelectedNcId(availableNCs[0]?.id ?? "");
      setErrorMessage(null);
    }
  }, [factura, factoringProveedores, empresasConfirming, colaboradores, availableNCs]);

  if (!isOpen || !factura) return null;

  // Cálculos de saldo de Neteo
  const selectedNc = availableNCs.find((n) => n.id === selectedNcId) || null;
  const saldoActualFactura =
    factura.monto_saldo !== undefined ? factura.monto_saldo : factura.monto_total;
  const saldoDisponibleNc = selectedNc
    ? selectedNc.saldo_restante_nc !== undefined
      ? selectedNc.saldo_restante_nc
      : selectedNc.monto_total
    : 0;
  const montoANetear = Math.min(saldoActualFactura, saldoDisponibleNc);
  const nuevoSaldoPendienteNeteo = Math.max(0, saldoActualFactura - montoANetear);

  // Cálculos de cheques (Capital aplicado vs Intereses)
  const totalCapitalModoB = cuotasCheques.reduce(
    (sum, c) => sum + (Number(c.montoCapital) || 0),
    0
  );
  const totalInteresModoB = cuotasCheques.reduce(
    (sum, c) => sum + (Number(c.montoInteres) || 0),
    0
  );
  const totalChequesModoB = cuotasCheques.reduce(
    (sum, c) => sum + ((Number(c.montoCapital) || 0) + (Number(c.montoInteres) || 0)),
    0
  );
  const totalCapitalIngresado =
    chequeMode === "UNICO" ? Number(montoChequeUnico) || 0 : totalCapitalModoB;
  const totalTotalChequeUnico =
    (Number(montoChequeUnico) || 0) + (Number(montoInteresUnico) || 0);
  const diferenciaSaldoCheques = Math.max(0, saldoActualFactura - totalCapitalIngresado);
  const excesoSaldoCheques = Math.max(0, totalCapitalIngresado - saldoActualFactura);

  // Detectar si un folio de cheque ya existe en otras facturas (aviso informativo no bloqueante)
  const getFolioReuseInfo = (numChequeRaw: string, bancoRaw: string) => {
    const num = numChequeRaw.trim().toLowerCase();
    if (!num) return null;
    const banco = bancoRaw.trim().toLowerCase();
    let sumaPrevia = 0;
    const facturaIds = new Set<string>();
    for (const f of todasLasFacturas) {
      if (f.id === factura.id) continue;
      for (const ch of f.cheques || []) {
        const chNum = String(ch.numero_cheque || "").trim().toLowerCase();
        const chBanco = String(ch.banco_emisor || "").trim().toLowerCase();
        if (chNum === num && (!banco || !chBanco || chBanco === banco)) {
          sumaPrevia += Number(ch.monto_cheque || 0);
          facturaIds.add(f.id);
        }
      }
    }
    if (facturaIds.size === 0) return null;
    return { sumaPrevia, cantidadFacturas: facturaIds.size };
  };
  const folioUnicoReuseInfo = getFolioReuseInfo(numeroCheque, bancoEmisor);

  // Manejo de cuotas dinámicas
  const handleAddCuota = () => {
    const defaultMonto = Math.max(0, saldoActualFactura - totalCapitalModoB);
    const lastRow = cuotasCheques[cuotasCheques.length - 1];
    let nextDate = "";
    if (lastRow?.fechaVencimiento) {
      try {
        const d = new Date(lastRow.fechaVencimiento);
        d.setDate(d.getDate() + 30);
        nextDate = d.toISOString().split("T")[0];
      } catch {
        nextDate = "";
      }
    }

    setCuotasCheques((prev) => [
      ...prev,
      {
        id: `cuota-${Date.now()}-${prev.length + 1}`,
        numeroCheque: "",
        bancoEmisor: lastRow?.bancoEmisor || "Banco de Chile",
        fechaVencimiento: nextDate,
        montoCapital: defaultMonto,
        montoInteres: 0,
        montoCheque: defaultMonto,
      },
    ]);
  };

  const handleRemoveCuota = (id: string) => {
    if (cuotasCheques.length <= 1) return;
    setCuotasCheques((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateCuota = (
    id: string,
    field: keyof ChequeCuotaRow,
    value: string | number
  ) => {
    setCuotasCheques((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleDeletePrevioCheque = (chequeId: string) => {
    if (
      !confirm(
        "¿Está seguro de anular/eliminar este cheque emitido? El saldo será reintegrado a la factura."
      )
    ) {
      return;
    }

    startTransition(async () => {
      const res = await eliminarChequeCompraAction(chequeId);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "Error al eliminar el cheque.");
      }
    });
  };

  const handleProrrogarChequePrevio = (chequeId: string, nuevaFecha: string) => {
    if (!nuevaFecha || !factura) return;
    startTransition(async () => {
      const res = await prorrogarChequeCompraAction({
        facturaId: factura.id,
        chequeId,
        nuevaFechaVencimiento: nuevaFecha,
      });
      if (res.success) {
        onSuccess();
      } else {
        setErrorMessage(res.error || "Error al prorrogar el cheque.");
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validaciones
    if (estado === "FACTORING" && !factoringProveedorId) {
      setErrorMessage("Debe seleccionar una empresa de Factoring para proveedores.");
      return;
    }

    if (estado === "CONFIRMING") {
      if (!confirmingId) {
        setErrorMessage("Debe seleccionar una entidad de Confirming.");
        return;
      }
      if (!nuevaFechaVencimiento) {
        setErrorMessage("Debe ingresar la nueva fecha de vencimiento asignada por Confirming.");
        return;
      }
    }

    if (estado === "CHEQUE") {
      if (chequeMode === "UNICO") {
        if (!numeroCheque.trim()) {
          setErrorMessage("Debe ingresar el número de cheque.");
          return;
        }
        if (!fechaVencimientoCheque) {
          setErrorMessage("Debe ingresar la fecha de vencimiento / cobro del cheque.");
          return;
        }
        if (!bancoEmisor.trim()) {
          setErrorMessage("Debe especificar el banco emisor del cheque.");
          return;
        }
        if (!montoChequeUnico || montoChequeUnico <= 0) {
          setErrorMessage("El monto a aplicar debe ser mayor a $0.");
          return;
        }
        if (montoChequeUnico > saldoActualFactura) {
          setErrorMessage(
            `El monto a aplicar (${formatCLP(montoChequeUnico)}) no puede superar el saldo pendiente (${formatCLP(saldoActualFactura)}).`
          );
          return;
        }
      } else {
        // Múltiples cheques (Modo B)
        if (cuotasCheques.length === 0) {
          setErrorMessage("Debe ingresar al menos un cheque en cuotas.");
          return;
        }
        for (let i = 0; i < cuotasCheques.length; i++) {
          const c = cuotasCheques[i];
          if (!c.numeroCheque.trim()) {
            setErrorMessage(`La cuota #${i + 1} no tiene número de cheque.`);
            return;
          }
          if (!c.bancoEmisor.trim()) {
            setErrorMessage(`La cuota #${i + 1} (${c.numeroCheque}) no tiene banco emisor.`);
            return;
          }
          if (!c.fechaVencimiento) {
            setErrorMessage(`La cuota #${i + 1} (${c.numeroCheque}) no tiene fecha de vencimiento.`);
            return;
          }
          if (!c.montoCapital || c.montoCapital <= 0) {
            setErrorMessage(`La cuota #${i + 1} (${c.numeroCheque}) debe tener un capital mayor a $0.`);
            return;
          }
        }
        if (totalCapitalModoB > saldoActualFactura) {
          setErrorMessage(
            `La suma del capital aplicado (${formatCLP(totalCapitalModoB)}) supera el saldo pendiente de la factura (${formatCLP(saldoActualFactura)}).`
          );
          return;
        }
      }
    }

    if (estado === "NETEO_NC") {
      if (!selectedNcId) {
        setErrorMessage("Debe seleccionar una Nota de Crédito disponible para realizar el neteo.");
        return;
      }
      if (montoANetear <= 0) {
        setErrorMessage("No hay monto disponible para realizar el neteo.");
        return;
      }
    }

    if (estado === "COMPRA_TC") {
      if (!colaboradorId) {
        setErrorMessage("Debe seleccionar un colaborador o trabajador responsable para Compra TC.");
        return;
      }
    }

    startTransition(async () => {
      try {
        // CASO 1: NETEO NC
        if (estado === "NETEO_NC") {
          const resNeteo = await netearFacturaCompraAction({
            facturaId: factura.id,
            notaCreditoId: selectedNcId,
            rutProveedor: factura.rut_proveedor,
            folioFactura: factura.folio,
            montoNeteo: montoANetear,
          });

          if (resNeteo.success) {
            onSuccess();
            onClose();
          } else {
            setErrorMessage(resNeteo.error || "Error al realizar el neteo de la factura.");
          }
          return;
        }

        // CASO 2: CHEQUES (Modo A o Modo B con registrarChequesCompraAction)
        if (estado === "CHEQUE") {
          const chequesPayload =
            chequeMode === "UNICO"
              ? [
                  {
                    numeroCheque: numeroCheque.trim(),
                    bancoEmisor: bancoEmisor.trim(),
                    fechaVencimiento: fechaVencimientoCheque,
                    montoCapital: Number(montoChequeUnico) || 0,
                    montoInteres: Number(montoInteresUnico) || 0,
                    montoCheque:
                      (Number(montoChequeUnico) || 0) +
                      (Number(montoInteresUnico) || 0),
                  },
                ]
              : cuotasCheques.map((c) => {
                  const cap = Number(c.montoCapital) || 0;
                  const intr = Number(c.montoInteres) || 0;
                  return {
                    numeroCheque: c.numeroCheque.trim(),
                    bancoEmisor: c.bancoEmisor.trim(),
                    fechaVencimiento: c.fechaVencimiento,
                    montoCapital: cap,
                    montoInteres: intr,
                    montoCheque: cap + intr,
                    observacion: c.observacion,
                  };
                });

          const resCheques = await registrarChequesCompraAction({
            facturaId: factura.id,
            folio: factura.folio,
            rutProveedor: factura.rut_proveedor,
            cheques: chequesPayload,
          });

          if (resCheques.success) {
            onSuccess();
            onClose();
          } else {
            setErrorMessage(resCheques.error || "Error al registrar cheques de compra.");
          }
          return;
        }

        // CASO 3: MODALIDADES REGULARES (DEUDA DIRECTA, FACTORING, CONFIRMING, COMPRA_TC)
        if (
          fechaVencimientoGeneral !== factura.fecha_vencimiento &&
          estado !== "CONFIRMING" &&
          estado !== "COMPRA_TC"
        ) {
          const resDate = await editarFechaVencimientoCompraAction(factura.id, fechaVencimientoGeneral);
          if (!resDate.success) {
            setErrorMessage(resDate.error || "Error al actualizar la fecha de vencimiento");
            return;
          }
        }

        const result = await cambiarEstadoCompraAction({
          id: factura.id,
          estado,
          factoringProveedorId: estado === "FACTORING" ? factoringProveedorId : null,
          factoringId: estado === "FACTORING" ? factoringProveedorId : null,
          confirmingId: estado === "CONFIRMING" ? confirmingId : null,
          nuevaFechaVencimiento: estado === "CONFIRMING" ? nuevaFechaVencimiento : null,
          colaboradorId: estado === "COMPRA_TC" ? colaboradorId : null,
          onProyecto: estado === "COMPRA_TC" ? onProyecto || null : null,
          observacionTc: estado === "COMPRA_TC" ? observacionTc || null : null,
        });

        if (result.success) {
          onSuccess();
          onClose();
        } else {
          setErrorMessage(result.error || "Error al actualizar el estado de la factura.");
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-[95vw] sm:w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-sm">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Gestión de Estado & Modalidad de Pago
              </h2>
              <p className="text-xs text-slate-300">
                Folio #{factura.folio} — DTE {factura.tipo_doc === 61 ? "61 (Nota de Crédito)" : "33 (Factura Electrónica)"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen Factura */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block font-medium">Proveedor:</span>
            <span className="font-semibold text-slate-800 truncate block" title={factura.razon_social}>
              {factura.razon_social}
            </span>
            <span className="text-slate-500 font-mono text-[11px]">{formatRutDisplay(factura.rut_proveedor)}</span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium">Saldo Pendiente:</span>
            <span className={`font-bold text-sm ${factura.tipo_doc === 61 ? "text-rose-600" : "text-slate-900 font-mono"}`}>
              {formatCLP(saldoActualFactura)}
            </span>
            {saldoActualFactura < factura.monto_total && (
              <span className="text-[10px] text-slate-400 block line-through font-mono">
                Total: {formatCLP(factura.monto_total)}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-500 block font-medium">Emisión:</span>
            <span className="font-medium text-slate-700">{factura.fecha_docto || "—"}</span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium">Vencimiento Actual:</span>
            <span className="font-semibold text-amber-700">{factura.fecha_vencimiento || "—"}</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector de Estado / Modalidad */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Modalidad / Estado de Pago <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {/* DEUDA_PROVEEDOR */}
              <button
                type="button"
                onClick={() => setEstado("DEUDA_PROVEEDOR")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "DEUDA_PROVEEDOR"
                    ? "border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <Building2 className={`h-4 w-4 mb-1.5 ${estado === "DEUDA_PROVEEDOR" ? "text-blue-600" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Deuda Directa</span>
              </button>

              {/* FACTORING */}
              <button
                type="button"
                onClick={() => setEstado("FACTORING")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "FACTORING"
                    ? "border-purple-600 bg-purple-50/80 text-purple-900 font-semibold ring-2 ring-purple-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <Layers className={`h-4 w-4 mb-1.5 ${estado === "FACTORING" ? "text-purple-600" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Factoring</span>
              </button>

              {/* CONFIRMING */}
              <button
                type="button"
                onClick={() => setEstado("CONFIRMING")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "CONFIRMING"
                    ? "border-emerald-600 bg-emerald-50/80 text-emerald-900 font-semibold ring-2 ring-emerald-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <CreditCard className={`h-4 w-4 mb-1.5 ${estado === "CONFIRMING" ? "text-emerald-600" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Confirming</span>
              </button>

              {/* CHEQUE */}
              <button
                type="button"
                onClick={() => setEstado("CHEQUE")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "CHEQUE"
                    ? "border-amber-600 bg-amber-50/80 text-amber-900 font-semibold ring-2 ring-amber-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <Banknote className={`h-4 w-4 mb-1.5 ${estado === "CHEQUE" ? "text-amber-600" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Cheque</span>
              </button>

              {/* NETEO NC */}
              <button
                type="button"
                onClick={() => setEstado("NETEO_NC")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "NETEO_NC"
                    ? "border-rose-600 bg-rose-50/80 text-rose-900 font-semibold ring-2 ring-rose-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <FileDiff className={`h-4 w-4 mb-1.5 ${estado === "NETEO_NC" ? "text-rose-600" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Neteo NC</span>
              </button>

              {/* COMPRA TC */}
              <button
                type="button"
                onClick={() => setEstado("COMPRA_TC")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${
                  estado === "COMPRA_TC"
                    ? "border-[#E05A10] bg-orange-50/80 text-orange-950 font-semibold ring-2 ring-orange-500/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                }`}
              >
                <UserCheck className={`h-4 w-4 mb-1.5 ${estado === "COMPRA_TC" ? "text-[#E05A10]" : "text-slate-400"}`} />
                <span className="text-[11px] leading-tight">Compra TC</span>
              </button>
            </div>
          </div>

          {/* Subcampos según Estado */}
          {/* 1. FACTORING */}
          {estado === "FACTORING" && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <label className="block text-xs font-semibold text-purple-900">
                Seleccione Empresa de Factoring Proveedores <span className="text-red-500">*</span>
              </label>
              {factoringProveedores.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                  No hay entidades de Factoring Proveedores registradas. Configure una en Mantenedores Factoring.
                </p>
              ) : (
                <select
                  value={factoringProveedorId}
                  onChange={(e) => setFactoringProveedorId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- Seleccionar Factoring --</option>
                  {factoringProveedores.map((fp) => (
                    <option key={fp.id} value={fp.id}>
                      {fp.razon_social} {fp.rut_proveedor && fp.rut_proveedor.length > 5 ? `(${formatRutDisplay(fp.rut_proveedor)})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 2. CONFIRMING */}
          {estado === "CONFIRMING" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-emerald-900 mb-1">
                  Entidad de Confirming Bancario <span className="text-red-500">*</span>
                </label>
                {empresasConfirming.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                    No hay entidades de Confirming registradas. Configure una en Mantenedores Factoring.
                  </p>
                ) : (
                  <select
                    value={confirmingId}
                    onChange={(e) => setConfirmingId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Seleccionar Confirming --</option>
                    {empresasConfirming.map((ec) => (
                      <option key={ec.id} value={ec.id}>
                        {ec.razon_social} ({formatRutDisplay(ec.rut_confirming)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-900 mb-1">
                  Nueva Fecha de Vencimiento Asignada (Confirming) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={nuevaFechaVencimiento}
                  onChange={(e) => setNuevaFechaVencimiento(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Esta fecha reemplazará la fecha de vencimiento original de la factura para reflejar el plazo extendido de Confirming.
                </p>
              </div>
            </div>
          )}

          {/* 3. CHEQUE: MODO A & MODO B */}
          {estado === "CHEQUE" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
              {/* Selector de Modo Cheque */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-amber-600" />
                    Modalidad de Emisión de Cheque
                  </span>
                  <span className="text-[11px] text-amber-700 font-medium">
                    Saldo a Cubrir: <strong className="font-mono">{formatCLP(saldoActualFactura)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-amber-100/60 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setChequeMode("UNICO")}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      chequeMode === "UNICO"
                        ? "bg-white text-amber-900 shadow-xs font-bold border border-amber-200"
                        : "text-amber-800 hover:text-amber-950"
                    }`}
                  >
                    Modo A: Cheque Único (Rápido)
                  </button>
                  <button
                    type="button"
                    onClick={() => setChequeMode("CUOTAS")}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      chequeMode === "CUOTAS"
                        ? "bg-white text-amber-900 shadow-xs font-bold border border-amber-200"
                        : "text-amber-800 hover:text-amber-950"
                    }`}
                  >
                    Modo B: Emisión Múltiple / Cuotas
                  </button>
                </div>
              </div>

              {/* MODO A: CHEQUE ÚNICO */}
              {chequeMode === "UNICO" && (
                <div className="bg-white rounded-lg border border-amber-200/80 p-3.5 space-y-3 shadow-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Número de Cheque <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={numeroCheque}
                        onChange={(e) => setNumeroCheque(e.target.value)}
                        placeholder="Ej. 1045892"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Banco Emisor <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={bancoEmisor}
                        onChange={(e) => setBancoEmisor(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="" disabled>
                          Seleccione banco...
                        </option>
                        {bancoEmisor &&
                          !bancosCatalog.some((b) => b.nombre === bancoEmisor) && (
                            <option value={bancoEmisor}>{bancoEmisor}</option>
                          )}
                        {bancosCatalog.map((b) => (
                          <option key={b.id} value={b.nombre}>
                            {b.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Fecha Vencimiento / Cobro <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={fechaVencimientoCheque}
                        onChange={(e) => setFechaVencimientoCheque(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Monto a Aplicar ($ CLP) <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setMontoChequeUnico(saldoActualFactura)}
                            className="text-[10px] text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded font-medium"
                          >
                            100%
                          </button>
                          <button
                            type="button"
                            onClick={() => setMontoChequeUnico(Math.round(saldoActualFactura / 2))}
                            className="text-[10px] text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded font-medium"
                          >
                            50%
                          </button>
                        </div>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                          $
                        </span>
                        <input
                          type="text"
                          value={formatClpInput(montoChequeUnico)}
                          onChange={(e) => setMontoChequeUnico(parseClpInput(e.target.value))}
                          placeholder="0"
                          className="w-full rounded-md border border-slate-300 bg-white pl-6 pr-3 py-2 text-xs text-slate-800 font-mono font-bold text-right shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Monto Interés ($ CLP)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                          $
                        </span>
                        <input
                          type="text"
                          value={montoInteresUnico > 0 ? formatClpInput(montoInteresUnico) : ""}
                          onChange={(e) => setMontoInteresUnico(parseClpInput(e.target.value))}
                          placeholder="0"
                          className="w-full rounded-md border border-slate-300 bg-white pl-6 pr-3 py-2 text-xs text-slate-800 font-mono text-right shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Aviso informativo de reutilización de folio */}
                  {folioUnicoReuseInfo && (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-[11px] text-blue-900">
                      <AlertTriangle className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        El Cheque <strong>#{numeroCheque.trim()}</strong> ya tiene asignaciones previas por{" "}
                        <strong className="font-mono">{formatCLP(folioUnicoReuseInfo.sumaPrevia)}</strong> en{" "}
                        <strong>{folioUnicoReuseInfo.cantidadFacturas}</strong> factura(s). Esta asignación se sumará al mismo folio de cheque.
                      </span>
                    </div>
                  )}

                  {/* Resumen en vivo Capital + Interés = Total Cheque */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Capital aplicado a factura:</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {formatCLP(montoChequeUnico)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Interés incluido en cheque:</span>
                      <span className="font-mono font-semibold text-amber-800">
                        {formatCLP(montoInteresUnico)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-amber-200 pt-1 font-bold text-amber-950">
                      <span>Monto Total del Cheque (Compromiso):</span>
                      <span className="font-mono text-sm">
                        {formatCLP(totalTotalChequeUnico)}
                      </span>
                    </div>
                  </div>

                  {/* Feedback Modo A */}
                  <div className="pt-2 border-t border-slate-100 text-xs">
                    {montoChequeUnico === saldoActualFactura ? (
                      <div className="flex items-center gap-1.5 text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                        <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Cheque Emitido (Compromiso Activo):</strong> Este cheque cubre el total del saldo pendiente (<strong>{formatCLP(montoChequeUnico)}</strong>). El saldo permanecerá activo como compromiso financiero hasta que se confirme su cobro o pago manual.
                        </span>
                      </div>
                    ) : montoChequeUnico > 0 && montoChequeUnico < saldoActualFactura ? (
                      <div className="flex items-start gap-1.5 text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                        <ArrowRight className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span>
                            <strong>Abono Parcial por Cheque:</strong> Se abonarán <strong>{formatCLP(montoChequeUnico)}</strong>.
                          </span>
                          <span className="block text-[11px] text-amber-700 mt-0.5">
                            Quedará un saldo deudor pendiente de <strong>{formatCLP(saldoActualFactura - montoChequeUnico)}</strong> en Deuda Proveedor.
                          </span>
                        </div>
                      </div>
                    ) : montoChequeUnico > saldoActualFactura ? (
                      <div className="flex items-center gap-1.5 text-red-800 bg-red-50 p-2.5 rounded-lg border border-red-200">
                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                        <span>
                          El monto ingresado excede el saldo pendiente en {formatCLP(montoChequeUnico - saldoActualFactura)}.
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* MODO B: EMISIÓN MÚLTIPLE / CUOTAS A FECHA */}
              {chequeMode === "CUOTAS" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber-900 font-medium">
                      Fraccione el pago de la factura en múltiples cheques con vencimiento a plazo:
                    </p>
                    <button
                      type="button"
                      onClick={handleAddCuota}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Agregar Cheque</span>
                    </button>
                  </div>

                  {/* Lista de Filas Dinámicas */}
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {cuotasCheques.map((cuota, index) => (
                      <div
                        key={cuota.id}
                        className="bg-white rounded-lg border border-amber-200/90 p-3 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b border-slate-100 pb-1">
                          <span className="flex items-center gap-1.5 text-amber-900">
                            <Receipt className="h-3.5 w-3.5 text-amber-600" />
                            Cheque / Cuota #{index + 1}
                          </span>
                          {cuotasCheques.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCuota(cuota.id)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                              title="Eliminar esta cuota"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              N° Cheque <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={cuota.numeroCheque}
                              onChange={(e) =>
                                handleUpdateCuota(cuota.id, "numeroCheque", e.target.value)
                              }
                              placeholder="Ej. 10041"
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              Banco Emisor <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={cuota.bancoEmisor}
                              onChange={(e) =>
                                handleUpdateCuota(cuota.id, "bancoEmisor", e.target.value)
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                            >
                              <option value="" disabled>
                                Seleccione banco...
                              </option>
                              {cuota.bancoEmisor &&
                                !bancosCatalog.some((b) => b.nombre === cuota.bancoEmisor) && (
                                  <option value={cuota.bancoEmisor}>{cuota.bancoEmisor}</option>
                                )}
                              {bancosCatalog.map((b) => (
                                <option key={b.id} value={b.nombre}>
                                  {b.nombre}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              Fecha Cobro <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={cuota.fechaVencimiento}
                              onChange={(e) =>
                                handleUpdateCuota(cuota.id, "fechaVencimiento", e.target.value)
                              }
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              Capital ($ CLP) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                                $
                              </span>
                              <input
                                type="text"
                                value={formatClpInput(cuota.montoCapital)}
                                onChange={(e) => {
                                  const cap = parseClpInput(e.target.value);
                                  setCuotasCheques((prev) =>
                                    prev.map((row) =>
                                      row.id === cuota.id
                                        ? {
                                            ...row,
                                            montoCapital: cap,
                                            montoCheque: cap + (Number(row.montoInteres) || 0),
                                          }
                                        : row
                                    )
                                  );
                                }}
                                placeholder="0"
                                className="w-full rounded border border-slate-300 bg-white pl-5 pr-2 py-1.5 text-xs font-mono text-right text-slate-800 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              Interés ($ CLP)
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                                $
                              </span>
                              <input
                                type="text"
                                value={
                                  cuota.montoInteres > 0
                                    ? formatClpInput(cuota.montoInteres)
                                    : ""
                                }
                                onChange={(e) => {
                                  const intr = parseClpInput(e.target.value);
                                  setCuotasCheques((prev) =>
                                    prev.map((row) =>
                                      row.id === cuota.id
                                        ? {
                                            ...row,
                                            montoInteres: intr,
                                            montoCheque: (Number(row.montoCapital) || 0) + intr,
                                          }
                                        : row
                                    )
                                  );
                                }}
                                placeholder="0"
                                className="w-full rounded border border-slate-300 bg-white pl-5 pr-2 py-1.5 text-xs font-mono text-right text-slate-800 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                        {(() => {
                          const reuse = getFolioReuseInfo(cuota.numeroCheque, cuota.bancoEmisor);
                          if (!reuse) return null;
                          return (
                            <div className="text-[10px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                              Folio <strong>#{cuota.numeroCheque.trim()}</strong> ya usado por{" "}
                              <strong className="font-mono">{formatCLP(reuse.sumaPrevia)}</strong> en{" "}
                              {reuse.cantidadFacturas} factura(s).
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>

                  {/* Panel de Balance Financiero en Tiempo Real */}
                  <div className="rounded-lg bg-amber-100/70 border border-amber-300/80 p-3 space-y-2 text-xs">
                    <div className="font-bold text-amber-950 uppercase tracking-wider text-[11px] border-b border-amber-200 pb-1">
                      Balance Financiero de la Emisión
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-white/80 rounded p-1.5 border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Saldo a Cubrir</span>
                        <span className="font-bold text-xs text-slate-800 font-mono">
                          {formatCLP(saldoActualFactura)}
                        </span>
                      </div>

                      <div className="bg-white/80 rounded p-1.5 border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Capital Aplicado</span>
                        <span className="font-bold text-xs text-slate-900 font-mono">
                          {formatCLP(totalCapitalModoB)}
                        </span>
                      </div>

                      <div className="bg-white/80 rounded p-1.5 border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Total Intereses</span>
                        <span className="font-bold text-xs text-amber-700 font-mono">
                          {formatCLP(totalInteresModoB)}
                        </span>
                      </div>

                      <div className="bg-white/80 rounded p-1.5 border border-amber-200">
                        <span className="text-[10px] text-slate-500 block">Total Cheques</span>
                        <span className="font-bold text-xs text-amber-900 font-mono">
                          {formatCLP(totalChequesModoB)}
                        </span>
                      </div>
                    </div>

                    {/* Estado del balance */}
                    <div className="pt-1">
                      {totalCapitalModoB === saldoActualFactura && (
                        <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200 text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>
                            <strong>Factura Saldada 100%:</strong> El capital aplicado de los {cuotasCheques.length} cheques cubre exactamente el saldo total. La factura pasará a estado <strong>CHEQUE</strong>.
                          </span>
                        </div>
                      )}

                      {totalCapitalModoB > 0 && totalCapitalModoB < saldoActualFactura && (
                        <div className="flex items-center gap-1.5 text-amber-900 bg-amber-50 p-2 rounded border border-amber-200 text-[11px]">
                          <ArrowRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span>
                            <strong>Abono Parcial por Cheques:</strong> Se registrarán {cuotasCheques.length} cuotas por capital de <strong>{formatCLP(totalCapitalModoB)}</strong> (Total cheques: <strong>{formatCLP(totalChequesModoB)}</strong>). El remanente de <strong>{formatCLP(diferenciaSaldoCheques)}</strong> quedará en <strong>Deuda Proveedor</strong>.
                          </span>
                        </div>
                      )}

                      {totalCapitalModoB > saldoActualFactura && (
                        <div className="flex items-center gap-1.5 text-red-900 bg-red-50 p-2 rounded border border-red-200 text-[11px]">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          <span>
                            <strong>Exceso de Capital:</strong> El capital aplicado supera el saldo pendiente por <strong>{formatCLP(excesoSaldoCheques)}</strong>. Ajuste los montos antes de guardar.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Historial de cheques previamente emitidos para esta factura */}
              {factura.cheques && factura.cheques.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowHistorialCheques(!showHistorialCheques)}
                    className="w-full flex items-center justify-between text-slate-700 font-semibold text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      Cheques Registrados Previamente ({factura.cheques.length})
                    </span>
                    {showHistorialCheques ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {showHistorialCheques && (
                    <div className="overflow-x-auto pt-1">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                            <th className="py-1 px-2">N° Cheque</th>
                            <th className="py-1 px-2">Banco</th>
                            <th className="py-1 px-2">Vencimiento / Prórroga</th>
                            <th className="py-1 px-2 text-right">Monto</th>
                            <th className="py-1 px-2 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {factura.cheques.map((c: ChequeCompra) => (
                            <tr key={c.id} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2 font-mono font-medium text-slate-800">
                                #{c.numero_cheque}
                              </td>
                              <td className="py-1.5 px-2 text-slate-600">{c.banco_emisor}</td>
                              <td className="py-1.5 px-2 text-slate-600">
                                <input
                                  type="date"
                                  defaultValue={c.fecha_vencimiento}
                                  onBlur={(e) => {
                                    if (e.target.value && e.target.value !== c.fecha_vencimiento) {
                                      handleProrrogarChequePrevio(c.id, e.target.value);
                                    }
                                  }}
                                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-800 shadow-xs focus:border-amber-500 focus:outline-none"
                                  title="Editar fecha para prorrogar cheque"
                                />
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-800">
                                {formatCLP(c.monto_cheque)}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePrevioCheque(c.id)}
                                  disabled={isPending}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors disabled:opacity-50"
                                  title="Anular cheque y reintegrar saldo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. NETEO NC */}
          {estado === "NETEO_NC" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-rose-900 mb-1">
                  Seleccionar Nota de Crédito del Proveedor ({formatRutDisplay(factura.rut_proveedor)}) <span className="text-red-500">*</span>
                </label>
                {availableNCs.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold">No hay Notas de Crédito disponibles</p>
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      No se encontraron Notas de Crédito (DTE 61) con saldo disponible emitidas por el proveedor{" "}
                      <strong>{factura.razon_social}</strong>. Importe la NC correspondiente a través del registro SII para habilitar esta acción.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedNcId}
                    onChange={(e) => setSelectedNcId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">-- Seleccionar Nota de Crédito (DTE 61) --</option>
                    {availableNCs.map((nc) => {
                      const saldoNC = nc.saldo_restante_nc !== undefined ? nc.saldo_restante_nc : nc.monto_total;
                      return (
                        <option key={nc.id} value={nc.id}>
                          NC Folio #{nc.folio} — Saldo Disponible: {formatCLP(saldoNC)} (Emisión: {nc.fecha_docto})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Resumen del Neteo si hay NC seleccionada */}
              {selectedNc && (
                <div className="mt-3 rounded-lg border border-rose-200/80 bg-white p-3.5 space-y-2 text-xs">
                  <div className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                    <span>Detalle de Liquidación por Neteo</span>
                    <span className="font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px]">
                      NC #{selectedNc.folio}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-500 block">Deuda Actual Factura:</span>
                      <span className="font-semibold text-slate-800 font-mono">{formatCLP(saldoActualFactura)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Disponible en NC #{selectedNc.folio}:</span>
                      <span className="font-semibold text-rose-700 font-mono">{formatCLP(saldoDisponibleNc)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <span className="font-medium text-slate-600">Monto a Descontar:</span>
                    <span className="font-bold text-rose-600 font-mono">-{formatCLP(montoANetear)}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-xs">
                    <span className="font-bold text-slate-800">Nuevo Saldo Pendiente:</span>
                    <span className={`font-bold text-sm font-mono ${nuevoSaldoPendienteNeteo === 0 ? "text-emerald-600" : "text-amber-700"}`}>
                      {formatCLP(nuevoSaldoPendienteNeteo)}
                    </span>
                  </div>

                  <div className="pt-1">
                    {nuevoSaldoPendienteNeteo === 0 ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>
                          <strong>Neteo Total:</strong> La factura quedará completamente saldada ($0) y se trasladará a la pestaña <strong>FAC / NC</strong>.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                        <ArrowRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>
                          <strong>Neteo Parcial:</strong> Quedará un saldo pendiente de <strong>{formatCLP(nuevoSaldoPendienteNeteo)}</strong> con el proveedor. El vínculo se documentará en <strong>FAC / NC</strong>.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. COMPRA TC (Caja Chica / Rendición de Trabajador) */}
          {estado === "COMPRA_TC" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-4 space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-orange-200/70 pb-2.5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-orange-950 flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-[#E05A10]" />
                    Compra TC — Caja Chica / Rendición de Trabajador
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Vincula la factura a un colaborador activo. El saldo con el proveedor quedará en{" "}
                    <strong className="font-mono text-emerald-700">$ 0</strong> y se registrará en Histórico de Pagos.
                  </p>
                </div>
              </div>

              {/* 1. Asignar Colaborador / Trabajador * (Obligatorio - Combobox Predictivo) */}
              <div ref={colabDropdownRef} className="relative space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  1. Asignar Colaborador / Trabajador <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={colaboradorSearch}
                    onFocus={() => setIsColabDropdownOpen(true)}
                    onChange={(e) => {
                      setColaboradorSearch(e.target.value);
                      setIsColabDropdownOpen(true);
                      if (colaboradorId) {
                        setColaboradorId("");
                      }
                    }}
                    placeholder="Buscar colaborador por RUT o Nombre (ej: 12345678-9 o Juan Pérez)..."
                    className={`w-full rounded-lg border bg-white pl-9 pr-8 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-2 ${
                      colaboradorId
                        ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20 font-medium"
                        : "border-slate-300 focus:border-[#E05A10] focus:ring-[#E05A10]/20"
                    }`}
                  />
                  {(colaboradorSearch || colaboradorId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setColaboradorId("");
                        setColaboradorSearch("");
                        setIsColabDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      title="Limpiar selección"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Lista desplegable filtrada en vivo */}
                {isColabDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                    {filteredColaboradores.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">
                        No se encontraron colaboradores activos para &ldquo;{colaboradorSearch}&rdquo;.
                      </div>
                    ) : (
                      filteredColaboradores.slice(0, 60).map((colab) => {
                        const isSelected = colab.id === colaboradorId;
                        const formattedItem = `${formatRutDisplay(colab.rut)} — ${colab.nombre} (${colab.cargo || "SIN CARGO"})`;
                        return (
                          <button
                            key={colab.id}
                            type="button"
                            onClick={() => {
                              setColaboradorId(colab.id);
                              setColaboradorSearch(formattedItem);
                              setIsColabDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                              isSelected
                                ? "bg-orange-50 text-orange-950 font-semibold"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="truncate">
                              <span className="font-mono font-semibold text-slate-900">
                                {formatRutDisplay(colab.rut)}
                              </span>
                              <span className="mx-1.5 text-slate-400">—</span>
                              <span className="font-semibold text-slate-800">{colab.nombre}</span>
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                ({colab.cargo || "SIN CARGO"})
                              </span>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#E05A10] shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {selectedColaborador && (
                  <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] text-emerald-900">
                    <div className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-mono font-bold">{formatRutDisplay(selectedColaborador.rut)}</span>
                      <span>—</span>
                      <span className="font-semibold truncate">{selectedColaborador.nombre}</span>
                      <span className="text-emerald-700">({selectedColaborador.cargo || "SIN CARGO"})</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded shrink-0">
                      Seleccionado
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Asignar Proyecto ON (Opcional) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  2. Asignar Proyecto ON <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <select
                  value={onProyecto}
                  onChange={(e) => setOnProyecto(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-[#E05A10] focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20"
                >
                  <option value="">Seleccionar ON del proyecto (opcional)</option>
                  {proyectosOnActivos.map((on) => (
                    <option key={on.id} value={on.codigo_on}>
                      ON {on.codigo_on} — {on.nombre_proyecto}
                      {on.cliente_mandante ? ` (${on.cliente_mandante})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Comentarios / Observación (Opcional) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  3. Comentarios / Observación <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={observacionTc}
                  onChange={(e) => setObservacionTc(e.target.value)}
                  placeholder="Compra materiales urgentes por caja chica"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-[#E05A10] focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 resize-none"
                />
              </div>

              {/* Resumen Financiero Compra TC */}
              <div className="rounded-lg border border-orange-200/80 bg-white p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Monto rendido por trabajador:</span>
                  <span className="font-bold text-slate-900 font-mono">{formatCLP(factura.monto_total)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[11px]">Nuevo Saldo Pendiente Proveedor:</span>
                  <span className="font-bold text-emerald-600 font-mono text-sm">$ 0</span>
                </div>
              </div>
            </div>
          )}

          {/* Ajuste Fecha de Vencimiento General (si no es Confirming ni Neteo NC ni Compra TC) */}
          {estado !== "CONFIRMING" &&
            estado !== "NETEO_NC" &&
            estado !== "CHEQUE" &&
            estado !== "COMPRA_TC" && (
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Modificar Fecha de Vencimiento General (Opcional):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fechaVencimientoGeneral}
                    onChange={(e) => setFechaVencimientoGeneral(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400">
                    (Por defecto: emisión + 30 días)
                  </span>
                </div>
              </div>
            )}

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isPending ||
                (estado === "NETEO_NC" && (!selectedNcId || availableNCs.length === 0)) ||
                (estado === "CHEQUE" && excesoSaldoCheques > 0) ||
                (estado === "COMPRA_TC" && !colaboradorId)
              }
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-colors disabled:opacity-50 ${
                estado === "NETEO_NC"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : estado === "CHEQUE"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-[#E05A10] hover:bg-[#c94f0e]"
              }`}
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>
                {estado === "NETEO_NC"
                  ? "Aplicar Neteo"
                  : estado === "CHEQUE"
                  ? chequeMode === "UNICO"
                    ? montoChequeUnico === saldoActualFactura
                      ? "Emitir Cheque Total"
                      : "Registrar Abono por Cheque"
                    : "Registrar Cheques en Cuotas"
                  : estado === "COMPRA_TC"
                  ? "Confirmar Compra TC"
                  : "Guardar Cambios"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
