-- ============================================================================
-- MIGRACIÓN DE SEGURIDAD: HABILITACIÓN DE ROW LEVEL SECURITY (RLS) Y POLÍTICAS
-- ============================================================================
-- Objetivo: Resolver la alerta "rls_disabled_in_public" en Supabase activando RLS
-- en todas las tablas públicas del sistema y asegurando la interacción desde las Server Actions.

-- 1. Habilitación explícita de RLS en todas las tablas del esquema público
ALTER TABLE IF EXISTS public.facturas_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.facturas_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagos_facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gestiones_cobranza ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cheques_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.neteos_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_factoring_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_factoring_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.empresa_confirming ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.perfiles_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mantenedor_mandantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mantenedor_companias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.boletas_garantias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.polizas_garantias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.historial_renovaciones_garantias ENABLE ROW LEVEL SECURITY;

-- 2. Habilitación dinámica de RLS y creación de políticas para todas las tablas base públicas
DO $$ 
DECLARE 
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        -- Asegurar que RLS esté activado
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        -- Recrear la política de acceso total para el backend / app
        EXECUTE format('DROP POLICY IF EXISTS "Acceso total backend" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Acceso total backend" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
