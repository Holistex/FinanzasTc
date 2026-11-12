-- ============================================================================
-- MIGRACIÓN: PERFILES, PERMISOS POR MÓDULO Y MAESTRO DE USUARIOS (FINANZAS TENSACON)
-- ============================================================================

-- 1. Tabla de Perfiles con matriz JSONB de permisos por módulo
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_perfil VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  permisos JSONB NOT NULL DEFAULT '{
    "ventas_tensacon": "EDICION_ESCRITURA",
    "facturas_ventas": "EDICION_ESCRITURA",
    "factoring_clientes": "EDICION_ESCRITURA",
    "mantenedores": "EDICION_ESCRITURA",
    "configuracion_adm": "EDICION_ESCRITURA"
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perfiles_policy_all" ON public.perfiles;
CREATE POLICY "perfiles_policy_all" ON public.perfiles FOR ALL USING (true) WITH CHECK (true);

-- Sembrar perfiles estándar predeterminados si no existen
INSERT INTO public.perfiles (nombre_perfil, descripcion, permisos)
VALUES 
  ('ADMINISTRADOR', 'Acceso total y configuración del sistema Finanzas Tensacon', '{
    "ventas_tensacon": "EDICION_ESCRITURA",
    "facturas_ventas": "EDICION_ESCRITURA",
    "factoring_clientes": "EDICION_ESCRITURA",
    "mantenedores": "EDICION_ESCRITURA",
    "configuracion_adm": "EDICION_ESCRITURA"
  }'::jsonb),
  ('JEFE_FINANZAS', 'Gestión de facturación, tesorería, factoring y consulta de configuración', '{
    "ventas_tensacon": "EDICION_ESCRITURA",
    "facturas_ventas": "EDICION_ESCRITURA",
    "factoring_clientes": "EDICION_ESCRITURA",
    "mantenedores": "EDICION_ESCRITURA",
    "configuracion_adm": "SOLO_LECTURA"
  }'::jsonb),
  ('ANALISTA_TESORERIA', 'Control de pagos, libro de ventas y registro de abonos', '{
    "ventas_tensacon": "SOLO_LECTURA",
    "facturas_ventas": "EDICION_ESCRITURA",
    "factoring_clientes": "SOLO_LECTURA",
    "mantenedores": "SOLO_LECTURA",
    "configuracion_adm": "SIN_ACCESO"
  }'::jsonb),
  ('AUDITOR_CONSULTA', 'Solo lectura y auditoría de documentos tributarios', '{
    "ventas_tensacon": "SOLO_LECTURA",
    "facturas_ventas": "SOLO_LECTURA",
    "factoring_clientes": "SOLO_LECTURA",
    "mantenedores": "SOLO_LECTURA",
    "configuracion_adm": "SIN_ACCESO"
  }'::jsonb)
ON CONFLICT (nombre_perfil) DO NOTHING;

-- 2. Tabla de Maestro de Usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  usuario VARCHAR(100) UNIQUE NOT NULL,
  contrasena TEXT NOT NULL,
  correo VARCHAR(255) NOT NULL,
  perfil_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  perfil VARCHAR(100),
  estado VARCHAR(50) NOT NULL DEFAULT 'Activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_policy_all" ON public.usuarios;
CREATE POLICY "usuarios_policy_all" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);

-- Sembrar usuarios iniciales
INSERT INTO public.usuarios (nombre, usuario, contrasena, correo, perfil, estado)
VALUES
  ('Carlos Vargas', 'cvargas', 'Tensacon2026!', 'cvargas@tensacon.cl', 'ADMINISTRADOR', 'Activo'),
  ('Javiera Rebolledo', 'jrebolledo', 'Finanzas2026*', 'jrebolledo@tensacon.cl', 'JEFE_FINANZAS', 'Activo'),
  ('Rodrigo Valdés', 'rvaldes', 'Tesoreria2026#', 'rvaldes@tensacon.cl', 'ANALISTA_TESORERIA', 'Activo')
ON CONFLICT (usuario) DO NOTHING;
