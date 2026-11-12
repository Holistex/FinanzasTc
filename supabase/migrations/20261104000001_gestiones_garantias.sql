-- =========================================================================
-- MIGRACIÓN: COLUMNA Y BITÁCORA DE "GESTIONES" EN BOLETAS Y PÓLIZAS DE GARANTÍA
-- Fecha: 2026-11-04
-- =========================================================================

-- Tabla unificada para el seguimiento de gestiones de boletas y pólizas
CREATE TABLE IF NOT EXISTS gestiones_garantias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_documento VARCHAR(20) CHECK (tipo_documento IN ('BOLETA', 'POLIZA')) NOT NULL,
    documento_id UUID NOT NULL,
    estado_gestion VARCHAR(100) NOT NULL,
    observacion TEXT NOT NULL,
    fecha_proximo_seguimiento DATE,
    usuario_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar la consulta rápida por documento
CREATE INDEX IF NOT EXISTS idx_gestiones_garantias_doc ON gestiones_garantias(tipo_documento, documento_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_garantias_created ON gestiones_garantias(created_at DESC);

-- Habilitación de RLS y política de acceso
ALTER TABLE IF EXISTS public.gestiones_garantias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acceso total gestiones_garantias" ON public.gestiones_garantias;

CREATE POLICY "Permitir acceso total gestiones_garantias"
ON public.gestiones_garantias
FOR ALL
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
