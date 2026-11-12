"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  FileDown,
  Building2,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Filter,
  FileSpreadsheet,
  AlertCircle,
  PhoneCall,
  UserCheck,
  Receipt,
  FileText,
} from "lucide-react";
import { FacturaVenta } from "@/types/database.types";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";
import type { FacturaCobranzaCriticaItem } from "@/lib/pdf/carta-cobranza-pdf-generator";

interface CobranzaPorClienteTabProps {
  facturas: FacturaVenta[];
  onRegistrarGestion: (factura: FacturaVenta) => void;
}

export function CobranzaPorClienteTab({
  facturas,
  onRegistrarGestion,
}: CobranzaPorClienteTabProps) {
  const [selectedClienteRut, setSelectedClienteRut] = useState<string>("TODOS");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEstado, setFilterEstado] = useState<"TODOS" | "VENCIDA" | "PROXIMA">("TODOS");

  // 1. Filtrar solo facturas impagas críticas (Días para Vencimiento <= 10 días)
  const facturasCriticas = useMemo(() => {
    return facturas
      .filter((f) => {
        // Solo facturas pendientes (excluir NCs o facturas pagadas)
        if (f.tipo_doc === 61) return false;
        const saldo = f.deuda_cliente ?? f.monto_neto_saldo ?? 0;
        if (saldo <= 0) return false;

        // Calcular vencimiento
        const dueInfo = calculateDueDateInfo(f.fecha_docto);
        // REGLA: Días para Vencimiento <= 10 días (incluye vencidas negativas y <= 10 días)
        return dueInfo.diasRestantes <= 10;
      })
      .map((f): FacturaCobranzaCriticaItem & { rawFactura: FacturaVenta; rut_cliente: string; razon_social: string } => {
        const dueInfo = calculateDueDateInfo(f.fecha_docto);
        const diasRestantes = dueInfo.diasRestantes;
        const estadoVencimiento: "PROXIMA_A_VENCER" | "FACTURA_VENCIDA" =
          diasRestantes < 0 ? "FACTURA_VENCIDA" : "PROXIMA_A_VENCER";
        const saldo = f.deuda_cliente ?? f.monto_neto_saldo ?? f.monto_total;

        return {
          id: f.id,
          folio: f.folio,
          tipo_doc: f.tipo_doc,
          fecha_docto: f.fecha_docto,
          fecha_vencimiento: dueInfo.fechaVencimientoIso,
          diasRestantes,
          estadoVencimiento,
          monto_total: f.monto_total,
          saldo_pendiente: saldo,
          rut_cliente: f.rut_cliente,
          razon_social: f.razon_social,
          rawFactura: f,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes); // Las más vencidas primero
  }, [facturas]);

  // 2. Extraer lista consolidada de clientes con cartera crítica
  const clientesConCarteraCritica = useMemo(() => {
    const mapa = new Map<
      string,
      {
        rut: string;
        razonSocial: string;
        totalFacturas: number;
        totalSaldo: number;
        vencidas: number;
        proximas: number;
      }
    >();

    for (const f of facturasCriticas) {
      const actual = mapa.get(f.rut_cliente) || {
        rut: f.rut_cliente,
        razonSocial: f.razon_social,
        totalFacturas: 0,
        totalSaldo: 0,
        vencidas: 0,
        proximas: 0,
      };

      actual.totalFacturas += 1;
      actual.totalSaldo += f.saldo_pendiente;
      if (f.estadoVencimiento === "FACTURA_VENCIDA") {
        actual.vencidas += 1;
      } else {
        actual.proximas += 1;
      }

      mapa.set(f.rut_cliente, actual);
    }

    return Array.from(mapa.values()).sort((a, b) => b.totalSaldo - a.totalSaldo);
  }, [facturasCriticas]);

  // 3. Filtrar según cliente seleccionado, estado y buscador
  const facturasFiltradas = useMemo(() => {
    return facturasCriticas.filter((f) => {
      // Filtro por cliente
      if (selectedClienteRut !== "TODOS" && f.rut_cliente !== selectedClienteRut) {
        return false;
      }

      // Filtro por estado
      if (filterEstado === "VENCIDA" && f.estadoVencimiento !== "FACTURA_VENCIDA") {
        return false;
      }
      if (filterEstado === "PROXIMA" && f.estadoVencimiento !== "PROXIMA_A_VENCER") {
        return false;
      }

      // Buscador
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesFolio = String(f.folio).includes(q);
        const matchesRut = f.rut_cliente.toLowerCase().includes(q);
        const matchesRazon = f.razon_social.toLowerCase().includes(q);
        if (!matchesFolio && !matchesRut && !matchesRazon) {
          return false;
        }
      }

      return true;
    });
  }, [facturasCriticas, selectedClienteRut, filterEstado, searchQuery]);

  // 4. Totales calculados de la selección
  const resumenTotales = useMemo(() => {
    let totalProximasVencer = 0;
    let totalVencidas = 0;
    let cantidadProximasVencer = 0;
    let cantidadVencidas = 0;

    for (const f of facturasFiltradas) {
      if (f.estadoVencimiento === "FACTURA_VENCIDA") {
        totalVencidas += f.saldo_pendiente;
        cantidadVencidas += 1;
      } else {
        totalProximasVencer += f.saldo_pendiente;
        cantidadProximasVencer += 1;
      }
    }

    return {
      totalProximasVencer,
      totalVencidas,
      granTotal: totalProximasVencer + totalVencidas,
      cantidadProximasVencer,
      cantidadVencidas,
    };
  }, [facturasFiltradas]);

  // 5. Manejar Exportación de Carta Ejecutiva PDF
  const handleExportarPdf = async () => {
    if (selectedClienteRut === "TODOS") {
      alert("Por favor seleccione un Cliente específico para emitir su Carta Formal de Cobranza.");
      return;
    }

    const clienteInfo = clientesConCarteraCritica.find(
      (c) => c.rut === selectedClienteRut
    );

    if (!clienteInfo) return;

    const { exportCartaCobranzaToPdf } = await import(
      "@/lib/pdf/carta-cobranza-pdf-generator"
    );

    exportCartaCobranzaToPdf({
      cliente: {
        rut: clienteInfo.rut,
        razonSocial: clienteInfo.razonSocial,
      },
      facturas: facturasFiltradas,
      totales: resumenTotales,
    });
  };

  const clienteSeleccionado = clientesConCarteraCritica.find(
    (c) => c.rut === selectedClienteRut
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Tarjetas de Resumen KPI Cartera Crítica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Facturas Críticas */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Facturas Críticas Totales
            </span>
            <Receipt className="h-4 w-4 text-slate-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 tracking-tight font-mono">
            {facturasCriticas.length} docs
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{clientesConCarteraCritica.length} clientes en cartera</span>
            <span className="font-semibold text-slate-700">≤ 10 días vcto.</span>
          </div>
        </div>

        {/* KPI 2: Próximas a Vencer */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Próximas a Vencer (0 a 10d)
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900 tracking-tight font-mono">
            {formatCLP(resumenTotales.totalProximasVencer)}
          </div>
          <div className="text-[11px] text-amber-800 mt-1 flex items-center justify-between">
            <span>{resumenTotales.cantidadProximasVencer} facturas vigentes</span>
            <span className="font-bold bg-amber-200/60 px-1.5 py-0.2 rounded text-[10px]">
              Alerta Preventiva
            </span>
          </div>
        </div>

        {/* KPI 3: Facturas Vencidas */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Facturas Vencidas (&lt; 0d)
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-900 tracking-tight font-mono">
            {formatCLP(resumenTotales.totalVencidas)}
          </div>
          <div className="text-[11px] text-rose-800 mt-1 flex items-center justify-between">
            <span>{resumenTotales.cantidadVencidas} facturas en mora</span>
            <span className="font-bold bg-rose-200/60 px-1.5 py-0.2 rounded text-[10px]">
              Cobro Urgente
            </span>
          </div>
        </div>

        {/* KPI 4: Monto Total Crítico */}
        <div className="rounded-xl border border-slate-900 bg-slate-900 p-3.5 shadow-sm text-white">
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Monto Exigible Total
            </span>
            <FileSpreadsheet className="h-4 w-4 text-[#E05A10]" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {formatCLP(resumenTotales.granTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Cartera crítica seleccionada</span>
            <span className="text-[#E05A10] font-bold">100% Exigible</span>
          </div>
        </div>
      </div>

      {/* 2. Barra de Selección de Cliente y Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Selector de Cliente con Búsqueda Integrada */}
          <div className="relative min-w-[280px] max-w-md flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Seleccionar Cliente (RUT / Razón Social):
            </label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedClienteRut}
                onChange={(e) => setSelectedClienteRut(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-[#E05A10] focus:bg-white focus:outline-none"
              >
                <option value="TODOS">
                  Todos los Clientes ({clientesConCarteraCritica.length} empresas con cartera crítica)
                </option>
                {clientesConCarteraCritica.map((cli) => (
                  <option key={cli.rut} value={cli.rut}>
                    {cli.razonSocial} ({formatRutDisplay(cli.rut)}) — {cli.totalFacturas} docs ({formatCLP(cli.totalSaldo)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtro por Estado (Todas, Vencidas, Próximas) */}
          <div className="min-w-[150px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Filtro Estado:
            </label>
            <select
              value={filterEstado}
              onChange={(e) =>
                setFilterEstado(e.target.value as "TODOS" | "VENCIDA" | "PROXIMA")
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm focus:border-[#E05A10] focus:outline-none"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="VENCIDA">Solo Vencidas (&lt; 0d)</option>
              <option value="PROXIMA">Solo Próximas (0-10d)</option>
            </select>
          </div>

          {/* Buscador de Folio o Texto */}
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Buscar en Cartera:
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Folio, RUT o cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Botón de Acción Principal: Exportar Carta de Cobranza (PDF) */}
        <div className="sm:self-end pt-1">
          <button
            type="button"
            disabled={selectedClienteRut === "TODOS" || facturasFiltradas.length === 0}
            onClick={handleExportarPdf}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition-all whitespace-nowrap",
              selectedClienteRut !== "TODOS" && facturasFiltradas.length > 0
                ? "bg-[#E05A10] hover:bg-[#c94f0e] shadow-md hover:shadow-lg active:scale-95"
                : "bg-slate-300 text-slate-500 cursor-not-allowed opacity-70"
            )}
            title={
              selectedClienteRut === "TODOS"
                ? "Seleccione un cliente específico en la lista para exportar su Carta Formal de Cobranza"
                : "Generar y descargar Carta Ejecutiva en PDF con membrete y detalle exigible"
            }
          >
            <FileDown className="h-4 w-4" />
            <span>Exportar Carta de Cobranza (PDF)</span>
          </button>
        </div>
      </div>

      {/* Indicador Informativo del Cliente Seleccionado */}
      {clienteSeleccionado && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
              {clienteSeleccionado.razonSocial.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900">
                {clienteSeleccionado.razonSocial}
              </p>
              <p className="text-[11px] text-slate-500">
                RUT: {formatRutDisplay(clienteSeleccionado.rut)} · {facturasFiltradas.length} documento(s) crítico(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">
                Próximas a vencer:
              </span>
              <span className="font-bold text-amber-700">
                {formatCLP(resumenTotales.totalProximasVencer)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">
                Facturas Vencidas:
              </span>
              <span className="font-bold text-rose-700">
                {formatCLP(resumenTotales.totalVencidas)}
              </span>
            </div>
            <div className="border-l border-slate-300 pl-3">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                Total Exigible:
              </span>
              <span className="font-bold text-slate-900">
                {formatCLP(resumenTotales.granTotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Tabla "Cobranza por Cliente" */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-2.5 px-3">Folio / DTE</th>
                {selectedClienteRut === "TODOS" && (
                  <th className="py-2.5 px-3">Cliente / Razón Social</th>
                )}
                <th className="py-2.5 px-3">Emisión / Vencimiento</th>
                <th className="py-2.5 px-3 text-center">Días Restantes / Mora</th>
                <th className="py-2.5 px-3 text-center">Estado de Vencimiento</th>
                <th className="py-2.5 px-3 text-right">Monto Total</th>
                <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                <th className="py-2.5 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {facturasFiltradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={selectedClienteRut === "TODOS" ? 8 : 7}
                    className="py-10 text-center text-slate-400 text-xs"
                  >
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
                    <p className="font-semibold text-slate-700">
                      No se registran facturas críticas (≤ 10 días) para los criterios seleccionados.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Todas las obligaciones de este cliente se encuentran al día o con plazos mayores a 10 días.
                    </p>
                  </td>
                </tr>
              ) : (
                facturasFiltradas.map((f) => {
                  const isVencida = f.estadoVencimiento === "FACTURA_VENCIDA";

                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors",
                        isVencida ? "bg-rose-50/20" : "bg-amber-50/15"
                      )}
                    >
                      {/* 1. FOLIO / DTE */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-800">
                          #{f.folio}
                        </div>
                        <span className="inline-block rounded bg-slate-100 text-slate-600 px-1.5 py-0.2 text-[10px] font-medium border border-slate-200 mt-0.5">
                          {getTipoDocLabel(f.tipo_doc).shortName}
                        </span>
                      </td>

                      {/* CLIENTE (Visible solo si está en vista consolidada de todos) */}
                      {selectedClienteRut === "TODOS" && (
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900 truncate max-w-[200px]" title={f.razon_social}>
                            {f.razon_social}
                          </p>
                          <span className="font-mono text-[10px] text-slate-500">
                            {formatRutDisplay(f.rut_cliente)}
                          </span>
                        </td>
                      )}

                      {/* 2. EMISIÓN / VENCIMIENTO */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        <div className="text-slate-500">
                          Emisión:{" "}
                          <span className="font-medium text-slate-700">
                            {formatDateCL(f.fecha_docto)}
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Venc.:{" "}
                          <span className="font-bold text-slate-800">
                            {formatDateCL(f.fecha_vencimiento)}
                          </span>
                        </div>
                      </td>

                      {/* 3. DÍAS RESTANTES / MORA */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-center">
                        {isVencida ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-mono font-bold border border-rose-200">
                            -{Math.abs(f.diasRestantes)}d (Mora)
                          </span>
                        ) : f.diasRestantes === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-mono font-bold border border-amber-200">
                            Vence Hoy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-mono font-bold border border-amber-200">
                            +{f.diasRestantes}d restantes
                          </span>
                        )}
                      </td>

                      {/* 4. ESTADO DE VENCIMIENTO */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-center">
                        {isVencida ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 text-white px-2 py-0.5 text-[10px] font-bold shadow-xs">
                            <AlertCircle className="h-3 w-3" />
                            Factura Vencida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-white px-2 py-0.5 text-[10px] font-bold shadow-xs">
                            <Clock className="h-3 w-3" />
                            Próxima a vencer
                          </span>
                        )}
                      </td>

                      {/* 5. MONTO TOTAL */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono text-slate-500 text-xs">
                        {formatCLP(f.monto_total)}
                      </td>

                      {/* 6. SALDO PENDIENTE */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold text-xs">
                        <span
                          className={
                            isVencida ? "text-rose-700" : "text-amber-800"
                          }
                        >
                          {formatCLP(f.saldo_pendiente)}
                        </span>
                      </td>

                      {/* 7. ACCIÓN */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => onRegistrarGestion(f.rawFactura)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#E05A10] transition-colors"
                          title="Registrar llamada, correo o compromiso de cobranza"
                        >
                          <PhoneCall className="h-3 w-3" />
                          <span>Cobranza</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
