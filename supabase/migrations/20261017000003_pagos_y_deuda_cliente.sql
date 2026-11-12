-- =============================================================================
-- MIGRACIÓN: Gestión de Pagos / Abonos y Columna Deuda Cliente
-- =============================================================================

-- 1. Tabla para el historial de abonos / pagos
CREATE TABLE IF NOT EXISTS public.pagos_facturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID NOT NULL REFERENCES public.facturas_ventas(id) ON DELETE CASCADE,
    monto_pago NUMERIC(18, 2) NOT NULL CHECK (monto_pago > 0),
    fecha_pago DATE NOT NULL,
    observacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_factura_id
    ON public.pagos_facturas(factura_id);

-- 2. Asegurar columna de saldo pendiente (deuda_cliente) en facturas_ventas
ALTER TABLE public.facturas_ventas
    ADD COLUMN IF NOT EXISTS deuda_cliente NUMERIC(18, 2) DEFAULT NULL;

-- Inicializar deuda_cliente con monto_neto_saldo para registros existentes
UPDATE public.facturas_ventas
SET deuda_cliente = monto_neto_saldo
WHERE deuda_cliente IS NULL;

-- 3. Políticas RLS para pagos_facturas
ALTER TABLE public.pagos_facturas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'pagos_facturas'
          AND policyname = 'Permitir lectura completa en pagos_facturas'
    ) THEN
        CREATE POLICY "Permitir lectura completa en pagos_facturas"
            ON public.pagos_facturas FOR SELECT
            TO authenticated, anon
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'pagos_facturas'
          AND policyname = 'Permitir escritura en pagos_facturas'
    ) THEN
        CREATE POLICY "Permitir escritura en pagos_facturas"
            ON public.pagos_facturas FOR ALL
            TO authenticated, anon
            USING (true)
            WITH CHECK (true);
    END IF;
END$$;
