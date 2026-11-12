-- Migration: Agregar columna condicion_pago a facturas_compras
-- Regla de negocio: Facturas con Tipo Doc == 33 clasificadas como CONTADO o CREDITO

-- 1. Agregar columna de condición de pago (CONTADO / CREDITO)
ALTER TABLE facturas_compras 
ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(10) DEFAULT 'CREDITO' CHECK (condicion_pago IN ('CONTADO', 'CREDITO'));

-- 2. Agregar columnas auxiliares de trazabilidad SII si no existen
ALTER TABLE facturas_compras 
ADD COLUMN IF NOT EXISTS fecha_recepcion DATE,
ADD COLUMN IF NOT EXISTS fecha_acuse_recibo DATE;

-- 3. Crear índice para acelerar filtros por condición de pago
CREATE INDEX IF NOT EXISTS idx_facturas_compras_cond ON facturas_compras(condicion_pago);
