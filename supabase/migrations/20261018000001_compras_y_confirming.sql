-- ============================================================================
-- MIGRACIÓN: MANTENEDOR EMPRESA CONFIRMING Y FACTURAS DE COMPRAS
-- ============================================================================

-- 1. Mantenedor de Empresas Confirming
CREATE TABLE IF NOT EXISTS public.empresa_confirming (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_confirming VARCHAR(20) NOT NULL UNIQUE,
    razon_social TEXT NOT NULL,
    contacto_nombre TEXT,
    contacto_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tipo Enum para Estados de Facturas de Compra
DO $$ BEGIN
    CREATE TYPE estado_compra_enum AS ENUM ('DEUDA_PROVEEDOR', 'FACTORING', 'CONFIRMING', 'CHEQUE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabla Facturas de Compras (Registro SII Compras)
CREATE TABLE IF NOT EXISTS public.facturas_compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nro INT NOT NULL,
    tipo_doc INT NOT NULL,
    tipo_compra VARCHAR(50),
    rut_proveedor VARCHAR(20) NOT NULL,
    razon_social TEXT NOT NULL,
    folio BIGINT NOT NULL,
    fecha_docto DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_total NUMERIC NOT NULL,
    estado estado_compra_enum DEFAULT 'DEUDA_PROVEEDOR' NOT NULL,
    
    -- Relaciones opcionales según estado
    factoring_proveedor_id UUID REFERENCES public.empresa_factoring_proveedores(id) ON DELETE SET NULL,
    confirming_id UUID REFERENCES public.empresa_confirming(id) ON DELETE SET NULL,
    
    -- Datos de Cheque (si estado = CHEQUE)
    numero_cheque VARCHAR(50),
    fecha_vencimiento_cheque DATE,
    banco_emisor TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_rut_folio_compras UNIQUE (rut_proveedor, folio)
);

CREATE INDEX IF NOT EXISTS idx_facturas_compras_rut_folio ON public.facturas_compras(rut_proveedor, folio);
CREATE INDEX IF NOT EXISTS idx_facturas_compras_estado ON public.facturas_compras(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_compras_fecha_docto ON public.facturas_compras(fecha_docto);
CREATE INDEX IF NOT EXISTS idx_facturas_compras_fecha_vencimiento ON public.facturas_compras(fecha_vencimiento);

-- RLS
ALTER TABLE public.empresa_confirming ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_confirming_all" ON public.empresa_confirming;
CREATE POLICY "empresa_confirming_all" ON public.empresa_confirming FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.facturas_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "facturas_compras_all" ON public.facturas_compras;
CREATE POLICY "facturas_compras_all" ON public.facturas_compras FOR ALL USING (true) WITH CHECK (true);
