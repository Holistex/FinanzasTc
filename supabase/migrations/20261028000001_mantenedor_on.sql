-- ============================================================================
-- MIGRACIÓN: MANTENEDOR DE ON Y ASIGNACIÓN EN FACTURAS DE VENTAS
-- Fecha: 2026-10-28
-- ============================================================================

-- 1. CREACIÓN DE LA TABLA: mantenedor_on
CREATE TABLE IF NOT EXISTS public.mantenedor_on (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_on VARCHAR(10) NOT NULL UNIQUE,
    nombre_proyecto TEXT NOT NULL,
    descripcion TEXT,
    cliente_mandante TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas y valores por defecto si la tabla ya existía
ALTER TABLE public.mantenedor_on ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE public.mantenedor_on ADD COLUMN IF NOT EXISTS cliente_mandante TEXT;
ALTER TABLE public.mantenedor_on ALTER COLUMN activo SET DEFAULT TRUE;

UPDATE public.mantenedor_on 
SET activo = TRUE 
WHERE activo IS NULL;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_mantenedor_on_codigo ON public.mantenedor_on (codigo_on);
CREATE INDEX IF NOT EXISTS idx_mantenedor_on_activo ON public.mantenedor_on (activo);

-- 2. INCORPORACIÓN DEL CAMPO on_proyecto EN facturas_ventas
ALTER TABLE public.facturas_ventas 
ADD COLUMN IF NOT EXISTS on_proyecto VARCHAR(10);

-- Índice para acelerar filtros y consultas por proyecto
CREATE INDEX IF NOT EXISTS idx_facturas_ventas_on_proyecto ON public.facturas_ventas (on_proyecto);

-- 3. HABILITACIÓN DE RLS Y POLÍTICA DE ACCESO TOTAL
ALTER TABLE IF EXISTS public.mantenedor_on ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acceso total mantenedor_on" ON public.mantenedor_on;
DROP POLICY IF EXISTS "Permitir lectura publica o autenticada en mantenedor_on" ON public.mantenedor_on;
DROP POLICY IF EXISTS "Permitir mutaciones en mantenedor_on" ON public.mantenedor_on;

CREATE POLICY "Permitir acceso total mantenedor_on" 
ON public.mantenedor_on 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 4. POBLAMIENTO INICIAL (SEED) DE CÓDIGOS ON
INSERT INTO public.mantenedor_on (codigo_on, nombre_proyecto, descripcion, cliente_mandante, activo)
VALUES
    ('743', 'Escaleras Consistorial - FRISOL', 'Obras civiles y estructuras prefabricadas', 'Frisol', true),
    ('742', 'Barreras y Losetas - BONATTI', 'Barreras viales tipo New Jersey y losetas', 'Bonatti', true),
    ('741', 'Carcel de Rancagua', 'Complejo penitenciario y módulos de hormigón', 'MOP', true),
    ('740', 'CC Jumbo Portal Maipú - TECSA', 'Centro comercial y fundaciones masivas', 'Tecsa', true),
    ('739', 'Vigas PVD Carrera-Dgo-Sta.María-El Marco - SACYR', 'Vigas pretensadas y pasarelas', 'Sacyr', true),
    ('738', 'Camellones y Barreras tipo F lateral Alta, Chada - MOP', 'Defensas camineras y barreras de contención', 'Dirección de Vialidad - MOP', true),
    ('737', 'Losas de Fundación - Bonatti', 'Hormigones estructurales especiales', 'Bonatti', true),
    ('736', 'Reposición Prelosas Río Maipo - SOLKOM', 'Prelosas armadas para puente', 'Solkom', true),
    ('735', 'Rep. Vigas Puente Humberstone - TYG', 'Reparaciones y reemplazo estructural', 'TYG', true),
    ('734', 'Graderías y peldaños Federación de Rugby - MTV', 'Estructuras prefabricadas para recintos deportivos', 'MTV', true),
    ('733', 'CD Imolog - Mena y Ovalle', 'Centro de distribución logística y naves industriales', 'Mena y Ovalle', true),
    ('701', 'Línea 2 Metro de Santiago', 'Obras civiles y talleres de mantenimiento', 'Metro de Santiago S.A.', true),
    ('719', 'Puente Chacao - Tramo Central', 'Hormigones masivos y pretensados de alta resistencia', 'Dirección de Vialidad - MOP', true)
ON CONFLICT (codigo_on) DO UPDATE 
SET 
    nombre_proyecto = EXCLUDED.nombre_proyecto,
    descripcion = EXCLUDED.descripcion,
    cliente_mandante = EXCLUDED.cliente_mandante,
    activo = EXCLUDED.activo,
    updated_at = NOW();

-- 5. REFRESCAR LA CACHÉ DE POSTGREST EN SUPABASE
NOTIFY pgrst, 'reload schema';
