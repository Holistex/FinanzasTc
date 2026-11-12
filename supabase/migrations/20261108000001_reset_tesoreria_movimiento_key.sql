-- ============================================================================
-- MIGRACIÓN: RESET DE TESORERÍA Y MOTOR POR MOVIMIENTO CON KEY ANTIDUPLICADOS
-- Fecha: 2026-11-08
-- ============================================================================

-- 1. Vaciar movimientos y registros previos de tesorería
TRUNCATE TABLE cartolas_lineas CASCADE;
TRUNCATE TABLE cartolas_bancarias CASCADE;

-- 2. Asegurar columnas para la KEY única y origen de importación
ALTER TABLE cartolas_lineas 
ADD COLUMN IF NOT EXISTS banco VARCHAR(50) DEFAULT 'BANCO',
ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(50),
ADD COLUMN IF NOT EXISTS movimiento_key TEXT;

-- Crear restricción única por la KEY del movimiento
ALTER TABLE cartolas_lineas 
DROP CONSTRAINT IF EXISTS unique_movimiento_bancario_key;

ALTER TABLE cartolas_lineas 
ADD CONSTRAINT unique_movimiento_bancario_key UNIQUE (movimiento_key);

CREATE INDEX IF NOT EXISTS idx_cartolas_lineas_key ON cartolas_lineas(movimiento_key);
CREATE INDEX IF NOT EXISTS idx_cartolas_lineas_fecha_banco ON cartolas_lineas(fecha, banco);
