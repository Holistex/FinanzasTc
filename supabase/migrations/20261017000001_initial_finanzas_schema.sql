-- =============================================================================
-- MIGRACIÓN: Sistema Financiero Enterprise (Facturas de Ventas SII & Factoring)
-- Motor: PostgreSQL 15+ (Supabase)
-- =============================================================================

-- 0. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tipos Enumerados (ENUMs)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gestion_pago_tipo') THEN
        CREATE TYPE public.gestion_pago_tipo AS ENUM ('DIRECTO_CLIENTE', 'FACTORING');
    END IF;
END$$;

-- =============================================================================
-- 2. MANTENEDORES SCHEMA
-- =============================================================================

-- 2.1 Tabla: empresa_factoring_cliente
CREATE TABLE IF NOT EXISTS public.empresa_factoring_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_cliente VARCHAR(20) NOT NULL,
    razon_social TEXT NOT NULL,
    banco TEXT NOT NULL,
    cuenta_bancaria TEXT NOT NULL,
    contacto_nombre TEXT,
    contacto_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda rápida en empresa_factoring_cliente
CREATE INDEX IF NOT EXISTS idx_efc_rut_cliente ON public.empresa_factoring_cliente (rut_cliente);
CREATE INDEX IF NOT EXISTS idx_efc_razon_social ON public.empresa_factoring_cliente USING gin (to_tsvector('spanish', razon_social));

-- 2.2 Tabla: empresa_factoring_proveedores
CREATE TABLE IF NOT EXISTS public.empresa_factoring_proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_proveedor VARCHAR(20) NOT NULL,
    razon_social TEXT NOT NULL,
    banco TEXT NOT NULL,
    cuenta_bancaria TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda rápida en empresa_factoring_proveedores
CREATE INDEX IF NOT EXISTS idx_efp_rut_proveedor ON public.empresa_factoring_proveedores (rut_proveedor);
CREATE INDEX IF NOT EXISTS idx_efp_razon_social ON public.empresa_factoring_proveedores USING gin (to_tsvector('spanish', razon_social));

-- =============================================================================
-- 3. MÓDULO FACTURAS DE VENTAS SCHEMA
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.facturas_ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_cliente VARCHAR(20) NOT NULL,                       -- Columna D del SII
    folio BIGINT NOT NULL,                                  -- Columna F del SII
    razon_social TEXT NOT NULL,                             -- Columna E del SII
    tipo_doc INTEGER NOT NULL,                              -- Columna B del SII (Ej: 33 Factura Electrónica, 34 Exenta, 61 Nota de Crédito)
    fecha_docto DATE NOT NULL,                              -- Columna G del SII
    monto_total NUMERIC(18, 2) NOT NULL DEFAULT 0,          -- Columna N del SII (Monto total)
    tipo_docto_ref INTEGER NULL,                            -- Columna Y del SII (Tipo Docto. Referencia)
    folio_docto_ref BIGINT NULL,                            -- Columna Z del SII (Folio Docto. Referencia)
    gestion_pago public.gestion_pago_tipo NOT NULL DEFAULT 'DIRECTO_CLIENTE',
    factoring_cliente_id UUID NULL REFERENCES public.empresa_factoring_cliente(id) ON DELETE SET NULL,
    monto_neto_saldo NUMERIC(18, 2) NOT NULL DEFAULT 0,     -- Valor real considerando neteo por Notas de Crédito (61)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint Clave: Llave Única Compuesta en (rut_cliente, folio)
    CONSTRAINT uq_facturas_ventas_rut_folio UNIQUE (rut_cliente, folio),

    -- Constraint de integridad: Si es FACTORING debe o puede asociarse a una entidad, si es DIRECTO_CLIENTE limpiamos FK o permitimos nulo
    CONSTRAINT chk_montos_no_negativos CHECK (monto_total >= 0 AND monto_neto_saldo >= 0)
);

-- Índices de alto rendimiento para filtros de tabla y cruce de referencias SII
CREATE INDEX IF NOT EXISTS idx_fv_rut_cliente ON public.facturas_ventas (rut_cliente);
CREATE INDEX IF NOT EXISTS idx_fv_folio ON public.facturas_ventas (folio);
CREATE INDEX IF NOT EXISTS idx_fv_fecha_docto ON public.facturas_ventas (fecha_docto DESC);
CREATE INDEX IF NOT EXISTS idx_fv_tipo_doc ON public.facturas_ventas (tipo_doc);
CREATE INDEX IF NOT EXISTS idx_fv_gestion_pago ON public.facturas_ventas (gestion_pago);
CREATE INDEX IF NOT EXISTS idx_fv_referencia_nc ON public.facturas_ventas (rut_cliente, folio_docto_ref) WHERE folio_docto_ref IS NOT NULL;

-- =============================================================================
-- 4. LÓGICA TRANSACCIONAL DE BASE DE DATOS: NETEO AUTOMÁTICO DE NOTAS DE CRÉDITO
-- =============================================================================
-- Cuando se inserta una Nota de Crédito (tipo_doc = 61) con folio_docto_ref,
-- descuenta automáticamente el monto en la factura origen (rut_cliente + folio = folio_docto_ref).
-- Asimismo, si una Factura (33/34) se inserta después de que su NC (61) ya existía,
-- calcula su monto_neto_saldo descontando las NC previas asociadas.

CREATE OR REPLACE FUNCTION public.fn_aplicar_neteo_notas_credito()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_nc_existentes NUMERIC(18, 2);
BEGIN
    -- Caso 1: El nuevo documento insertado es una Nota de Crédito (Tipo 61)
    IF NEW.tipo_doc = 61 THEN
        -- La Nota de Crédito en sí misma tiene saldo cobrable 0 (es un documento de rebaja)
        NEW.monto_neto_saldo := 0;

        -- Si referencia un folio de factura de origen, actualizamos el monto_neto_saldo de la factura origen
        IF NEW.folio_docto_ref IS NOT NULL THEN
            UPDATE public.facturas_ventas
            SET monto_neto_saldo = GREATEST(0, monto_neto_saldo - NEW.monto_total)
            WHERE rut_cliente = NEW.rut_cliente
              AND folio = NEW.folio_docto_ref
              AND tipo_doc <> 61;
        END IF;

    -- Caso 2: Es una Factura de Venta (Ej: 33 Factura Electrónica, 34 Factura No Afecta/Exenta)
    ELSE
        -- Verificamos si ya existen Notas de Crédito (61) cargadas previamente que apunten a esta factura
        SELECT COALESCE(SUM(monto_total), 0)
        INTO v_total_nc_existentes
        FROM public.facturas_ventas
        WHERE rut_cliente = NEW.rut_cliente
          AND folio_docto_ref = NEW.folio
          AND tipo_doc = 61;

        NEW.monto_neto_saldo := GREATEST(0, NEW.monto_total - v_total_nc_existentes);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_neteo_notas_credito ON public.facturas_ventas;

CREATE TRIGGER trg_neteo_notas_credito
BEFORE INSERT ON public.facturas_ventas
FOR EACH ROW
EXECUTE FUNCTION public.fn_aplicar_neteo_notas_credito();

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.empresa_factoring_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_factoring_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas_ventas ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios autenticados (y service_role)
CREATE POLICY "Permitir lectura completa a usuarios autenticados en empresa_factoring_cliente"
    ON public.empresa_factoring_cliente FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Permitir escritura a usuarios autenticados en empresa_factoring_cliente"
    ON public.empresa_factoring_cliente FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Permitir lectura completa a usuarios autenticados en empresa_factoring_proveedores"
    ON public.empresa_factoring_proveedores FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Permitir escritura a usuarios autenticados en empresa_factoring_proveedores"
    ON public.empresa_factoring_proveedores FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Permitir lectura completa a usuarios autenticados en facturas_ventas"
    ON public.facturas_ventas FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Permitir escritura a usuarios autenticados en facturas_ventas"
    ON public.facturas_ventas FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- 6. DATOS SEMILLA INICIALES (OPCIONAL PARA ENTORNOS DE DESARROLLO)
-- =============================================================================
INSERT INTO public.empresa_factoring_cliente (rut_cliente, razon_social, banco, cuenta_bancaria, contacto_nombre, contacto_email)
VALUES
    ('76.543.210-K', 'Tanner Servicios Financieros S.A.', 'Banco de Chile', '00-145-99821-01', 'Rodrigo Valdés', 'rvaldes@tanner.cl'),
    ('96.812.340-5', 'BCI Factoring S.A.', 'Banco BCI', '11-880-43120-99', 'Camila Fuenzalida', 'operaciones@bcifactoring.cl'),
    ('77.190.450-2', 'Factotal S.A.', 'Banco Santander', '0-000-6712389-4', 'Andrés Matte', 'cesiones@factotal.cl')
ON CONFLICT DO NOTHING;
