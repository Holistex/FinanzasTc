export type GestionPagoTipo = "DIRECTO_CLIENTE" | "FACTORING";

export interface EmpresaFactoringCliente {
  id: string;
  rut_cliente: string;
  razon_social: string;
  banco?: string | null;
  cuenta_bancaria?: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  created_at: string;
}

export interface EmpresaFactoringProveedor {
  id: string;
  rut_proveedor: string;
  razon_social: string;
  banco?: string | null;
  cuenta_bancaria?: string | null;
  created_at: string;
}

export interface EmpresaConfirming {
  id: string;
  rut_confirming: string;
  razon_social: string;
  contacto_nombre: string | null;
  contacto_email: string | null;
  created_at: string;
  updated_at?: string;
}

export type EstadoFacturaCompra =
  | "DEUDA_PROVEEDOR"
  | "FACTORING"
  | "CONFIRMING"
  | "CHEQUE"
  | "NETEO_NC"
  | "COMPRA_TC"
  | "PAGADA";

export interface NeteoCompra {
  id: string;
  factura_id: string;
  nota_credito_id: string;
  monto_neteado: number;
  saldo_restante: number;
  created_at: string;
  factura_folio?: number;
  nota_credito_folio?: number;
  rut_proveedor?: string;
  razon_social?: string;
}

export type EstadoChequeCompra = "EMITIDO" | "COBRADO" | "PROTESTADO" | "ANULADO";

export interface ChequeCompra {
  id: string;
  factura_id: string;
  numero_cheque: string;
  banco_emisor: string;
  fecha_vencimiento: string; // YYYY-MM-DD
  monto_cheque: number;
  estado: EstadoChequeCompra;
  observacion?: string | null;
  created_at: string;
  updated_at?: string;
}

export type CondicionPago = "CONTADO" | "CREDITO";

export interface FacturaCompra {
  id: string;
  nro: number;
  tipo_doc: number;
  tipo_compra: string | null;
  rut_proveedor: string;
  razon_social: string;
  folio: number;
  fecha_docto: string; // YYYY-MM-DD
  fecha_vencimiento: string; // YYYY-MM-DD
  fecha_recepcion?: string | null; // YYYY-MM-DD (Columna H SII)
  fecha_acuse_recibo?: string | null; // YYYY-MM-DD (Columna I SII)
  condicion_pago?: CondicionPago; // CONTADO o CREDITO
  monto_total: number;
  monto_saldo?: number; // Saldo deudor pendiente tras posibles neteos o cheques parciales
  deuda_proveedor?: number | null; // Para facturas CONTADO o COMPRA_TC = 0
  estado: EstadoFacturaCompra;
  modalidad_pago?: string | null;
  modalidad?: string | null;
  factoring_id?: string | null;
  factoring_proveedor_id?: string | null;
  empresa_factoring_proveedor?: EmpresaFactoringProveedor | null;
  confirming_id?: string | null;
  empresa_confirming?: EmpresaConfirming | null;
  numero_cheque?: string | null;
  fecha_vencimiento_cheque?: string | null; // YYYY-MM-DD
  banco_emisor?: string | null;
  colaborador_id?: string | null;
  colaborador?: MantenedorColaborador | null;
  on_proyecto?: string | null;
  observacion_tc?: string | null;
  neteos?: NeteoCompra[];
  cheques?: ChequeCompra[];
  total_cheques_emitidos?: number;
  saldo_restante_nc?: number; // Para NC (tipo 61): saldo disponible para netear
  saldo_pendiente?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PagoFactura {
  id: string;
  factura_id: string;
  monto_pago: number;
  fecha_pago: string; // YYYY-MM-DD
  observacion: string | null;
  created_at: string;
}

export type TipoGestionCobranza = "LLAMADA" | "CORREO" | "WHATSAPP";

export interface GestionCobranza {
  id: string;
  factura_id: string;
  tipo_gestion: TipoGestionCobranza;
  fecha_compromiso_pago: string | null; // YYYY-MM-DD
  observaciones: string;
  contacto_nombre?: string | null;
  contacto_telefono_email?: string | null;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  created_at: string;
}

export interface FacturaVenta {
  id: string;
  rut_cliente: string;
  folio: number;
  razon_social: string;
  tipo_doc: number; // Ej: 33 (Factura Electrónica), 34 (Exenta), 61 (Nota de Crédito)
  fecha_docto: string; // YYYY-MM-DD
  monto_total: number;
  tipo_docto_ref: number | null;
  folio_docto_ref: number | null;
  gestion_pago: GestionPagoTipo;
  factoring_cliente_id: string | null;
  empresa_factoring_cliente?: EmpresaFactoringCliente | null;
  monto_neto_saldo: number;
  deuda_cliente?: number | null;
  on_proyecto?: string | null;
  url_pdf?: string | null;
  fecha_vencimiento?: string | null; // YYYY-MM-DD
  pagos_facturas?: PagoFactura[];
  gestiones_cobranza?: GestionCobranza[];
  nc_referenciada_folio?: number | null;
  created_at: string;
}

export interface ActualizacionVencimientoResult {
  success: boolean;
  actualizadasCount: number;
  noEncontradasCount: number;
  totalFilasProcesadas: number;
  detalles: Array<{
    rut: string;
    folio: number;
    fechaVencimiento: string;
    encontrada: boolean;
    razonSocial?: string;
  }>;
}

export interface MantenedorON {
  id: string;
  codigo_on: string; // Código de 3 dígitos (ej: '701', '719', '740')
  nombre_proyecto: string;
  descripcion?: string | null;
  cliente_mandante?: string | null;
  activo: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SiiCsvParsedRow {
  rut_cliente: string;
  folio: number;
  razon_social: string;
  tipo_doc: number;
  fecha_docto: string;
  monto_total: number;
  tipo_docto_ref: number | null;
  folio_docto_ref: number | null;
  monto_neto_saldo: number;
  fila_origen: number;
}

export interface SiiCsvCreditNoteNettingDetail {
  nc_folio: number;
  rut_cliente: string;
  razon_social: string;
  monto_nc: number;
  factura_origen_folio: number;
  origen_ubicacion: "EN_ARCHIVO_CSV" | "EN_BASE_DE_DATOS" | "SIN_FACTURA_ORIGEN";
  saldo_anterior: number | null;
  nuevo_saldo_neto: number | null;
}

export interface SiiCsvValidationSummary {
  totalFilasLeidas: number;
  nuevosAInyectar: SiiCsvParsedRow[];
  omitidosPorDuplicidad: Array<{
    rut_cliente: string;
    folio: number;
    razon_social: string;
    tipo_doc: number;
    monto_total: number;
    motivo: "EXISTE_EN_BD" | "DUPLICADO_EN_CSV";
  }>;
  neteoNotasCredito: SiiCsvCreditNoteNettingDetail[];
  erroresFormato: Array<{
    fila: number;
    mensaje: string;
  }>;
}

export type EstadoDeudaTab = "PENDIENTES" | "PAGADAS" | "FAC_NC";

export interface FacturasVentasFilterParams {
  page?: number;
  pageSize?: number;
  rut?: string;
  folio?: string;
  onFilter?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  gestionPago?: "TODOS" | GestionPagoTipo;
  tipoDoc?: "TODOS" | "33" | "61";
  estadoDeuda?: EstadoDeudaTab;
}

export interface PaginatedFacturasResponse {
  data: FacturaVenta[];
  totalCount: number;
  pendientesCount: number;
  pagadasCount: number;
  facNcCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  subtotalMontoTotal?: number;
  subtotalDeudaCliente?: number;
  onsConDeuda?: string[];
  kpis: {
    totalFacturadoBruto: number;
    totalSaldoNeto: number;
    totalNotasCredito: number;
    montoEnFactoring: number;
    montoDirectoCliente: number;
    totalRecaudadoPagos: number;
  };
}

export type NivelPermiso = "GESTION" | "LECTURA" | "SIN_ACCESO";
export type ModalidadPermiso =
  | NivelPermiso
  | "EDICION_ESCRITURA"
  | "SOLO_LECTURA"
  | "NINGUNO";

export function normalizarNivelPermiso(nivel: string | undefined | null): NivelPermiso {
  if (!nivel) return "SIN_ACCESO";
  const upper = String(nivel).trim().toUpperCase();
  if (
    upper === "GESTION" ||
    upper === "EDICION_ESCRITURA" ||
    upper === "ESCRITURA" ||
    upper === "ADMIN" ||
    upper === "TOTAL"
  ) {
    return "GESTION";
  }
  if (
    upper === "LECTURA" ||
    upper === "SOLO_LECTURA" ||
    upper === "VISUALIZACION" ||
    upper === "CONSULTA" ||
    upper === "VER"
  ) {
    return "LECTURA";
  }
  return "SIN_ACCESO";
}

export interface ModuloSistema {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
}

export const MODULOS_SISTEMA_FINANZAS: ModuloSistema[] = [
  // A. VENTAS TENSACON
  {
    id: "ventas_global",
    nombre: "Ventas Tensacon",
    categoria: "VENTAS TENSACON",
    descripcion: "Acceso global y consolidado de ventas.",
  },
  {
    id: "facturas_ventas",
    nombre: "Facturas de Ventas",
    categoria: "VENTAS TENSACON",
    descripcion: "Libro de ventas SII, control de saldos y vencimientos.",
  },
  {
    id: "factoring_clientes",
    nombre: "Factoring Clientes",
    categoria: "VENTAS TENSACON",
    descripcion: "Cartera cedida, tasas y ranking de entidades.",
  },
  {
    id: "gestion_cobranza",
    nombre: "Gestión de Cobranza",
    categoria: "VENTAS TENSACON",
    descripcion: "Seguimiento a clientes, compromisos de pago y bitácora.",
  },

  // B. COMPRAS TENSACON
  {
    id: "compras_global",
    nombre: "Compras Tensacon",
    categoria: "COMPRAS TENSACON",
    descripcion: "Acceso general a compras y control de egresos.",
  },
  {
    id: "facturas_compras",
    nombre: "Facturas de Compras",
    categoria: "COMPRAS TENSACON",
    descripcion: "Registro de compras SII, confirmings, factoring y cheques.",
  },
  {
    id: "historico_pagos_compras",
    nombre: "Histórico Pagos Compras",
    categoria: "COMPRAS TENSACON",
    descripcion: "Consolidado de facturas y obligaciones saldadas.",
  },
  {
    id: "compromisos_compras",
    nombre: "Compromisos",
    categoria: "COMPRAS TENSACON",
    descripcion: "Obligaciones financieras por vencer y reporte PDF.",
  },
  {
    id: "match_flexline",
    nombre: "Match Flexline",
    categoria: "COMPRAS TENSACON",
    descripcion: "Conciliación SII vs Flexline mediante planilla Excel por KEY2.",
  },

  // C. TESORERÍA
  {
    id: "tesoreria_saldos",
    nombre: "Saldos Bancarios / Cartolas",
    categoria: "TESORERÍA",
    descripcion: "Importación de extractos bancarios y clasificación de líneas.",
  },
  {
    id: "tesoreria_pagos",
    nombre: "Pagos",
    categoria: "TESORERÍA",
    descripcion: "Consolidado de egresos por tipo de pago y reporte semanal.",
  },

  // D. GESTIÓN GARANTÍAS
  {
    id: "garantias_boletas",
    nombre: "Boletas de Garantía",
    categoria: "GESTIÓN GARANTÍAS",
    descripcion: "Registro, alertas por vencer y control de renovaciones.",
  },
  {
    id: "garantias_polizas",
    nombre: "Pólizas de Garantía",
    categoria: "GESTIÓN GARANTÍAS",
    descripcion: "Pólizas aseguradoras, cauciones y seguimiento de vigencia.",
  },

  // E. REG. LITIGIOS
  {
    id: "litigios_multas",
    nombre: "Multas",
    categoria: "REG. LITIGIOS",
    descripcion: "Control de sanciones laborales/administrativas y fechas de pago.",
  },
  {
    id: "litigios_comparendos",
    nombre: "Comparendos",
    categoria: "REG. LITIGIOS",
    descripcion: "Citaciones laborales y acuerdos de pago.",
  },
  {
    id: "litigios_juicios",
    nombre: "Juicios",
    categoria: "REG. LITIGIOS",
    descripcion: "Causas judiciales, control de audiencias y cuantías.",
  },
  {
    id: "litigios_calendario",
    nombre: "Calendario",
    categoria: "REG. LITIGIOS",
    descripcion: "Agenda mensual unificada de audiencias y vencimientos.",
  },

  // F. CONFIGURACIÓN
  {
    id: "mantenedor_factoring",
    nombre: "Mantenedores Factoring",
    categoria: "CONFIGURACIÓN",
    descripcion: "Entidades financieras y bancos asociados.",
  },
  {
    id: "mantenedor_mandantes_companias",
    nombre: "Mandantes & Compañías",
    categoria: "CONFIGURACIÓN",
    descripcion: "Catálogo de mandantes y aseguradoras.",
  },
  {
    id: "mantenedor_colaboradores",
    nombre: "Mantenedor Colaboradores",
    categoria: "CONFIGURACIÓN",
    descripcion: "Nómina de trabajadores y sincronización Excel.",
  },
  {
    id: "maestro_usuarios",
    nombre: "Maestro Usuarios",
    categoria: "CONFIGURACIÓN",
    descripcion: "Creación y asignación de credenciales del personal.",
  },
  {
    id: "adm_perfiles",
    nombre: "Adm. Perfiles",
    categoria: "CONFIGURACIÓN",
    descripcion: "Gestión de roles y matrices de acceso.",
  },
];

export const MODULES_LIST = MODULOS_SISTEMA_FINANZAS;

export const LEGACY_MODULE_FALLBACKS: Record<string, string[]> = {
  ventas_global: ["ventas_tensacon"],
  compras_global: ["compras_tensacon"],
  historico_pagos_compras: ["historico_pagos"],
  garantias_boletas: ["boletas_garantias", "gestion_garantias"],
  garantias_polizas: ["polizas_garantias", "gestion_garantias"],
  mantenedor_factoring: ["mantenedores"],
  mantenedor_mandantes_companias: ["mandantes_companias"],
  maestro_usuarios: ["configuracion_adm"],
  adm_perfiles: ["configuracion_adm"],
};

/**
 * Construye una matriz de permisos normalizada con todas las claves del catálogo actual.
 * Cualquier clave faltante toma por defecto "SIN_ACCESO" (respetando alias legados si existen).
 */
export function buildNormalizedPermisosMatrix(
  rawPermisos?: Record<string, string | undefined | null> | null
): Record<string, NivelPermiso> {
  const source = rawPermisos || {};
  const result: Record<string, NivelPermiso> = {};

  for (const mod of MODULOS_SISTEMA_FINANZAS) {
    let rawVal = source[mod.id];
    if (rawVal === undefined || rawVal === null || rawVal === "") {
      const legacyKeys = LEGACY_MODULE_FALLBACKS[mod.id] || [];
      for (const legacyKey of legacyKeys) {
        if (source[legacyKey] !== undefined && source[legacyKey] !== null && source[legacyKey] !== "") {
          rawVal = source[legacyKey];
          break;
        }
      }
    }
    result[mod.id] = normalizarNivelPermiso(rawVal);
  }

  return result;
}

export type ModalidadCompromiso = "CHEQUE" | "FACTORING" | "CONFIRMING";

export interface CompromisoCompra {
  id: string;
  modalidad: ModalidadCompromiso;
  rut_proveedor: string;
  razon_social: string;
  referencia_doc: string;
  fecha_vencimiento: string;
  monto: number;
  created_at: string;
  dias_faltantes?: number;
  badge_color?: "emerald" | "amber" | "rose";
}

export type ModalidadPagoCompra =
  | "DIRECTO"
  | "CHEQUE"
  | "FACTORING"
  | "CONFIRMING"
  | "NETEO_NC"
  | "COMPRA_TC"
  | "EFECTIVO";

export interface PagoCompraHistorico {
  id: string;
  factura_id?: string;
  rut_proveedor: string;
  razon_social: string;
  folio: number;
  tipo_doc: number;
  modalidad_pago: ModalidadPagoCompra;
  monto_pagado: number;
  fecha_real_pago: string;
  observacion?: string | null;
  comprobante_ref?: string | null;
  created_at: string;
}

export interface PerfilUsuario {
  id: string;
  nombre_perfil: string;
  descripcion?: string | null;
  permisos: Record<string, ModalidadPermiso>;
  created_at: string;
  updated_at?: string;
}

export interface UsuarioSistema {
  id: string;
  nombre: string;
  usuario: string;
  contrasena: string;
  correo: string;
  perfil_id: string;
  perfil_nombre?: string;
  estado: "Activo" | "Inactivo";
  ultima_conexion?: string | null;
  ultimo_pulso?: string | null;
  sesion_activa?: boolean | null;
  created_at: string;
  updated_at?: string;
}

// =========================================================================
// MÓDULO GESTIÓN GARANTÍAS Y MANTENEDORES
// =========================================================================

export type MonedaGarantia = "CLP" | "UF" | "USD";

export type EstadoGarantia = "VIGENTE" | "PROXIMA_A_VENCER" | "VENCIDA";

export interface MantenedorMandante {
  id: string;
  rut_mandante: string;
  rut?: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MantenedorCompania {
  id: string;
  rut_compania: string;
  rut?: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface BoletaGarantia {
  id: string;
  nro_folio: string;
  on_proyecto?: string | null;
  mandante_id: string;
  mandante?: MantenedorMandante | null;
  compania_id: string;
  compania?: MantenedorCompania | null;
  motivo: string;
  monto: number;
  monto_uf?: number;
  moneda: MonedaGarantia;
  fecha_emision: string; // YYYY-MM-DD
  fecha_vencimiento: string; // YYYY-MM-DD
  obra?: string | null;
  proyecto?: string | null;
  contrafianza?: string | null;
  contrafianza_compania?: string | null;
  contador_renovaciones: number;
  created_at: string;
  updated_at?: string;
}

export interface PolizaGarantia {
  id: string;
  nro_folio: string;
  on_proyecto?: string | null;
  mandante_id: string;
  mandante?: MantenedorMandante | null;
  compania_id: string;
  compania?: MantenedorCompania | null;
  motivo: string;
  monto: number;
  monto_uf?: number;
  moneda: MonedaGarantia;
  fecha_emision: string; // YYYY-MM-DD
  fecha_vencimiento: string; // YYYY-MM-DD
  obra?: string | null;
  proyecto?: string | null;
  contrafianza?: string | null;
  contrafianza_compania?: string | null;
  contador_renovaciones: number;
  created_at: string;
  updated_at?: string;
}

export type EstadoGestionGarantia =
  | "En trámite de renovación"
  | "Evaluación con créditos / finanzas"
  | "En negociación con ejecutivos / banco"
  | "Cotizando con nueva entidad"
  | "Solicitud de devolución / finiquito"
  | "Otra gestión";

export interface GestionGarantia {
  id: string;
  tipo_documento: "BOLETA" | "POLIZA";
  documento_id: string;
  estado_gestion: string;
  observacion: string;
  fecha_proximo_seguimiento?: string | null; // YYYY-MM-DD
  usuario_nombre?: string | null;
  created_at: string;
}

export interface GarantiaItemWithRelations {
  id: string;
  nro_folio: string;
  on_proyecto?: string | null;
  mandante_id: string;
  mandante_razon_social: string;
  mandante_rut?: string;
  compania_id: string;
  compania_razon_social: string;
  compania_rut?: string;
  motivo: string;
  monto: number;
  monto_uf?: number;
  moneda: MonedaGarantia;
  fecha_emision: string; // YYYY-MM-DD
  fecha_vencimiento: string; // YYYY-MM-DD
  obra?: string | null;
  proyecto?: string | null;
  contrafianza?: string | null;
  contrafianza_compania?: string | null;
  contador_renovaciones: number;
  estado: EstadoGarantia;
  dias_restantes: number;
  gestiones_count?: number;
  ultima_gestion_estado?: string | null;
  ultima_gestion_fecha?: string | null;
  ultima_gestion_seguimiento?: string | null;
  gestiones?: GestionGarantia[];
  created_at: string;
  updated_at?: string;
}

export interface HistorialRenovacionGarantia {
  id: string;
  tipo_documento?: "BOLETA" | "POLIZA";
  tipo_garantia?: "BOLETA" | "POLIZA";
  documento_id: string;
  nro_renovacion?: number;
  fecha_vencimiento_anterior: string; // YYYY-MM-DD
  fecha_vencimiento_nueva: string; // YYYY-MM-DD
  observaciones?: string | null;
  usuario_id?: string | null;
  created_at: string;
}

export interface GarantiasKpiSummary {
  totalDocumentos: number;
  totalMontoClp: number;
  totalMontoUf: number;
  totalMontoUsd: number;
  vigentesCount: number;
  proximasVencerCount: number;
  vencidasCount: number;
  renovacionesCount?: number;
}

// ============================================================================
// 10. REG. LITIGIOS (MULTAS, JUICIOS Y COMPARENDOS)
// ============================================================================

export type EstadoLitigioMulta = "PENDIENTE" | "PAGADA";

export interface LitigioMulta {
  id: string;
  procedencia: string;
  entidad?: string | null;
  nro_multa: string;
  fecha_publicacion: string; // YYYY-MM-DD
  monto_sancion: number;
  nro_resolucion?: string | null;
  fecha_resolucion?: string | null; // YYYY-MM-DD
  fecha_pago?: string | null; // YYYY-MM-DD
  estado: EstadoLitigioMulta;
  observaciones?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LitigiosMultasKpis {
  totalMultas: number;
  montoTotalSancion: number;
  pendientesCount: number;
  montoPendiente: number;
  pagadasCount: number;
  montoPagado: number;
}

export type EstadoLitigioJuicio = "PENDIENTE" | "PAGADA" | "CONCLUIDO";

export interface LitigioAudienciaJuicio {
  id: string;
  juicio_id: string;
  numero_audiencia: number;
  fecha_audiencia: string; // YYYY-MM-DD
  resultado_dictamen?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LitigioJuicio {
  id: string;
  rit_ruc: string;
  nombre_trabajador: string;
  materia: string;
  cuantia: number;
  cuantia_clp?: number;
  primera_audiencia_fecha?: string | null; // YYYY-MM-DD (legacy fallback)
  primera_audiencia_resultado?: string | null;
  segunda_audiencia_fecha?: string | null; // YYYY-MM-DD (legacy fallback)
  segunda_audiencia_resultado?: string | null;
  audiencias?: LitigioAudienciaJuicio[];
  ultima_audiencia?: LitigioAudienciaJuicio | null;
  estado: EstadoLitigioJuicio;
  observaciones?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LitigiosJuiciosKpis {
  totalJuicios: number;
  cuantiaTotal: number;
  enTramitacionCount: number;
  cuantiaEnTramitacion: number;
  concluidosCount: number;
  cuantiaConcluida: number;
}

export type TipoEventoCalendarioLitigio = "AUDIENCIA_JUICIO" | "MULTA" | "COMPARENDO";

export interface EventoCalendarioLitigio {
  evento_id: string;
  tipo_evento: TipoEventoCalendarioLitigio;
  identificador: string;
  titulo: string;
  detalle: string;
  fecha_evento: string; // YYYY-MM-DD
  estado_general: string;
  ruta_origen: string;
  monto?: number;
  entidad_o_materia?: string;
  observaciones?: string | null;
}

export interface CalendarioLitigiosKpis {
  eventosEsteMes: number;
  audienciasProgramadas: number;
  multasComparendosProximos: number;
}

// ============================================================================
// 4. SUBMÓDULO: COMPARENDOS & CUOTAS DE ACUERDO
// ============================================================================

export type EstadoComparendo = "PENDIENTE" | "ACUERDO_EN_PAGO" | "PAGADO";
export type EstadoCuotaComparendo = "PENDIENTE" | "PAGADA";

export interface CuotaComparendo {
  id: string;
  comparendo_id: string;
  numero_cuota: number;
  monto_cuota: number;
  fecha_vencimiento_cuota: string; // YYYY-MM-DD
  estado_cuota: EstadoCuotaComparendo;
  fecha_pago_real?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LitigioComparendo {
  id: string;
  nombre_trabajador: string;
  fecha_finiquito?: string | null; // YYYY-MM-DD
  reserva_derechos: boolean;
  causal_termino: string;
  fecha_comparendo: string; // YYYY-MM-DD
  asistencia_empresa: boolean;
  motivo_observacion?: string | null;
  monto_acuerdo_total: number;
  estado: EstadoComparendo;
  cuotas?: CuotaComparendo[];
  created_at: string;
  updated_at?: string;
}

export interface LitigiosComparendosKpis {
  totalComparendos: number;
  montoAcuerdosTotal: number;
  pendientesCount: number;
  montoPendiente: number;
  saldadosCount: number;
  montoSaldado: number;
}

export interface ComparendosFilterParams {
  query?: string;
  estado?: EstadoComparendo | "TODOS";
  causal?: string | "TODAS";
  asistencia?: "TODAS" | "SI" | "NO";
  reserva?: "TODAS" | "SI" | "NO";
}

// ============================================================================
// 5. SUBMÓDULO: MANTENEDOR COLABORADORES
// ============================================================================

export interface MantenedorColaborador {
  id: string;
  rut: string; // Formato limpio sin puntos ni guion (ej. 12345678K)
  nombre: string; // Nombre completo en mayúsculas
  cargo: string;
  activo: boolean;
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// 6. MÓDULO: TESORERÍA, CARTOLAS BANCARIAS Y TIPOS DE PAGO
// ============================================================================

export interface MantenedorTipoPago {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  created_at: string;
  updated_at?: string;
}

export type BancoCartola = "Banco Itaú" | "Banco Santander";

export interface CartolaBancaria {
  id: string;
  banco: string;
  numero_cartola: string;
  numero_cuenta: string;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  saldo_inicial: number;
  saldo_final: number;
  created_at: string;
}

export interface CartolaLinea {
  id: string;
  cartola_id: string;
  banco?: string;
  numero_cartola?: string;
  numero_cuenta?: string;
  movimiento_key?: string | null;
  fecha: string; // YYYY-MM-DD
  numero_operacion?: string | null;
  descripcion: string;
  giro: number;
  abono: number;
  saldo?: number | null;
  tipo_pago_id?: string | null;
  tipo_pago?: MantenedorTipoPago | null;
  created_at: string;
}

