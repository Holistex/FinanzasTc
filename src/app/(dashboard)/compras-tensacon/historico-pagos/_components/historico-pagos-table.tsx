"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  Search,
  RefreshCw,
  History,
  CheckCircle2,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  ArrowUpDown,
  Filter,
  Calendar,
  Banknote,
  User,
  RotateCcw,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { PagoCompraHistorico, ModalidadPagoCompra } from "@/types/database.types";
import {
  HistoricoPagosKPIs,
  getHistoricoPagosComprasAction,
  reversarPagoCompraAction,
} from "@/actions/compras-historico-compromisos.actions";
import { TensaconUserSession } from "@/lib/auth/session";
import { formatCLP, formatDateCL, formatRutDisplay, toDateOnlyString } from "@/lib/utils";

interface HistoricoPagosTableProps {
  initialData: PagoCompraHistorico[];
  initialKpis: HistoricoPagosKPIs;
  sessionUser?: (TensaconUserSession & { tipo_perfil?: string; role?: string }) | null;
}

export function HistoricoPagosTable({
  initialData,
  initialKpis,
  sessionUser,
}: HistoricoPagosTableProps) {
  const router = useRouter();
  const esAdministrador =
    String(sessionUser?.tipo_perfil || sessionUser?.perfil || sessionUser?.role || "")
      .trim()
      .toUpperCase() === "ADMINISTRADOR";

  const [data, setData] = useState<PagoCompraHistorico[]>(initialData);
  const [kpis, setKpis] = useState<HistoricoPagosKPIs>(initialKpis);
  const [pagoToReverse, setPagoToReverse] = useState<PagoCompraHistorico | null>(null);
  const [isReversing, setIsReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [selectedModalidad, setSelectedModalidad] = useState<string>("TODAS");
  const [sortField, setSortField] = useState<"fecha_real_pago" | "monto_pagado" | "folio">("fecha_real_pago");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  const handleConfirmReverse = async () => {
    if (!pagoToReverse || !esAdministrador) return;
    setIsReversing(true);
    setReverseError(null);
    try {
      const res = await reversarPagoCompraAction({
        pagoId: pagoToReverse.id,
        facturaId: pagoToReverse.factura_id,
        montoPagado: pagoToReverse.monto_pagado,
        folio: pagoToReverse.folio,
        rutProveedor: pagoToReverse.rut_proveedor,
        modalidadPago: pagoToReverse.modalidad_pago,
      });
      if (!res.success) {
        setReverseError(res.error || "No se pudo reversar el pago.");
        return;
      }
      const refreshed = await getHistoricoPagosComprasAction();
      setData(refreshed.data);
      setKpis(refreshed.kpis);
      setPagoToReverse(null);
      router.refresh();
    } catch (err: unknown) {
      setReverseError(
        err instanceof Error ? err.message : "Error inesperado al reversar el pago."
      );
    } finally {
      setIsReversing(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, fechaDesde, fechaHasta, selectedModalidad, sortField, sortAsc]);

  // Filtrado
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const modItem = (item.modalidad_pago || "").toUpperCase();
      let matchModalidad = selectedModalidad === "TODAS";
      if (!matchModalidad) {
        if (selectedModalidad === "DIRECTO") {
          matchModalidad =
            modItem === "DIRECTO" ||
            modItem === "TRANSFERENCIA" ||
            modItem === "PAGADA" ||
            modItem === "DEUDA_PROVEEDOR";
        } else {
          matchModalidad = modItem === selectedModalidad;
        }
      }

      const itemDate = toDateOnlyString(item.fecha_real_pago);
      const matchFechaDesde = !fechaDesde || (Boolean(itemDate) && itemDate >= fechaDesde);
      const matchFechaHasta = !fechaHasta || (Boolean(itemDate) && itemDate <= fechaHasta);

      const term = searchTerm.toLowerCase();
      const gestor = (item.usuario_nombre || item.pagado_por || "").toLowerCase();
      const matchSearch =
        !term ||
        item.razon_social.toLowerCase().includes(term) ||
        item.rut_proveedor.toLowerCase().includes(term) ||
        item.folio.toString().includes(term) ||
        gestor.includes(term) ||
        (item.observacion && item.observacion.toLowerCase().includes(term)) ||
        (item.comprobante_ref && item.comprobante_ref.toLowerCase().includes(term));

      return matchModalidad && matchFechaDesde && matchFechaHasta && matchSearch;
    }).sort((a, b) => {
      if (sortField === "fecha_real_pago") {
        const valA = new Date(a.fecha_real_pago).getTime();
        const valB = new Date(b.fecha_real_pago).getTime();
        return sortAsc ? valA - valB : valB - valA;
      }
      if (sortField === "monto_pagado") {
        return sortAsc ? a.monto_pagado - b.monto_pagado : b.monto_pagado - a.monto_pagado;
      }
      if (sortField === "folio") {
        return sortAsc ? a.folio - b.folio : b.folio - a.folio;
      }
      return 0;
    });
  }, [data, searchTerm, fechaDesde, fechaHasta, selectedModalidad, sortField, sortAsc]);

  // Recálculo dinámico de subtotal de los filtrados
  const subtotalFiltrado = useMemo(() => {
    return filteredData.reduce((acc, curr) => acc + curr.monto_pagado, 0);
  }, [filteredData]);

  const handleSort = (field: "fecha_real_pago" | "monto_pagado" | "folio") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getModalidadBadge = (modalidad: ModalidadPagoCompra) => {
    switch (modalidad) {
      case "DIRECTO":
      case "PAGADA" as unknown as ModalidadPagoCompra:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            DIRECTO
          </span>
        );
      case "CHEQUE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <CreditCard className="h-3 w-3 text-purple-600" />
            CHEQUE
          </span>
        );
      case "FACTORING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Building2 className="h-3 w-3 text-blue-600" />
            FACTORING
          </span>
        );
      case "CONFIRMING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Landmark className="h-3 w-3 text-amber-600" />
            CONFIRMING
          </span>
        );
      case "NETEO_NC":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            NETEO NC
          </span>
        );
      case "COMPRA_TC":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <CreditCard className="h-3 w-3 text-orange-600" />
            COMPRA TC
          </span>
        );
      case "EFECTIVO":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <Banknote className="h-3 w-3 text-emerald-600" />
            EFECTIVO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
            {modalidad}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* TARJETAS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Pagado */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Histórico Pagado
            </span>
            <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatCLP(kpis.totalPagado)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {kpis.cantidadTotal} pagos registrados
            </p>
          </div>
        </div>

        {/* Total Directo */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pagos Directos
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
              DIRECTO
            </span>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatCLP(kpis.totalDirecto)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{kpis.cantidadDirecto} pagos</p>
          </div>
        </div>

        {/* Total Cheque */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pagos con Cheques
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
              CHEQUE
            </span>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatCLP(kpis.totalCheque)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{kpis.cantidadCheque} cheques cobrados</p>
          </div>
        </div>

        {/* Total Factoring */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Factoring Cancelado
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
              FACTORING
            </span>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatCLP(kpis.totalFactoring)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{kpis.cantidadFactoring} cesiones</p>
          </div>
        </div>

        {/* Total Confirming */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Confirming Saldado
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
              CONFIRMING
            </span>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatCLP(kpis.totalConfirming)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{kpis.cantidadConfirming} operaciones</p>
          </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Input de Búsqueda */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Folio, Proveedor, RUT, Usuario o Referencia..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10] focus:border-transparent"
            />
          </div>

          {/* Rango de Fechas (Desde - Hasta) */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-[#E05A10] focus-within:border-transparent">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase leading-none">Fecha Desde</span>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="text-xs text-slate-800 bg-transparent focus:outline-none font-mono"
                  placeholder="dd-mm-aaaa"
                  title="Fecha real de pago desde"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-[#E05A10] focus-within:border-transparent">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase leading-none">Fecha Hasta</span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="text-xs text-slate-800 bg-transparent focus:outline-none font-mono"
                  placeholder="dd-mm-aaaa"
                  title="Fecha real de pago hasta"
                />
              </div>
            </div>
          </div>

          {/* Filtro por Modalidad */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedModalidad}
              onChange={(e) => setSelectedModalidad(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E05A10]"
            >
              <option value="TODAS">Todas las Modalidades</option>
              <option value="DIRECTO">Directo (Transferencia)</option>
              <option value="COMPRA_TC">Compra TC (Colaborador)</option>
              <option value="CHEQUE">Cheque</option>
              <option value="FACTORING">Factoring Proveedores</option>
              <option value="CONFIRMING">Confirming</option>
              <option value="NETEO_NC">Neteo NC</option>
              <option value="EFECTIVO">Efectivo / Caja</option>
            </select>
          </div>

          {/* Botón Refrescar / Limpiar */}
          <button
            onClick={() => {
              setSearchTerm("");
              setFechaDesde("");
              setFechaHasta("");
              setSelectedModalidad("TODAS");
            }}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0"
            title="Limpiar todos los filtros"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Limpiar</span>
          </button>
        </div>

        {/* Resumen de resultados filtrados */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Mostrando <span className="font-semibold text-slate-900">{filteredData.length}</span> pagos de {data.length} totales
            </span>
            {(fechaDesde || fechaHasta) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 text-[#E05A10] font-medium border border-orange-200 text-[11px]">
                <Calendar className="h-3 w-3" />
                Período: {fechaDesde ? formatDateCL(fechaDesde) : "Inicio"} → {fechaHasta ? formatDateCL(fechaHasta) : "Presente"}
              </span>
            )}
          </div>
          <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 mr-2">Subtotal Filtrado:</span>
            <span className="font-mono font-bold text-slate-900 text-sm">
              {formatCLP(subtotalFiltrado)}
            </span>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  PROVEEDOR / RUT
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort("folio")}
                >
                  <div className="flex items-center gap-1">
                    <span>FOLIO / DTE</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th scope="col" className="px-4 py-3">
                  MODALIDAD PAGO
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort("monto_pagado")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>MONTO PAGADO</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 select-none"
                  onClick={() => handleSort("fecha_real_pago")}
                >
                  <div className="flex items-center gap-1">
                    <span>FECHA REAL DE PAGO</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th scope="col" className="px-4 py-3">
                  GESTIONADO POR
                </th>
                <th scope="col" className="px-4 py-3">
                  OBSERVACIÓN / REF
                </th>
                {esAdministrador && (
                  <th scope="col" className="px-4 py-3 text-center">
                    ACCIÓN
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={esAdministrador ? 8 : 7}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    <History className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">No se encontraron pagos registrados</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Intente ajustando los filtros de búsqueda, fechas o modalidad
                    </p>
                  </td>
                </tr>
              ) : (
                paginateArray(filteredData, currentPage, GLOBAL_PAGE_SIZE).map((pago) => {
                  return (
                    <tr
                      key={pago.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* PROVEEDOR / RUT */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {pago.razon_social}
                        </div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">
                          {formatRutDisplay(pago.rut_proveedor)}
                        </div>
                      </td>

                      {/* FOLIO / DTE */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-mono font-semibold text-slate-800">
                            #{pago.folio}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {pago.tipo_doc === 33
                            ? "Factura Electrónica (33)"
                            : pago.tipo_doc === 34
                            ? "Factura Exenta (34)"
                            : `DTE ${pago.tipo_doc}`}
                        </div>
                      </td>

                      {/* MODALIDAD PAGO */}
                      <td className="px-4 py-3">
                        {getModalidadBadge(pago.modalidad_pago)}
                      </td>

                      {/* MONTO PAGADO */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCLP(pago.monto_pagado)}
                        </span>
                      </td>

                      {/* FECHA REAL DE PAGO */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded">
                          {formatDateCL(pago.fecha_real_pago)}
                        </span>
                      </td>

                      {/* GESTIONADO POR */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                          <User className="w-3 h-3 text-slate-500" />
                          {pago.usuario_nombre || pago.pagado_por || "Sistema"}
                        </span>
                      </td>

                      {/* OBSERVACIÓN / REF */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-700 font-medium">
                          {(pago.observacion || "Sin observación")
                            .replace(/Colaborador:\s*ID:\s*[0-9a-fA-F-]+/gi, "")
                            .replace(/ID:\s*[0-9a-fA-F-]+/gi, "")
                            .replace(/^[\s·—-]+|[\s·—-]+$/g, "")
                            .trim() || "Pago Contado / TC"}
                        </div>
                        {pago.comprobante_ref &&
                          !pago.comprobante_ref.startsWith("TC-") &&
                          pago.comprobante_ref.toUpperCase() !== "RENDICIÓN TC / CONTADO" && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Ref: {pago.comprobante_ref}
                            </div>
                          )}
                      </td>

                      {/* ACCIÓN (SOLO ADMINISTRADOR) */}
                      {esAdministrador && (
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setReverseError(null);
                              setPagoToReverse(pago);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                            title="Anular este pago/abono y devolver el monto al saldo pendiente de la factura"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reversar</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredData.length}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* MODAL CONFIRMACIÓN DE REVERSA (SOLO ADMINISTRADOR) */}
      {esAdministrador && pagoToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-rose-950 px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Confirmar Reversa de Pago</h3>
                  <p className="text-[11px] text-rose-200">
                    Acción exclusiva de perfil ADMINISTRADOR
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isReversing}
                onClick={() => setPagoToReverse(null)}
                className="rounded-lg p-1 text-rose-200 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                ¿Está seguro de reversar este pago/abono? El registro se eliminará del histórico y el monto se devolverá al saldo pendiente de la factura en <strong>Facturas de Compras</strong>.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Proveedor:</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {pagoToReverse.razon_social}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Folio Documento:</span>
                  <span className="font-mono font-bold text-slate-900">
                    #{pagoToReverse.folio}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Monto a Reversar:</span>
                  <span className="font-mono font-black text-rose-700">
                    {formatCLP(pagoToReverse.monto_pagado)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Fecha Pago:</span>
                  <span className="font-mono text-slate-700">
                    {formatDateCL(pagoToReverse.fecha_real_pago)}
                  </span>
                </div>
              </div>

              {reverseError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 font-medium">
                  {reverseError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isReversing}
                  onClick={() => setPagoToReverse(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isReversing}
                  onClick={handleConfirmReverse}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {isReversing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  <span>{isReversing ? "Reversando..." : "Confirmar Reversa"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
