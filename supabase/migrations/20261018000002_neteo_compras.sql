-- ============================================================================
-- MIGRACIÓN: NETEO DE FACTURAS Y NOTAS DE CRÉDITO EN COMPRAS TENSACON
-- ============================================================================

-- 1. Actualizar ENUM de estados de compra si no incluye NETEO_NC
ALTER TYPE estado_compra_enum ADD VALUE IF NOT EXISTS 'NETEO_NC';

-- 2. Columna de saldo pendiente en facturas de compras
ALTER TABLE public.facturas_compras ADD COLUMN IF NOT EXISTS monto_saldo NUMERIC;
UPDATE public.facturas_compras SET monto_saldo = monto_total WHERE monto_saldo IS NULL;

-- 3. Tabla para registrar vinculaciones de Neteo entre Factura y NC
CREATE TABLE IF NOT EXISTS public.neteos_compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID REFERENCES public.facturas_compras(id) ON DELETE CASCADE,
    nota_credito_id UUID REFERENCES public.facturas_compras(id) ON DELETE CASCADE,
    monto_neteado NUMERIC NOT NULL,
    saldo_restante NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neteos_compras_factura ON public.neteos_compras(factura_id);
CREATE INDEX IF NOT EXISTS idx_neteos_compras_nc ON public.neteos_compras(nota_credito_id);

-- 4. RLS para neteos_compras
ALTER TABLE public.neteos_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neteos_compras_all" ON public.neteos_compras;
CREATE POLICY "neteos_compras_all" ON public.neteos_compras FOR ALL USING (true) WITH CHECK (true);
