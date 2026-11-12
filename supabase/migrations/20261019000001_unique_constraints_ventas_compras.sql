-- =========================================================================
-- GARANTÍA DE INTEGRIDAD Y RESTRICCIONES DE UNICIDAD EN CARGAS MASIVAS
-- =========================================================================

-- 1. Restricción de clave única compuesta en facturas_ventas (RUT Cliente + Folio)
-- Previene duplicación accidental de facturas emitidas y notas de crédito en ventas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_rut_folio_ventas'
  ) THEN
    ALTER TABLE facturas_ventas 
    ADD CONSTRAINT unique_rut_folio_ventas UNIQUE (rut_cliente, folio);
  END IF;
END $$;

-- 2. Restricción de clave única compuesta en facturas_compras (RUT Proveedor + Folio)
-- Previene duplicación accidental de facturas recibidas de proveedores en compras.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_rut_folio_compras'
  ) THEN
    ALTER TABLE facturas_compras 
    ADD CONSTRAINT unique_rut_folio_compras UNIQUE (rut_proveedor, folio);
  END IF;
END $$;
