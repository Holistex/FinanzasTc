-- ============================================================================
-- MIGRACIÓN: MODALIDAD "COMPRA TC" CON ASIGNACIÓN A COLABORADOR EN COMPRAS
-- ============================================================================

-- 1. Agregar columnas para la modalidad Compra TC en facturas_compras
ALTER TABLE facturas_compras 
ADD COLUMN IF NOT EXISTS colaborador_id UUID REFERENCES mantenedor_colaboradores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS on_proyecto VARCHAR(10) REFERENCES mantenedor_on(codigo_on) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS observacion_tc TEXT;

-- 2. Asegurar que el estado o modalidad contemple 'COMPRA_TC'
ALTER TABLE facturas_compras 
DROP CONSTRAINT IF EXISTS facturas_compras_modalidad_check;

ALTER TABLE facturas_compras 
DROP CONSTRAINT IF EXISTS facturas_compras_estado_check;

CREATE INDEX IF NOT EXISTS idx_facturas_compras_colaborador ON facturas_compras(colaborador_id);
