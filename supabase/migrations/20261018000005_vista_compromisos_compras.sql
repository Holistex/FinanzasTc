-- Migración: Vista Consolidada de Compromisos Pendientes de Compras
-- Agrupa cheques emitidos a fecha, facturas en factoring y facturas en confirming

CREATE OR REPLACE VIEW vista_compromisos_compras AS
-- 1. Cheques Emitidos a Fecha
SELECT 
    c.id,
    'CHEQUE' AS modalidad,
    f.rut_proveedor,
    f.razon_social,
    c.numero_cheque AS referencia_doc,
    c.fecha_vencimiento,
    c.monto_cheque AS monto,
    c.created_at
FROM cheques_compras c
JOIN facturas_compras f ON c.factura_id = f.id
WHERE c.estado = 'EMITIDO'

UNION ALL

-- 2. Facturas en Factoring
SELECT 
    f.id,
    'FACTORING' AS modalidad,
    f.rut_proveedor,
    f.razon_social,
    CONCAT('FAC #', f.folio) AS referencia_doc,
    f.fecha_vencimiento,
    f.monto_total AS monto,
    f.created_at
FROM facturas_compras f
WHERE f.estado = 'FACTORING' AND f.monto_total > 0

UNION ALL

-- 3. Facturas en Confirming
SELECT 
    f.id,
    'CONFIRMING' AS modalidad,
    f.rut_proveedor,
    f.razon_social,
    CONCAT('FAC #', f.folio) AS referencia_doc,
    f.fecha_vencimiento,
    f.monto_total AS monto,
    f.created_at
FROM facturas_compras f
WHERE f.estado = 'CONFIRMING' AND f.monto_total > 0;
