-- =============================================================================
-- MIGRACIÓN: Eliminación de campos Banco y Cuenta Bancaria en Mantenedores
-- =============================================================================

ALTER TABLE public.empresa_factoring_cliente
  DROP COLUMN IF EXISTS banco,
  DROP COLUMN IF EXISTS cuenta_bancaria;

ALTER TABLE public.empresa_factoring_proveedores
  DROP COLUMN IF EXISTS banco,
  DROP COLUMN IF EXISTS cuenta_bancaria;
