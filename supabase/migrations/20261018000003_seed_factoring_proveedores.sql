-- ============================================================================
-- MIGRACIÓN: CARGA MASIVA DE EMPRESAS FACTORING PROVEEDORES
-- ============================================================================

-- 1. Asegurar restricción UNIQUE en rut_proveedor
DO $$ BEGIN
    ALTER TABLE public.empresa_factoring_proveedores 
    ADD CONSTRAINT unique_efp_rut_proveedor UNIQUE (rut_proveedor);
EXCEPTION
    WHEN others THEN null;
END $$;

-- 2. Carga masiva de 41 entidades financieras
INSERT INTO public.empresa_factoring_proveedores (rut_proveedor, razon_social, created_at)
VALUES
('1', '7 CUMBRES SERV. FINANCIEROS', '2026-10-18'),
('2', 'ACF CAPITAL', '2026-10-18'),
('3', 'ALTAVISTA FACTORING SPA', '2026-10-18'),
('4', 'BANCO ESTADO', '2026-10-18'),
('5', 'BANINTER', '2026-10-18'),
('6', 'BANPRO', '2026-10-18'),
('7', 'BANPROYECTA SPA', '2026-10-18'),
('8', 'BCI FACTORING', '2026-10-18'),
('9', 'BILL CAPITAL', '2026-10-18'),
('10', 'BL CAPITAL SPA', '2026-10-18'),
('11', 'BLACKSTONE FACTORING SPA', '2026-10-18'),
('12', 'BOLSA DE PRODUCTOS', '2026-10-18'),
('13', 'BULL CAPITAL', '2026-10-18'),
('14', 'CAPITAL EXPRESS', '2026-10-18'),
('15', 'CBP FINANCIA', '2026-10-18'),
('16', 'CHITA SPA', '2026-10-18'),
('17', 'COMERCIAL DE VALORES', '2026-10-18'),
('18', 'CORDADA SPA', '2026-10-18'),
('19', 'CREDYT', '2026-10-18'),
('20', 'EUROCAPITAL', '2026-10-18'),
('21', 'FACTOTAL', '2026-10-18'),
('22', 'FINAMERIS S A', '2026-10-18'),
('23', 'FINCAP', '2026-10-18'),
('24', 'FINTERRA', '2026-10-18'),
('25', 'GBV CAPITALES', '2026-10-18'),
('26', 'INCOFIN S.A', '2026-10-18'),
('27', 'INTERFACTOR S.A', '2026-10-18'),
('28', 'INVERSIONES YAKORA', '2026-10-18'),
('29', 'KASTEN SPA', '2026-10-18'),
('30', 'MOONK FACTORING', '2026-10-18'),
('31', 'NUVIA CAPITAL', '2026-10-18'),
('32', 'ORSAN FACTORING', '2026-10-18'),
('33', 'PENTA FINANCIERO', '2026-10-18'),
('34', 'PRIMUS CAPITAL', '2026-10-18'),
('35', 'PROGRESO SERV.FINANCIEROS', '2026-10-18'),
('36', 'REDCAPITAL SPA', '2026-10-18'),
('37', 'SECURITY S.A', '2026-10-18'),
('38', 'SW FACTORING S.A', '2026-10-18'),
('39', 'TANNER SERV.FINANCIEROS', '2026-10-18'),
('40', 'TOTALFACTOR', '2026-10-18'),
('41', 'XEPELIN', '2026-10-18')
ON CONFLICT (rut_proveedor) DO UPDATE 
SET razon_social = EXCLUDED.razon_social;
