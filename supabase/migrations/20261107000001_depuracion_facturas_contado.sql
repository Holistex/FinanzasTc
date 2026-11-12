-- ============================================================================
-- MIGRACIÓN: DEPURACIÓN DE FACTURAS Y MOVIMIENTOS ALTERADOS POR IMPORTAR CONTADO
-- ============================================================================

-- 1. Revertir las facturas alteradas a su estado original (CREDITO con saldo pendiente total):
UPDATE facturas_compras
SET 
    condicion_pago = 'CREDITO',
    monto_saldo = CASE WHEN tipo_doc = 61 THEN 0 ELSE monto_total END,
    deuda_proveedor = CASE WHEN tipo_doc = 61 THEN 0 ELSE monto_total END,
    updated_at = NOW()
WHERE condicion_pago = 'CONTADO' 
  AND estado IN ('PENDIENTE', 'DEUDA_PROVEEDOR');

-- Compatibilidad si existe columna saldo_pendiente en esquemas personalizados:
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'facturas_compras' AND column_name = 'saldo_pendiente'
    ) THEN
        EXECUTE '
            UPDATE facturas_compras
            SET 
                condicion_pago = ''CREDITO'',
                saldo_pendiente = monto_total,
                updated_at = NOW()
            WHERE condicion_pago = ''CONTADO''
              AND estado IN (''PENDIENTE'', ''DEUDA_PROVEEDOR'')
        ';
    END IF;
END $$;

-- 2. Eliminar posibles registros huérfanos o transacciones vinculadas a pagos contado automáticos:
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'pagos_facturas'
    ) THEN
        DELETE FROM pagos_facturas 
        WHERE observacion ILIKE '%contado%' 
           OR observacion ILIKE '%fondo por rendir%';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'pagos_compras'
    ) THEN
        DELETE FROM pagos_compras 
        WHERE observacion ILIKE '%contado%' 
           OR observacion ILIKE '%fondo por rendir%';
    END IF;
END $$;
