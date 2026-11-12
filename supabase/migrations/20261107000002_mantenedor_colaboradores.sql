-- ============================================================================
-- MIGRACIÓN: TABLA DE MANTENEDOR DE COLABORADORES
-- ============================================================================

-- 1. Tabla de Mantenedor de Colaboradores
CREATE TABLE IF NOT EXISTS mantenedor_colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut VARCHAR(20) NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_colaboradores_rut ON mantenedor_colaboradores(rut);
CREATE INDEX IF NOT EXISTS idx_colaboradores_activo ON mantenedor_colaboradores(activo);

-- Política RLS abierta para operaciones del sistema
ALTER TABLE mantenedor_colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total mantenedor_colaboradores" ON mantenedor_colaboradores;
CREATE POLICY "Acceso total mantenedor_colaboradores" 
ON mantenedor_colaboradores FOR ALL 
USING (true) 
WITH CHECK (true);
