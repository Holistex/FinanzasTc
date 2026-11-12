-- ============================================================================
-- MIGRACIÓN: GESTIÓN DE CHEQUES MULTI-FACTURA Y CUOTAS (COMPRAS TENSACON)
-- ============================================================================

-- 1. Tabla para el registro de Cheques emitidos/entregados
CREATE TABLE IF NOT EXISTS public.cheques_compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID REFERENCES public.facturas_compras(id) ON DELETE CASCADE,
    numero_cheque VARCHAR(50) NOT NULL,
    banco_emisor TEXT NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_cheque NUMERIC NOT NULL,
    estado VARCHAR(20) DEFAULT 'EMITIDO' CHECK (estado IN ('EMITIDO', 'COBRADO', 'PROTESTADO', 'ANULADO')),
    observacion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_cheques_compras_factura ON public.cheques_compras(factura_id);
CREATE INDEX IF NOT EXISTS idx_cheques_compras_num_banco ON public.cheques_compras(numero_cheque, banco_emisor);
CREATE INDEX IF NOT EXISTS idx_cheques_compras_vencimiento ON public.cheques_compras(fecha_vencimiento);

-- 3. Row Level Security
ALTER TABLE public.cheques_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cheques_compras_all" ON public.cheques_compras;
CREATE POLICY "cheques_compras_all" ON public.cheques_compras FOR ALL USING (true) WITH CHECK (true);
