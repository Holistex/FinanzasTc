-- ============================================================================
-- MIGRACIÓN: GESTIÓN DE COBRANZA (VENTAS TENSACON)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gestiones_cobranza (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID NOT NULL REFERENCES public.facturas_ventas(id) ON DELETE CASCADE,
    tipo_gestion TEXT NOT NULL CHECK (tipo_gestion IN ('LLAMADA', 'CORREO', 'WHATSAPP')),
    fecha_compromiso_pago DATE,
    observaciones TEXT NOT NULL,
    contacto_nombre TEXT,
    contacto_telefono_email TEXT,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_nombre TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices de alto rendimiento para filtrado por documento y por fechas reales de gestión
CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_factura_id ON public.gestiones_cobranza(factura_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_created_at ON public.gestiones_cobranza(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_tipo ON public.gestiones_cobranza(tipo_gestion);

-- Políticas RLS permisivas para operaciones
ALTER TABLE public.gestiones_cobranza ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestiones_cobranza_policy_all" ON public.gestiones_cobranza;
CREATE POLICY "gestiones_cobranza_policy_all" ON public.gestiones_cobranza FOR ALL USING (true) WITH CHECK (true);
