-- =========================================================================
-- MIGRACIÓN: MÓDULO REG. LITIGIOS (MULTAS, JUICIOS Y AUDITORÍA)
-- =========================================================================

-- 1. Tabla de Multas
CREATE TABLE IF NOT EXISTS public.litigios_multas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedencia TEXT NOT NULL,
    nro_multa VARCHAR(50) NOT NULL,
    fecha_publicacion DATE NOT NULL,
    monto_sancion NUMERIC NOT NULL DEFAULT 0,
    nro_resolucion VARCHAR(50),
    fecha_resolucion DATE,
    fecha_pago DATE,
    estado VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADA')),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Juicios
CREATE TABLE IF NOT EXISTS public.litigios_juicios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rit_ruc VARCHAR(50) NOT NULL,
    nombre_trabajador TEXT NOT NULL,
    materia TEXT NOT NULL,
    cuantia NUMERIC DEFAULT 0,
    primera_audiencia_fecha DATE,
    primera_audiencia_resultado TEXT,
    segunda_audiencia_fecha DATE,
    segunda_audiencia_resultado TEXT,
    estado VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADA', 'CONCLUIDO')),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_multas_estado ON public.litigios_multas(estado);
CREATE INDEX IF NOT EXISTS idx_multas_fecha_pub ON public.litigios_multas(fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_juicios_estado ON public.litigios_juicios(estado);
CREATE INDEX IF NOT EXISTS idx_juicios_rit_ruc ON public.litigios_juicios(rit_ruc);

-- 4. Seguridad Row Level Security (RLS)
ALTER TABLE public.litigios_multas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.litigios_juicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total backend" ON public.litigios_multas;
CREATE POLICY "Acceso total backend" ON public.litigios_multas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total backend" ON public.litigios_juicios;
CREATE POLICY "Acceso total backend" ON public.litigios_juicios FOR ALL USING (true) WITH CHECK (true);
