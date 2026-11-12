import fs from "fs";
import path from "path";
import {
  EmpresaConfirming,
  EmpresaFactoringCliente,
  EmpresaFactoringProveedor,
  FacturaCompra,
  FacturaVenta,
  GestionCobranza,
  NeteoCompra,
  ChequeCompra,
  PagoFactura,
  PerfilUsuario,
  UsuarioSistema,
  PagoCompraHistorico,
  MantenedorMandante,
  MantenedorCompania,
  BoletaGarantia,
  PolizaGarantia,
  HistorialRenovacionGarantia,
  GestionGarantia,
  LitigioMulta,
  LitigioJuicio,
  LitigioAudienciaJuicio,
  LitigioComparendo,
  CuotaComparendo,
  MantenedorON,
  MantenedorColaborador,
  MantenedorTipoPago,
  CartolaBancaria,
  CartolaLinea,
} from "@/types/database.types";

export interface LocalDatabaseSchema {
  mantenedor_on?: MantenedorON[];
  mantenedor_colaboradores?: MantenedorColaborador[];
  mantenedor_tipos_pago?: MantenedorTipoPago[];
  cartolas_bancarias?: CartolaBancaria[];
  cartolas_lineas?: CartolaLinea[];
  empresa_factoring_cliente: EmpresaFactoringCliente[];
  empresa_factoring_proveedores: EmpresaFactoringProveedor[];
  empresa_confirming: EmpresaConfirming[];
  facturas_ventas: FacturaVenta[];
  facturas_compras: FacturaCompra[];
  neteos_compras: NeteoCompra[];
  cheques_compras: ChequeCompra[];
  pagos_compras?: PagoCompraHistorico[];
  pagos_facturas: PagoFactura[];
  gestiones_cobranza: GestionCobranza[];
  perfiles: PerfilUsuario[];
  usuarios: UsuarioSistema[];
  mantenedor_mandantes?: MantenedorMandante[];
  mantenedor_companias?: MantenedorCompania[];
  boletas_garantias?: BoletaGarantia[];
  polizas_garantias?: PolizaGarantia[];
  historial_renovaciones_garantias?: HistorialRenovacionGarantia[];
  gestiones_garantias?: GestionGarantia[];
  litigios_multas?: LitigioMulta[];
  litigios_juicios?: LitigioJuicio[];
  litigios_audiencias_juicio?: LitigioAudienciaJuicio[];
  litigios_comparendos?: LitigioComparendo[];
  litigios_cuotas_comparendo?: CuotaComparendo[];
}

const IS_READONLY_FS = process.env.VERCEL === "1";
const DB_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DB_DIR, "finanzas-local-db.json");

const INITIAL_PAGOS_COMPRAS: PagoCompraHistorico[] = [];

const INITIAL_TIPOS_PAGO: MantenedorTipoPago[] = [
  {
    id: "mtp-orden-compra",
    nombre: "ORDEN DE COMPRA",
    descripcion: "Pagos asociados a órdenes de compra de materiales, insumos o servicios",
    activo: true,
    created_at: "2026-10-01T10:00:00.000Z",
  },
  {
    id: "mtp-pagos-proveedores",
    nombre: "PAGOS A PROVEEDORES",
    descripcion: "Transferencias, nóminas o liquidaciones directas a proveedores",
    activo: true,
    created_at: "2026-10-01T10:00:00.000Z",
  },
];

const INITIAL_SEED: LocalDatabaseSchema = {
  pagos_compras: INITIAL_PAGOS_COMPRAS,
  mantenedor_tipos_pago: INITIAL_TIPOS_PAGO,
  cartolas_bancarias: [],
  cartolas_lineas: [],
  empresa_factoring_cliente: [
    {
      id: "efc-1001-tanner",
      rut_cliente: "96543210-K",
      razon_social: "Tanner Servicios Financieros S.A.",
      contacto_nombre: "Rodrigo Valdés Matte",
      contacto_email: "operaciones.factoring@tanner.cl",
      created_at: "2026-10-01T10:00:00.000Z",
    },
    {
      id: "efc-1002-bci",
      rut_cliente: "96812340-5",
      razon_social: "BCI Factoring S.A.",
      contacto_nombre: "Camila Fuenzalida",
      contacto_email: "cesiones@bcifactoring.cl",
      created_at: "2026-10-02T11:30:00.000Z",
    },
    {
      id: "efc-1003-santander",
      rut_cliente: "77190450-2",
      razon_social: "Santander Factoring S.A.",
      contacto_nombre: "Andrés Larraín",
      contacto_email: "ejecutivos@santanderfactoring.cl",
      created_at: "2026-10-03T15:10:00.000Z",
    },
  ],
  empresa_factoring_proveedores: [
    { id: "efp-1", rut_proveedor: "1", razon_social: "7 CUMBRES SERV. FINANCIEROS", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-2", rut_proveedor: "2", razon_social: "ACF CAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-3", rut_proveedor: "3", razon_social: "ALTAVISTA FACTORING SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-4", rut_proveedor: "4", razon_social: "BANCO ESTADO", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-5", rut_proveedor: "5", razon_social: "BANINTER", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-6", rut_proveedor: "6", razon_social: "BANPRO", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-7", rut_proveedor: "7", razon_social: "BANPROYECTA SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-8", rut_proveedor: "8", razon_social: "BCI FACTORING", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-9", rut_proveedor: "9", razon_social: "BILL CAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-10", rut_proveedor: "10", razon_social: "BL CAPITAL SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-11", rut_proveedor: "11", razon_social: "BLACKSTONE FACTORING SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-12", rut_proveedor: "12", razon_social: "BOLSA DE PRODUCTOS", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-13", rut_proveedor: "13", razon_social: "BULL CAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-14", rut_proveedor: "14", razon_social: "CAPITAL EXPRESS", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-15", rut_proveedor: "15", razon_social: "CBP FINANCIA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-16", rut_proveedor: "16", razon_social: "CHITA SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-17", rut_proveedor: "17", razon_social: "COMERCIAL DE VALORES", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-18", rut_proveedor: "18", razon_social: "CORDADA SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-19", rut_proveedor: "19", razon_social: "CREDYT", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-20", rut_proveedor: "20", razon_social: "EUROCAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-21", rut_proveedor: "21", razon_social: "FACTOTAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-22", rut_proveedor: "22", razon_social: "FINAMERIS S A", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-23", rut_proveedor: "23", razon_social: "FINCAP", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-24", rut_proveedor: "24", razon_social: "FINTERRA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-25", rut_proveedor: "25", razon_social: "GBV CAPITALES", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-26", rut_proveedor: "26", razon_social: "INCOFIN S.A", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-27", rut_proveedor: "27", razon_social: "INTERFACTOR S.A", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-28", rut_proveedor: "28", razon_social: "INVERSIONES YAKORA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-29", rut_proveedor: "29", razon_social: "KASTEN SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-30", rut_proveedor: "30", razon_social: "MOONK FACTORING", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-31", rut_proveedor: "31", razon_social: "NUVIA CAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-32", rut_proveedor: "32", razon_social: "ORSAN FACTORING", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-33", rut_proveedor: "33", razon_social: "PENTA FINANCIERO", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-34", rut_proveedor: "34", razon_social: "PRIMUS CAPITAL", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-35", rut_proveedor: "35", razon_social: "PROGRESO SERV.FINANCIEROS", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-36", rut_proveedor: "36", razon_social: "REDCAPITAL SPA", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-37", rut_proveedor: "37", razon_social: "SECURITY S.A", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-38", rut_proveedor: "38", razon_social: "SW FACTORING S.A", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-39", rut_proveedor: "39", razon_social: "TANNER SERV.FINANCIEROS", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-40", rut_proveedor: "40", razon_social: "TOTALFACTOR", created_at: "2026-10-18T00:00:00.000Z" },
    { id: "efp-41", rut_proveedor: "41", razon_social: "XEPELIN", created_at: "2026-10-18T00:00:00.000Z" },
  ],
  empresa_confirming: [
    {
      id: "ec-4001-bci",
      rut_confirming: "96812340-5",
      razon_social: "BCI Confirming / Servicios Financieros",
      contacto_nombre: "Paulina Morales",
      contacto_email: "confirming.proveedores@bci.cl",
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "ec-4002-santander",
      rut_confirming: "77190450-2",
      razon_social: "Santander Confirming Corporate",
      contacto_nombre: "Felipe Oyarzún",
      contacto_email: "confirming@santander.cl",
      created_at: "2026-10-02T10:15:00.000Z",
    },
    {
      id: "ec-4003-chile",
      rut_confirming: "97004000-5",
      razon_social: "Banco de Chile Confirming y Pronto Pago",
      contacto_nombre: "Gonzalo Castro",
      contacto_email: "confirming@bancochile.cl",
      created_at: "2026-10-03T11:45:00.000Z",
    },
  ],
  facturas_ventas: [
    {
      id: "fv-3001",
      rut_cliente: "76129480-K",
      folio: 10452,
      razon_social: "CONSTRUCTORA ALTIPLANO INFRAESTRUCTURA SPA",
      tipo_doc: 33,
      fecha_docto: "2026-10-03",
      monto_total: 126827164,
      tipo_docto_ref: null,
      folio_docto_ref: null,
      gestion_pago: "FACTORING",
      factoring_cliente_id: "efc-1001-tanner",
      monto_neto_saldo: 112327164,
      deuda_cliente: 112327164,
      created_at: "2026-10-03T14:00:00.000Z",
    },
    {
      id: "fv-3002",
      rut_cliente: "76129480-K",
      folio: 812,
      razon_social: "CONSTRUCTORA ALTIPLANO INFRAESTRUCTURA SPA",
      tipo_doc: 61,
      fecha_docto: "2026-10-05",
      monto_total: 14500000,
      tipo_docto_ref: 33,
      folio_docto_ref: 10452,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: 0,
      deuda_cliente: 0,
      created_at: "2026-10-05T10:30:00.000Z",
    },
    {
      id: "fv-3003",
      rut_cliente: "96501880-2",
      folio: 10453,
      razon_social: "MINERA CORDILLERA DEL COBRE S.A.",
      tipo_doc: 33,
      fecha_docto: "2026-10-07",
      monto_total: 84590000,
      tipo_docto_ref: null,
      folio_docto_ref: null,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: 84590000,
      deuda_cliente: 84590000,
      created_at: "2026-10-07T09:15:00.000Z",
    },
    {
      id: "fv-3004",
      rut_cliente: "76129480-K",
      folio: 10420,
      razon_social: "CONSTRUCTORA ALTIPLANO INFRAESTRUCTURA SPA",
      tipo_doc: 33,
      fecha_docto: "2026-09-08",
      monto_total: 48900000,
      tipo_docto_ref: null,
      folio_docto_ref: null,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: 48900000,
      deuda_cliente: 48900000,
      created_at: "2026-09-08T10:00:00.000Z",
    },
    {
      id: "fv-3005",
      rut_cliente: "76129480-K",
      folio: 10435,
      razon_social: "CONSTRUCTORA ALTIPLANO INFRAESTRUCTURA SPA",
      tipo_doc: 33,
      fecha_docto: "2026-09-24",
      monto_total: 32450000,
      tipo_docto_ref: null,
      folio_docto_ref: null,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: 32450000,
      deuda_cliente: 32450000,
      created_at: "2026-09-24T11:00:00.000Z",
    },
    {
      id: "fv-3006",
      rut_cliente: "96501880-2",
      folio: 10440,
      razon_social: "MINERA CORDILLERA DEL COBRE S.A.",
      tipo_doc: 33,
      fecha_docto: "2026-09-22",
      monto_total: 61200000,
      tipo_docto_ref: null,
      folio_docto_ref: null,
      gestion_pago: "DIRECTO_CLIENTE",
      factoring_cliente_id: null,
      monto_neto_saldo: 61200000,
      deuda_cliente: 61200000,
      created_at: "2026-09-22T08:30:00.000Z",
    },
  ],
  pagos_facturas: [],
  gestiones_cobranza: [
    {
      id: "gc-5001",
      factura_id: "fv-3001",
      tipo_gestion: "LLAMADA",
      fecha_compromiso_pago: "2026-10-25",
      observaciones: "Contacto con tesorero Marcelo Ríos. Se revisó estado de la factura 10452; indica que está en nómina de pago con transferencia programada.",
      contacto_nombre: "Marcelo Ríos - Tesorería",
      contacto_telefono_email: "+56 9 8765 4321 / mrios@altiplano.cl",
      usuario_id: "usr-1",
      usuario_nombre: "Cedrix Vargas",
      created_at: "2026-10-14T11:30:00.000Z",
    },
    {
      id: "gc-5002",
      factura_id: "fv-3001",
      tipo_gestion: "CORREO",
      fecha_compromiso_pago: null,
      observaciones: "Envío de recordatorio y carátula DTE 10452 solicitando confirmación de recepción y fecha tentativa de abono.",
      contacto_nombre: "Marcelo Ríos",
      contacto_telefono_email: "mrios@altiplano.cl",
      usuario_id: "usr-2",
      usuario_nombre: "Javiera Rebolledo",
      created_at: "2026-10-09T16:15:00.000Z",
    },
  ],
  facturas_compras: [],
  neteos_compras: [],
  cheques_compras: [],
  perfiles: [
    {
      id: "perf-1",
      nombre_perfil: "ADMINISTRADOR",
      descripcion: "Acceso total y configuración del sistema Finanzas Tensacon",
      permisos: {
        ventas_tensacon: "EDICION_ESCRITURA",
        facturas_ventas: "EDICION_ESCRITURA",
        factoring_clientes: "EDICION_ESCRITURA",
        mantenedores: "EDICION_ESCRITURA",
        configuracion_adm: "EDICION_ESCRITURA",
      },
      created_at: "2026-10-01T08:00:00.000Z",
    },
    {
      id: "perf-2",
      nombre_perfil: "JEFE_FINANZAS",
      descripcion: "Gestión de facturación, tesorería, factoring y consulta de configuración",
      permisos: {
        ventas_tensacon: "EDICION_ESCRITURA",
        facturas_ventas: "EDICION_ESCRITURA",
        factoring_clientes: "EDICION_ESCRITURA",
        mantenedores: "EDICION_ESCRITURA",
        configuracion_adm: "SOLO_LECTURA",
      },
      created_at: "2026-10-01T08:30:00.000Z",
    },
    {
      id: "perf-3",
      nombre_perfil: "ANALISTA_TESORERIA",
      descripcion: "Control de pagos, libro de ventas y registro de abonos",
      permisos: {
        ventas_tensacon: "SOLO_LECTURA",
        facturas_ventas: "EDICION_ESCRITURA",
        factoring_clientes: "SOLO_LECTURA",
        mantenedores: "SOLO_LECTURA",
        configuracion_adm: "SIN_ACCESO",
      },
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "perf-4",
      nombre_perfil: "AUDITOR_CONSULTA",
      descripcion: "Solo lectura y auditoría de documentos tributarios",
      permisos: {
        ventas_tensacon: "SOLO_LECTURA",
        facturas_ventas: "SOLO_LECTURA",
        factoring_clientes: "SOLO_LECTURA",
        mantenedores: "SOLO_LECTURA",
        configuracion_adm: "SIN_ACCESO",
      },
      created_at: "2026-10-01T09:30:00.000Z",
    },
    {
      id: "perf-rrhh",
      nombre_perfil: "RRHH",
      descripcion: "Recursos Humanos y Gestión de Litigios Laborales",
      permisos: {
        ventas_tensacon: "NINGUNO",
        facturas_ventas: "NINGUNO",
        factoring_clientes: "NINGUNO",
        gestion_cobranza: "NINGUNO",
        compras_tensacon: "NINGUNO",
        facturas_compras: "NINGUNO",
        historico_pagos: "NINGUNO",
        compromisos_compras: "NINGUNO",
        gestion_garantias: "NINGUNO",
        boletas_garantias: "NINGUNO",
        polizas_garantias: "NINGUNO",
        mandantes_companias: "NINGUNO",
        mantenedores: "NINGUNO",
        configuracion_adm: "NINGUNO",
        reg_litigios: "GESTION",
        litigios_multas: "GESTION",
        litigios_comparendos: "GESTION",
        litigios_juicios: "GESTION",
      },
      created_at: "2026-10-21T14:41:08.469Z",
    },
  ],
  usuarios: [
    {
      id: "usr-frojas",
      nombre: "Felicia Rojas",
      usuario: "frojas",
      contrasena: "Km40",
      correo: "felicia.rojas@tensacon.cl",
      perfil_id: "perf-rrhh",
      perfil_nombre: "RRHH",
      estado: "Activo",
      created_at: "2026-10-21T14:41:39.874Z",
    },
    {
      id: "usr-1",
      nombre: "Cedrix Vargas",
      usuario: "cvargas",
      contrasena: "Tensacon2026!",
      correo: "cvargas@tensacon.cl",
      perfil_id: "perf-1",
      perfil_nombre: "ADMINISTRADOR",
      estado: "Activo",
      created_at: "2026-10-01T10:00:00.000Z",
    },
    {
      id: "usr-2",
      nombre: "Javiera Rebolledo",
      usuario: "jrebolledo",
      contrasena: "Finanzas2026*",
      correo: "jrebolledo@tensacon.cl",
      perfil_id: "perf-2",
      perfil_nombre: "JEFE_FINANZAS",
      estado: "Activo",
      created_at: "2026-10-02T11:00:00.000Z",
    },
    {
      id: "usr-3",
      nombre: "Rodrigo Valdés",
      usuario: "rvaldes",
      contrasena: "Tesoreria2026#",
      correo: "rvaldes@tensacon.cl",
      perfil_id: "perf-3",
      perfil_nombre: "ANALISTA_TESORERIA",
      estado: "Activo",
      created_at: "2026-10-03T14:30:00.000Z",
    },
  ],
  mantenedor_mandantes: [
    {
      id: "man-001",
      rut_mandante: "61202000-0",
      razon_social: "Dirección de Vialidad - MOP",
      contacto_nombre: "Ing. Carlos Mendoza Silva",
      contacto_email: "cmendoza@mop.gov.cl",
      contacto_telefono: "+56 2 2449 3000",
      created_at: "2026-01-15T09:00:00.000Z",
    },
    {
      id: "man-002",
      rut_mandante: "96722000-8",
      razon_social: "Metro de Santiago S.A.",
      contacto_nombre: "Paulina Soto Herrera",
      contacto_email: "psoto@metro.cl",
      contacto_telefono: "+56 2 2937 2000",
      created_at: "2026-02-10T11:00:00.000Z",
    },
    {
      id: "man-003",
      rut_mandante: "96953480-1",
      razon_social: "Sociedad Concesionaria Costanera Norte S.A.",
      contacto_nombre: "Andrés Larraín Vial",
      contacto_email: "alarrain@costaneranorte.cl",
      contacto_telefono: "+56 2 2490 0000",
      created_at: "2026-03-05T14:30:00.000Z",
    },
    {
      id: "man-004",
      rut_mandante: "61704000-K",
      razon_social: "Codelco Chile - División El Teniente",
      contacto_nombre: "Felipe Oyarzún Gómez",
      contacto_email: "foyarzun@codelco.cl",
      contacto_telefono: "+56 72 229 2000",
      created_at: "2026-04-12T16:00:00.000Z",
    },
  ],
  mantenedor_companias: [
    {
      id: "cia-001",
      rut_compania: "97004000-5",
      razon_social: "Banco de Chile",
      contacto_nombre: "Marcela Domínguez Prat",
      contacto_email: "garantias@bancochile.cl",
      contacto_telefono: "+56 2 2637 1111",
      created_at: "2026-01-10T10:00:00.000Z",
    },
    {
      id: "cia-002",
      rut_compania: "97036000-K",
      razon_social: "Banco Santander Chile",
      contacto_nombre: "Gonzalo Valenzuela",
      contacto_email: "boletas@santander.cl",
      contacto_telefono: "+56 2 2320 0000",
      created_at: "2026-01-12T11:30:00.000Z",
    },
    {
      id: "cia-003",
      rut_compania: "99024000-4",
      razon_social: "HDI Seguros S.A.",
      contacto_nombre: "Constanza Morales",
      contacto_email: "polizas.garantia@hdi.cl",
      contacto_telefono: "+56 2 2340 5000",
      created_at: "2026-01-20T14:00:00.000Z",
    },
    {
      id: "cia-004",
      rut_compania: "99043000-8",
      razon_social: "Mapfre Compañía de Seguros Generales",
      contacto_nombre: "Rodrigo Echeverría",
      contacto_email: "garantias@mapfre.cl",
      contacto_telefono: "+56 2 2694 7000",
      created_at: "2026-02-01T15:20:00.000Z",
    },
  ],
  boletas_garantias: [
    {
      id: "bg-001",
      nro_folio: "BG-2026-8841",
      on_proyecto: "740",
      mandante_id: "man-001",
      compania_id: "cia-001",
      motivo: "Fiel cumplimiento de contrato y correcta ejecución de obras",
      monto: 1184.2,
      monto_uf: 1184.2,
      moneda: "UF",
      fecha_emision: "2026-03-01",
      fecha_vencimiento: "2026-12-15",
      obra: "Puente Américo Vespucio Oriente",
      proyecto: "AVO-II Tramo Sur",
      contrafianza: "Pagaré notarial a la vista N° 55421",
      contrafianza_compania: "Banco de Chile",
      contador_renovaciones: 1,
      created_at: "2026-03-01T10:00:00.000Z",
    },
    {
      id: "bg-002",
      nro_folio: "BG-2026-9022",
      on_proyecto: "780",
      mandante_id: "man-002",
      compania_id: "cia-002",
      motivo: "Anticipo de fondos para obras de túnel y excavaciones subterráneas de gran envergadura",
      monto: 1250.0,
      monto_uf: 1250.0,
      moneda: "UF",
      fecha_emision: "2026-05-10",
      fecha_vencimiento: "2026-10-28",
      obra: "Línea 7 Metro Estación Matucana",
      proyecto: "L7-Piques y Galerías",
      contrafianza: null,
      contrafianza_compania: null,
      contador_renovaciones: 0,
      created_at: "2026-05-10T12:00:00.000Z",
    },
    {
      id: "bg-003",
      nro_folio: "BG-2025-4120",
      on_proyecto: "712",
      mandante_id: "man-003",
      compania_id: "cia-001",
      motivo: "Seriedad de la oferta en proceso de licitación pública internacional",
      monto: 394.7,
      monto_uf: 394.7,
      moneda: "UF",
      fecha_emision: "2025-08-01",
      fecha_vencimiento: "2026-09-30",
      obra: "Enlace Chicureo Norte",
      proyecto: "ENL-CHIC-2025",
      contrafianza: null,
      contrafianza_compania: null,
      contador_renovaciones: 0,
      created_at: "2025-08-01T09:00:00.000Z",
    },
  ],
  polizas_garantias: [
    {
      id: "pg-001",
      nro_folio: "POL-HDI-77892",
      on_proyecto: "740",
      mandante_id: "man-004",
      compania_id: "cia-003",
      motivo: "Correcto uso de anticipos, fondos operativos y estricto cumplimiento laboral y previsional",
      monto: 2150.0,
      monto_uf: 2150.0,
      moneda: "UF",
      fecha_emision: "2026-02-15",
      fecha_vencimiento: "2027-02-15",
      obra: "Nuevo Nivel Mina Teniente",
      proyecto: "NNM-Sector 5",
      contrafianza: "Póliza cruzada con Mapfre Seguros",
      contrafianza_compania: "Mapfre Compañía de Seguros",
      contador_renovaciones: 2,
      created_at: "2026-02-15T11:00:00.000Z",
    },
    {
      id: "pg-002",
      nro_folio: "POL-MAP-33104",
      on_proyecto: "780",
      mandante_id: "man-001",
      compania_id: "cia-004",
      motivo: "Fiel cumplimiento de contrato y ejecución de obras viales",
      monto: 2400.0,
      monto_uf: 2400.0,
      moneda: "UF",
      fecha_emision: "2026-04-01",
      fecha_vencimiento: "2026-10-31",
      obra: "Mejoramiento Ruta 5 Sur Km 85",
      proyecto: "MOP-VI-2026",
      contrafianza: null,
      contrafianza_compania: null,
      contador_renovaciones: 0,
      created_at: "2026-04-01T15:00:00.000Z",
    },
    {
      id: "pg-003",
      nro_folio: "POL-HDI-66512",
      on_proyecto: "765",
      mandante_id: "man-002",
      compania_id: "cia-003",
      motivo: "Canje de retenciones de estados de pago correspondientes a hitos constructivos aprobados",
      monto: 2578.9,
      monto_uf: 2578.9,
      moneda: "UF",
      fecha_emision: "2026-01-20",
      fecha_vencimiento: "2027-01-20",
      obra: "Talleres y Cocheras Línea 7",
      proyecto: "L7-Talleres Renca",
      contrafianza: "Respaldo fianza matriz Banco Santander",
      contrafianza_compania: "Banco Santander Chile",
      contador_renovaciones: 1,
      created_at: "2026-01-20T10:30:00.000Z",
    },
  ],
  historial_renovaciones_garantias: [
    {
      id: "ren-001",
      tipo_garantia: "BOLETA",
      documento_id: "bg-001",
      nro_renovacion: 1,
      fecha_vencimiento_anterior: "2026-06-15",
      fecha_vencimiento_nueva: "2026-12-15",
      observaciones: "Prórroga por ampliación de plazo contractual",
      created_at: "2026-06-01T10:00:00.000Z",
    },
    {
      id: "ren-002",
      tipo_garantia: "POLIZA",
      documento_id: "pg-001",
      nro_renovacion: 1,
      fecha_vencimiento_anterior: "2026-08-15",
      fecha_vencimiento_nueva: "2026-11-15",
      observaciones: "Primera prórroga ordinaria",
      created_at: "2026-08-01T09:00:00.000Z",
    },
    {
      id: "ren-003",
      tipo_garantia: "POLIZA",
      documento_id: "pg-001",
      nro_renovacion: 2,
      fecha_vencimiento_anterior: "2026-11-15",
      fecha_vencimiento_nueva: "2027-02-15",
      observaciones: "Segunda prórroga por recepción provisoria",
      created_at: "2026-11-01T12:00:00.000Z",
    },
    {
      id: "ren-004",
      tipo_garantia: "POLIZA",
      documento_id: "pg-003",
      nro_renovacion: 1,
      fecha_vencimiento_anterior: "2026-07-20",
      fecha_vencimiento_nueva: "2027-01-20",
      observaciones: "Ampliación según anexo N° 3",
      created_at: "2026-07-10T14:00:00.000Z",
    },
  ],
  litigios_multas: [
    {
      id: "mul-001",
      procedencia: "Registro de Asistencia",
      entidad: "Dirección del Trabajo",
      nro_multa: "DT-2026-4412",
      fecha_publicacion: "2026-09-15",
      monto_sancion: 3250000,
      nro_resolucion: "RES-EX-1092/2026",
      fecha_resolucion: "2026-09-10",
      fecha_pago: null,
      estado: "PENDIENTE",
      observaciones: "Sanción por registro de asistencia en faena Lo Espejo. Presentado recurso de reconsideración administrativa.",
      created_at: "2026-09-15T10:00:00.000Z",
    },
    {
      id: "mul-002",
      procedencia: "Fiscalización Sanitaria",
      entidad: "SEREMI de Salud RM",
      nro_multa: "SEREMI-7731",
      fecha_publicacion: "2026-07-20",
      monto_sancion: 1850000,
      nro_resolucion: "RES-7731/2026",
      fecha_resolucion: "2026-07-15",
      fecha_pago: "2026-08-05",
      estado: "PAGADA",
      observaciones: "Fiscalización sanitaria en campamento de obra. Pago completado vía TGR con comprobante folio 991204.",
      created_at: "2026-07-20T14:30:00.000Z",
    },
    {
      id: "mul-003",
      procedencia: "Ocupación Bien Nacional de Uso Público",
      entidad: "Municipalidad de Providencia",
      nro_multa: "JPL-90218",
      fecha_publicacion: "2026-06-10",
      monto_sancion: 420000,
      nro_resolucion: "SENT-1°JPL-2026",
      fecha_resolucion: "2026-06-05",
      fecha_pago: "2026-06-18",
      estado: "PAGADA",
      observaciones: "Ocupación transitoria de bien nacional de uso público fuera de horario autorizado. Pagada en tesorería municipal.",
      created_at: "2026-06-10T11:00:00.000Z",
    },
  ],
  litigios_juicios: [
    {
      id: "jui-002",
      rit_ruc: "T-892-2025",
      nombre_trabajador: "Mario Santander Garrido",
      materia: "Tutela Laboral con ocasión del despido",
      cuantia: 22500000,
      cuantia_clp: 22500000,
      primera_audiencia_fecha: "2025-10-20",
      primera_audiencia_resultado: "Sin acuerdo en etapa conciliatoria.",
      segunda_audiencia_fecha: "2025-12-04",
      segunda_audiencia_resultado: "Avenimiento judicial aprobado por tribunal. Pago acordado en 2 cuotas cumplidas.",
      estado: "CONCLUIDO",
      observaciones: "Finiquito judicial suscrito y archivado. Proceso finalizado y cerrado definitivamente.",
      created_at: "2025-08-15T15:00:00.000Z",
    },
  ],
  litigios_audiencias_juicio: [
    {
      id: "aud-002",
      juicio_id: "jui-002",
      numero_audiencia: 1,
      fecha_audiencia: "2025-10-20",
      resultado_dictamen: "Sin acuerdo en etapa conciliatoria.",
      created_at: "2025-08-15T15:00:00.000Z",
    },
    {
      id: "aud-003",
      juicio_id: "jui-002",
      numero_audiencia: 2,
      fecha_audiencia: "2025-12-04",
      resultado_dictamen: "Avenimiento judicial aprobado por tribunal. Pago acordado en 2 cuotas cumplidas.",
      created_at: "2025-12-04T12:00:00.000Z",
    },
  ],
  litigios_comparendos: [
    {
      id: "comp-001",
      nombre_trabajador: "Juan Carlos Muñoz Tapia",
      fecha_finiquito: "2026-10-15",
      reserva_derechos: true,
      causal_termino: "Art. 161 (Necesidades de la empresa)",
      fecha_comparendo: "2026-11-05",
      asistencia_empresa: true,
      motivo_observacion: "Reclamo por descuento AFC en finiquito y supuestas diferencias de gratificación legal.",
      monto_acuerdo_total: 0,
      estado: "PENDIENTE",
      created_at: "2026-10-10T09:00:00.000Z",
    },
    {
      id: "comp-002",
      nombre_trabajador: "Rodrigo Ignacio Vera Sandoval",
      fecha_finiquito: "2026-09-30",
      reserva_derechos: true,
      causal_termino: "Art. 159 N° 4 (Vencimiento del plazo convenido)",
      fecha_comparendo: "2026-10-15",
      asistencia_empresa: true,
      motivo_observacion: "Conciliación ante IPT por feriado proporcional. Acuerdo total pactado en 3 cuotas mensuales.",
      monto_acuerdo_total: 2400000,
      estado: "ACUERDO_EN_PAGO",
      created_at: "2026-10-01T11:00:00.000Z",
    },
    {
      id: "comp-003",
      nombre_trabajador: "Claudia Patricia Espinoza Carrasco",
      fecha_finiquito: "2026-08-05",
      reserva_derechos: false,
      causal_termino: "Art. 159 N° 2 (Renuncia voluntaria)",
      fecha_comparendo: "2026-08-12",
      asistencia_empresa: true,
      motivo_observacion: "Diferencia de horas extraordinarias. Convenio de pago en 2 cuotas saldadas en su totalidad.",
      monto_acuerdo_total: 1200000,
      estado: "PAGADO",
      created_at: "2026-08-01T14:00:00.000Z",
    },
    {
      id: "comp-004",
      nombre_trabajador: "Esteban Andrés Morales Castro",
      fecha_finiquito: "2026-09-20",
      reserva_derechos: false,
      causal_termino: "Art. 160 N° 3 (No concurrencia injustificada)",
      fecha_comparendo: "2026-09-28",
      asistencia_empresa: false,
      motivo_observacion: "Reclamo administrativo improcedente. Se resolvió no asistir por recomendación de asesoría legal externa.",
      monto_acuerdo_total: 0,
      estado: "PENDIENTE",
      created_at: "2026-09-18T16:00:00.000Z",
    },
  ],
  litigios_cuotas_comparendo: [
    {
      id: "cuota-001",
      comparendo_id: "comp-002",
      numero_cuota: 1,
      monto_cuota: 800000,
      fecha_vencimiento_cuota: "2026-10-20",
      estado_cuota: "PAGADA",
      fecha_pago_real: "2026-10-19",
      created_at: "2026-10-15T10:00:00.000Z",
    },
    {
      id: "cuota-002",
      comparendo_id: "comp-002",
      numero_cuota: 2,
      monto_cuota: 800000,
      fecha_vencimiento_cuota: "2026-11-20",
      estado_cuota: "PENDIENTE",
      fecha_pago_real: null,
      created_at: "2026-10-15T10:00:00.000Z",
    },
    {
      id: "cuota-003",
      comparendo_id: "comp-002",
      numero_cuota: 3,
      monto_cuota: 800000,
      fecha_vencimiento_cuota: "2026-12-20",
      estado_cuota: "PENDIENTE",
      fecha_pago_real: null,
      created_at: "2026-10-15T10:00:00.000Z",
    },
    {
      id: "cuota-004",
      comparendo_id: "comp-003",
      numero_cuota: 1,
      monto_cuota: 600000,
      fecha_vencimiento_cuota: "2026-08-25",
      estado_cuota: "PAGADA",
      fecha_pago_real: "2026-08-24",
      created_at: "2026-08-12T15:00:00.000Z",
    },
    {
      id: "cuota-005",
      comparendo_id: "comp-003",
      numero_cuota: 2,
      monto_cuota: 600000,
      fecha_vencimiento_cuota: "2026-09-25",
      estado_cuota: "PAGADA",
      fecha_pago_real: "2026-09-24",
      created_at: "2026-08-12T15:00:00.000Z",
    },
  ],
  mantenedor_on: [
    {
      id: "on-701",
      codigo_on: "701",
      nombre_proyecto: "Línea 2 Metro de Santiago",
      descripcion: "Obras civiles y talleres de mantenimiento",
      cliente_mandante: "Metro de Santiago S.A.",
      activo: true,
      created_at: "2026-01-10T10:00:00.000Z",
    },
    {
      id: "on-719",
      codigo_on: "719",
      nombre_proyecto: "Puente Chacao - Tramo Central",
      descripcion: "Hormigones masivos y pretensados de alta resistencia",
      cliente_mandante: "Dirección de Vialidad - MOP",
      activo: true,
      created_at: "2026-02-15T12:00:00.000Z",
    },
    {
      id: "on-740",
      codigo_on: "740",
      nombre_proyecto: "Nuevo Nivel Mina Teniente",
      descripcion: "Obras subterráneas y túneles de ventilación",
      cliente_mandante: "Codelco Chile - División El Teniente",
      activo: true,
      created_at: "2026-03-01T09:30:00.000Z",
    },
    {
      id: "on-780",
      codigo_on: "780",
      nombre_proyecto: "Mejoramiento Ruta 5 Sur",
      descripcion: "Pavimentación y enlaces viales tramo VI",
      cliente_mandante: "Dirección de Vialidad - MOP",
      activo: true,
      created_at: "2026-04-10T14:00:00.000Z",
    },
  ],
};

export function readLocalDb(): LocalDatabaseSchema {
  if (IS_READONLY_FS) {
    return structuredClone(INITIAL_SEED);
  }
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_SEED, null, 2), "utf-8");
      return structuredClone(INITIAL_SEED);
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as LocalDatabaseSchema;
    if (!parsed.pagos_facturas) {
      parsed.pagos_facturas = [];
    }
    if (
      !parsed.empresa_factoring_proveedores ||
      parsed.empresa_factoring_proveedores.length < 40
    ) {
      const existingRuts = new Set(
        (parsed.empresa_factoring_proveedores || []).map((p) => p.rut_proveedor)
      );
      const toAdd = INITIAL_SEED.empresa_factoring_proveedores.filter(
        (p) => !existingRuts.has(p.rut_proveedor)
      );
      parsed.empresa_factoring_proveedores = [
        ...(parsed.empresa_factoring_proveedores || []),
        ...toAdd,
      ];
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), "utf-8");
      } catch {
        // ignore
      }
    }
    if (!parsed.gestiones_cobranza) {
      parsed.gestiones_cobranza = structuredClone(INITIAL_SEED.gestiones_cobranza);
    }
    if (!parsed.empresa_confirming || parsed.empresa_confirming.length === 0) {
      parsed.empresa_confirming = structuredClone(INITIAL_SEED.empresa_confirming);
    }
    if (!parsed.facturas_compras) {
      parsed.facturas_compras = [];
    }
    if (!parsed.neteos_compras) {
      parsed.neteos_compras = [];
    }
    if (!parsed.cheques_compras) {
      parsed.cheques_compras = [];
    }
    if (!parsed.pagos_compras) {
      parsed.pagos_compras = [];
    }
    if (!parsed.perfiles || parsed.perfiles.length === 0) {
      parsed.perfiles = structuredClone(INITIAL_SEED.perfiles);
    }
    if (!parsed.usuarios || parsed.usuarios.length === 0) {
      parsed.usuarios = structuredClone(INITIAL_SEED.usuarios);
    }
    if (!parsed.mantenedor_mandantes || parsed.mantenedor_mandantes.length === 0) {
      parsed.mantenedor_mandantes = structuredClone(INITIAL_SEED.mantenedor_mandantes || []);
    }
    if (!parsed.mantenedor_companias || parsed.mantenedor_companias.length === 0) {
      parsed.mantenedor_companias = structuredClone(INITIAL_SEED.mantenedor_companias || []);
    }
    if (!parsed.boletas_garantias) {
      parsed.boletas_garantias = structuredClone(INITIAL_SEED.boletas_garantias || []);
    } else {
      parsed.boletas_garantias = parsed.boletas_garantias.map((b) => ({
        ...b,
        monto_uf: b.monto_uf ?? b.monto,
        contador_renovaciones: b.contador_renovaciones ?? 0,
      }));
    }
    if (!parsed.polizas_garantias) {
      parsed.polizas_garantias = structuredClone(INITIAL_SEED.polizas_garantias || []);
    } else {
      parsed.polizas_garantias = parsed.polizas_garantias.map((p) => ({
        ...p,
        monto_uf: p.monto_uf ?? p.monto,
        contador_renovaciones: p.contador_renovaciones ?? 0,
      }));
    }
    if (!parsed.historial_renovaciones_garantias) {
      parsed.historial_renovaciones_garantias = structuredClone(INITIAL_SEED.historial_renovaciones_garantias || []);
    }
    if (!parsed.gestiones_garantias) {
      parsed.gestiones_garantias = structuredClone(INITIAL_SEED.gestiones_garantias || []);
    }
    if (!parsed.litigios_multas) {
      parsed.litigios_multas = structuredClone(INITIAL_SEED.litigios_multas || []);
    }
    if (!parsed.litigios_juicios) {
      parsed.litigios_juicios = structuredClone(INITIAL_SEED.litigios_juicios || []);
    } else {
      parsed.litigios_juicios = parsed.litigios_juicios.map((j) => ({
        ...j,
        cuantia_clp: j.cuantia_clp ?? j.cuantia,
      }));
    }
    if (!parsed.litigios_audiencias_juicio) {
      parsed.litigios_audiencias_juicio = structuredClone(INITIAL_SEED.litigios_audiencias_juicio || []);
    }
    let needSave = false;
    if (!parsed.litigios_comparendos) {
      parsed.litigios_comparendos = structuredClone(INITIAL_SEED.litigios_comparendos || []);
      needSave = true;
    } else {
      parsed.litigios_comparendos = parsed.litigios_comparendos.map((c, i) => ({
        ...c,
        fecha_finiquito:
          c.fecha_finiquito ??
          INITIAL_SEED.litigios_comparendos?.[i]?.fecha_finiquito ??
          null,
      }));
    }
    if (!parsed.litigios_cuotas_comparendo) {
      parsed.litigios_cuotas_comparendo = structuredClone(INITIAL_SEED.litigios_cuotas_comparendo || []);
      needSave = true;
    }
    if (!parsed.mantenedor_on) {
      parsed.mantenedor_on = structuredClone(INITIAL_SEED.mantenedor_on || []);
      needSave = true;
    }
    if (!parsed.mantenedor_tipos_pago || parsed.mantenedor_tipos_pago.length === 0) {
      parsed.mantenedor_tipos_pago = structuredClone(INITIAL_SEED.mantenedor_tipos_pago || []);
      needSave = true;
    }
    if (!parsed.cartolas_bancarias) {
      parsed.cartolas_bancarias = [];
      needSave = true;
    }
    if (!parsed.cartolas_lineas) {
      parsed.cartolas_lineas = [];
      needSave = true;
    }
    if (needSave) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), "utf-8");
      } catch {
        // ignore
      }
    }
    return parsed;
  } catch {
    return structuredClone(INITIAL_SEED);
  }
}

export function writeLocalDb(data: LocalDatabaseSchema): void {
  if (IS_READONLY_FS) {
    return;
  }
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing local fallback DB:", err);
  }
}
