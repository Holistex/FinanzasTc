"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Landmark,
  ArrowRightLeft,
  Search,
  Layers,
  FileSpreadsheet,
  TrendingUp,
  ChevronsUpDown,
  Loader2,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import {
  EmpresaFactoringCliente,
  FacturaVenta,
} from "@/types/database.types";
import { getFacturasFactoringClientesAction } from "@/actions/facturas-ventas.actions";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";
import { AssignFactoringModal } from "./assign-factoring-modal";
import { RegisterPaymentModal } from "./register-payment-modal";

interface FactoringClientesViewProps {
  initialFacturasFactoring: FacturaVenta[];
  factoringClientes: EmpresaFactoringCliente[];
}

export interface FactoringGroupSummary {
  factoringId: string;
  razonSocial: string;
  rutFactoring: string;
  contactoNombre: string | null;
  contactoEmail: string | null;
  documentCount: number;
  montoTotalBruto: number;
  montoTotalCedido: number;
  porcentajeParticipacion: number;
  facturas: FacturaVenta[];
}

export function FactoringClientesView({
  initialFacturasFactoring,
  factoringClientes,
}: FactoringClientesViewProps) {
  const [facturasFactoring, setFacturasFactoring] = useState<FacturaVenta[]>(
    initialFacturasFactoring
  );
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmptyEntities, setShowEmptyEntities] = useState(false);
  const [facturaToReassign, setFacturaToReassign] =
    useState<FacturaVenta | null>(null);
  const [facturaToPay, setFacturaToPay] = useState<FacturaVenta | null>(null);

  const handleRefreshData = () => {
    startTransition(async () => {
      const updated = await getFacturasFactoringClientesAction();
      setFacturasFactoring(updated);
    });
  };

  // Agrupación y Ranking de Mayor a Menor por Monto Total Cedido ($ CLP)
  const {
    groups,
    totalMontoCedidoGlobal,
    totalDocumentosCedidos,
    activeEntitiesCount,
  } = useMemo(() => {
    const map = new Map<
      string,
      {
        entidad: EmpresaFactoringCliente | null;
        facturas: FacturaVenta[];
        montoTotalBruto: number;
        montoTotalCedido: number;
      }
    >();

    for (const fc of factoringClientes) {
      map.set(fc.id, {
        entidad: fc,
        facturas: [],
        montoTotalBruto: 0,
        montoTotalCedido: 0,
      });
    }

    let globalCedido = 0;
    let globalDocs = 0;

    for (const fac of facturasFactoring) {
      if (fac.gestion_pago !== "FACTORING" && !fac.factoring_cliente_id) {
        continue;
      }
      const key = fac.factoring_cliente_id || "SIN_ASIGNAR";
      if (!map.has(key)) {
        map.set(key, {
          entidad: fac.empresa_factoring_cliente || null,
          facturas: [],
          montoTotalBruto: 0,
          montoTotalCedido: 0,
        });
      }

      const bucket = map.get(key)!;
      const saldo = Number(fac.monto_neto_saldo) || 0;
      const bruto = Number(fac.monto_total) || 0;

      bucket.facturas.push(fac);
      bucket.montoTotalBruto += bruto;
      bucket.montoTotalCedido += saldo;

      globalCedido += saldo;
      globalDocs += 1;
    }

    let withPortfolioCount = 0;
    const rawList: FactoringGroupSummary[] = [];

    for (const [id, item] of map.entries()) {
      if (item.facturas.length > 0 && item.montoTotalCedido > 0) {
        withPortfolioCount += 1;
      }
      if (!showEmptyEntities && item.facturas.length === 0) {
        continue;
      }
      rawList.push({
        factoringId: id,
        razonSocial: item.entidad?.razon_social || "Factoring No Especificado",
        rutFactoring: item.entidad?.rut_cliente || "-",
        contactoNombre: item.entidad?.contacto_nombre || null,
        contactoEmail: item.entidad?.contacto_email || null,
        documentCount: item.facturas.length,
        montoTotalBruto: item.montoTotalBruto,
        montoTotalCedido: item.montoTotalCedido,
        porcentajeParticipacion:
          globalCedido > 0 ? (item.montoTotalCedido / globalCedido) * 100 : 0,
        facturas: item.facturas,
      });
    }

    // Ordenar de MAYOR A MENOR según Monto Total Cedido ($ CLP)
    rawList.sort((a, b) => {
      if (b.montoTotalCedido !== a.montoTotalCedido) {
        return b.montoTotalCedido - a.montoTotalCedido;
      }
      return b.documentCount - a.documentCount;
    });

    return {
      groups: rawList,
      totalMontoCedidoGlobal: globalCedido,
      totalDocumentosCedidos: globalDocs,
      activeEntitiesCount: withPortfolioCount,
    };
  }, [facturasFactoring, factoringClientes, showEmptyEntities]);

  // Estado del Accordion (por defecto desplegamos la entidad #1 con mayor monto)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(
    () => {
      const firstId = groups[0]?.factoringId;
      return firstId ? { [firstId]: true } : {};
    }
  );

  const toggleGroupAccordion = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filtro de búsqueda sobre Entidad de Factoring o sobre Facturas anidadas
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => {
        const matchesEntity =
          group.razonSocial.toLowerCase().includes(q) ||
          group.rutFactoring.toLowerCase().includes(q);

        if (matchesEntity) return group;

        const matchingFacturas = group.facturas.filter(
          (f) =>
            String(f.folio).includes(q) ||
            f.rut_cliente.toLowerCase().includes(q) ||
            f.razon_social.toLowerCase().includes(q)
        );

        if (matchingFacturas.length > 0) {
          return {
            ...group,
            facturas: matchingFacturas,
          };
        }
        return null;
      })
      .filter((g): g is FactoringGroupSummary => g !== null);
  }, [groups, searchQuery]);

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of filteredGroups) {
      if (g.documentCount > 0) next[g.factoringId] = true;
    }
    setExpandedIds(next);
  };

  const collapseAll = () => {
    setExpandedIds({});
  };

  return (
    <div className="space-y-3.5">
      {/* Cabecera Ejecutiva del Submódulo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-bold tracking-tight text-[#0F172A]">
            VENTAS TENSACON
          </h1>
          <span className="text-xs font-semibold text-slate-500">
            · Factoring Clientes
          </span>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-orange-50 text-[#E05A10] border border-orange-200">
            {totalDocumentosCedidos} DTEs Cedidos
          </span>
        </div>

        {isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-[#E05A10] font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Sincronizando cartera...
          </span>
        )}
      </div>

      {/* =====================================================================
          1. ÚNICAMENTE LOS 3 CUADROS KPI SUPERIORES
      ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-[#0F172A] text-white border border-[#1E293B] border-l-4 border-l-[#E05A10] rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Monto Total Cedido a Factoring
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
              {formatCLP(totalMontoCedidoGlobal)}
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-[#E05A10]/20 border border-[#E05A10]/40 flex items-center justify-center text-[#E05A10]">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-[#E05A10] rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Total Documentos Cedidos
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {totalDocumentosCedidos}{" "}
              <span className="text-xs font-sans font-normal text-slate-500">
                facturas (DTE 33)
              </span>
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E05A10]">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-700 rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Entidades de Factoring con Cartera
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {activeEntitiesCount}{" "}
              <span className="text-xs font-sans font-normal text-slate-500">
                de {factoringClientes.length} registradas
              </span>
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-[#F1F5F9] border border-slate-200 flex items-center justify-center text-[#0F172A]">
            <Landmark className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. PROTAGONISMO A ANCHO COMPLETO (100% WIDTH): TABLA ENTIDAD DE FACTORING
      ===================================================================== */}
      <div className="space-y-2.5">
        {/* Barra de Herramientas Compacta */}
        <div className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por Factoring, Folio #, RUT o Cliente..."
              className="w-full rounded border border-slate-300 bg-[#F8FAFC] pl-7 pr-2.5 py-1 text-xs text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEmptyEntities}
                onChange={(e) => setShowEmptyEntities(e.target.checked)}
                className="rounded border-slate-300 text-[#E05A10] focus:ring-[#E05A10]"
              />
              <span>Mostrar Factorings sin facturas ($ 0)</span>
            </label>

            <span className="text-slate-300">|</span>

            <button
              type="button"
              onClick={expandAll}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-[#F1F5F9]"
            >
              <ChevronsUpDown className="h-3 w-3 text-[#E05A10]" />
              Expandir Todo
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-[#F1F5F9]"
            >
              Colapsar Todo
            </button>
          </div>
        </div>

        {/* Tabla Maestra Anidada a 100% Width */}
        <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden w-full">
          <table className="w-full table-auto text-left border-collapse">
            <thead>
              <tr className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase tracking-wider border-b border-[#1E293B]">
                <th className="py-2.5 px-3 w-[46px] text-center">#</th>
                <th className="py-2.5 px-3">
                  Entidad de Factoring (Nivel Principal)
                </th>
                <th className="py-2.5 px-3 text-center w-[140px]">
                  Facturas Cedidas
                </th>
                <th className="py-2.5 px-3 text-right w-[175px]">
                  Monto Total Acumulado
                </th>
                <th className="py-2.5 px-4 text-right w-[280px]">
                  % Participación
                </th>
                <th className="py-2.5 px-3 text-right w-[95px]">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-500 text-xs"
                  >
                    No se encontraron entidades de Factoring con facturas
                    cedidas.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group, idx) => {
                  const isExpanded = Boolean(expandedIds[group.factoringId]);
                  const isTopRank = idx === 0 && group.montoTotalCedido > 0;

                  return (
                    <React.Fragment key={group.factoringId}>
                      {/* NIVEL PRINCIPAL: FILA RESUMEN POR ENTIDAD DE FACTORING */}
                      <tr
                        onClick={() => toggleGroupAccordion(group.factoringId)}
                        className={cn(
                          "cursor-pointer transition-colors select-none",
                          isExpanded
                            ? "bg-orange-50/40 hover:bg-orange-50/70"
                            : "bg-white hover:bg-[#F8FAFC]"
                        )}
                      >
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white",
                              isTopRank ? "bg-[#E05A10]" : "bg-[#0F172A]"
                            )}
                          >
                            {idx + 1}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-[#E05A10] shrink-0" />
                            <div>
                              <div className="font-bold text-[#0F172A] text-xs">
                                {group.razonSocial}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500">
                                RUT: {formatRutDisplay(group.rutFactoring)}
                                {group.contactoNombre
                                  ? ` · Ejecutivo: ${group.contactoNombre}`
                                  : ""}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#F1F5F9] text-[#0F172A] border border-slate-300">
                            <Layers className="h-3 w-3 text-[#E05A10]" />
                            {group.documentCount}{" "}
                            {group.documentCount === 1 ? "DTE" : "DTEs"}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <div className="font-bold text-[#0F172A] text-xs">
                            {formatCLP(group.montoTotalCedido)}
                          </div>
                          {group.montoTotalBruto > group.montoTotalCedido && (
                            <div className="text-[10px] text-slate-400">
                              Bruto: {formatCLP(group.montoTotalBruto)}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-4 text-right w-[280px]">
                          <div className="flex items-center justify-end gap-3 w-full">
                            <div className="flex-1 min-w-[140px] w-full h-2.5 rounded-full bg-slate-200/90 overflow-hidden shadow-inner">
                              <div
                                className="h-full rounded-full bg-[#E05A10] transition-all duration-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    group.porcentajeParticipacion
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[#E05A10] tabular-nums min-w-[50px] text-right">
                              {group.porcentajeParticipacion.toFixed(1)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                              isExpanded
                                ? "bg-[#E05A10] text-white"
                                : "bg-[#F1F5F9] text-slate-700 hover:bg-slate-200"
                            )}
                          >
                            <span>{isExpanded ? "Ocultar" : "Ver"}</span>
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* NIVEL ANIDADO: SUBTABLA DE FACTURAS CEDIDAS A ESTA ENTIDAD */}
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-0 bg-[#F8FAFC] border-b-2 border-b-slate-300"
                          >
                            <div className="pl-8 pr-4 py-3 border-l-4 border-l-[#E05A10]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                  Detalle de Documentos Cedidos a{" "}
                                  <strong className="text-[#0F172A]">
                                    {group.razonSocial}
                                  </strong>
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  Subtotal Cartera:{" "}
                                  <strong className="text-[#E05A10]">
                                    {formatCLP(group.montoTotalCedido)}
                                  </strong>
                                </span>
                              </div>

                              {group.facturas.length === 0 ? (
                                <div className="rounded border border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
                                  Esta entidad aún no registra facturas cedidas.
                                </div>
                              ) : (
                                <div className="rounded border border-slate-200 bg-white overflow-hidden shadow-sm">
                                  <table className="w-full table-auto text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#1E293B] text-slate-200 text-[10px] font-semibold uppercase tracking-wider">
                                          <th className="py-1.5 px-3 w-[130px]">
                                            Folio / Documento
                                          </th>
                                          <th className="py-1.5 px-3 w-[115px]">
                                            RUT Cliente
                                          </th>
                                          <th className="py-1.5 px-3">
                                            Razón Social Cliente
                                          </th>
                                          <th className="py-1.5 px-3 w-[170px]">
                                            Emisión / Vencimiento
                                          </th>
                                          <th className="py-1.5 px-3 text-right w-[135px]">
                                            Monto Total
                                          </th>
                                          <th className="py-1.5 px-3 text-right w-[145px]">
                                            Deuda Cliente
                                          </th>
                                          <th className="py-1.5 px-3 text-right w-[85px]">
                                            Re-cesión
                                          </th>
                                          <th className="py-1.5 px-3 text-right w-[75px]">
                                            Pagar
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200/80 text-xs">
                                        {group.facturas.map((fac) => {
                                          const docBadge = getTipoDocLabel(
                                            fac.tipo_doc
                                          );
                                          const dueDateInfo =
                                            calculateDueDateInfo(
                                              fac.fecha_docto
                                            );
                                          const deudaActual =
                                            fac.deuda_cliente !== undefined &&
                                            fac.deuda_cliente !== null
                                              ? Number(fac.deuda_cliente)
                                              : Number(fac.monto_neto_saldo);
                                          const isPaid = deudaActual <= 0;
                                          const hasReduction =
                                            deudaActual < fac.monto_total &&
                                            !isPaid;

                                          return (
                                            <tr
                                              key={fac.id}
                                              className="hover:bg-[#F1F5F9]/70 transition-colors"
                                            >
                                              <td className="py-1.5 px-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-mono font-bold text-[#0F172A]">
                                                    #{fac.folio}
                                                  </span>
                                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 bg-[#F8FAFC] text-[#0F172A] border border-emerald-500/60">
                                                    {docBadge.shortName}
                                                  </span>
                                                </div>
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap font-mono text-slate-700">
                                                {formatRutDisplay(
                                                  fac.rut_cliente
                                                )}
                                              </td>

                                              <td className="py-1.5 px-3">
                                                <div
                                                  className="font-medium text-[#0F172A] truncate max-w-[180px] sm:max-w-[240px] lg:max-w-[300px]"
                                                  title={fac.razon_social}
                                                >
                                                  {fac.razon_social}
                                                </div>
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap font-mono">
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="leading-tight">
                                                    <div className="text-[11px] font-semibold text-[#0F172A]">
                                                      {formatDateCL(
                                                        fac.fecha_docto
                                                      )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500">
                                                      Venc:{" "}
                                                      {
                                                        dueDateInfo.fechaVencimientoCL
                                                      }
                                                    </div>
                                                  </div>

                                                  {isPaid ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                      Pagada
                                                    </span>
                                                  ) : (
                                                    <span
                                                      className={cn(
                                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums border",
                                                        dueDateInfo.badgeColor ===
                                                          "emerald" &&
                                                          "bg-emerald-50 text-emerald-700 border-emerald-300",
                                                        dueDateInfo.badgeColor ===
                                                          "amber" &&
                                                          "bg-amber-50 text-amber-700 border-amber-300",
                                                        dueDateInfo.badgeColor ===
                                                          "rose" &&
                                                          "bg-rose-50 text-rose-700 border-rose-300"
                                                      )}
                                                      title={
                                                        dueDateInfo.diasRestantes <
                                                        0
                                                          ? `Vencida hace ${Math.abs(dueDateInfo.diasRestantes)} días`
                                                          : `Vence en ${dueDateInfo.diasRestantes} días`
                                                      }
                                                    >
                                                      {dueDateInfo.badgeLabel}
                                                    </span>
                                                  )}
                                                </div>
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-600">
                                                {formatCLP(fac.monto_total)}
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap text-right font-mono tabular-nums">
                                                {isPaid ? (
                                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                                    {formatCLP(0)}
                                                  </span>
                                                ) : (
                                                  <span
                                                    className={cn(
                                                      "font-bold",
                                                      hasReduction
                                                        ? "text-[#E05A10]"
                                                        : "text-[#0F172A]"
                                                    )}
                                                  >
                                                    {formatCLP(deudaActual)}
                                                  </span>
                                                )}
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap text-right">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setFacturaToReassign(fac)
                                                  }
                                                  title="Cambiar de Entidad de Factoring o retornar a Directo Cliente"
                                                  className="inline-flex items-center justify-center h-6 w-6 rounded border border-orange-300 bg-orange-50 text-[#E05A10] hover:bg-[#E05A10] hover:text-white transition-colors"
                                                >
                                                  <ArrowRightLeft className="h-3 w-3" />
                                                </button>
                                              </td>

                                              <td className="py-1.5 px-3 whitespace-nowrap text-right">
                                                {isPaid ? (
                                                  <span
                                                    title="Factura pagada ($0 deuda)"
                                                    className="inline-flex items-center justify-center h-6 w-6 rounded border border-emerald-200 bg-emerald-50 text-emerald-600"
                                                  >
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                  </span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setFacturaToPay(fac)
                                                    }
                                                    title={`Registrar Pago · Deuda actual: ${formatCLP(deudaActual)}`}
                                                    className="inline-flex items-center justify-center h-6 w-6 rounded border border-slate-200 bg-[#F8FAFC] text-slate-600 hover:border-[#E05A10] hover:bg-[#E05A10] hover:text-white transition-colors"
                                                  >
                                                    <CreditCard className="h-3.5 w-3.5" />
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal para Re-cesión o retorno a Directo Cliente */}
        <AssignFactoringModal
          factura={facturaToReassign}
          factoringClientes={factoringClientes}
          onClose={() => setFacturaToReassign(null)}
          onSuccess={() => handleRefreshData()}
        />

        {/* Modal para Registro de Pago de Factura */}
        <RegisterPaymentModal
          factura={facturaToPay}
          onClose={() => setFacturaToPay(null)}
          onSuccess={() => handleRefreshData()}
        />
      </div>
    );
  }
