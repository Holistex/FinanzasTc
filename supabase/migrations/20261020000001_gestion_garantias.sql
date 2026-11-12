-- =========================================================================
-- MIGRACIÓN: MÓDULO GESTIÓN GARANTÍAS, RENOVACIONES Y MANTENEDORES
-- =========================================================================

-- 1. Mantenedor Mandantes
CREATE TABLE IF NOT EXISTS mantenedor_mandantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_mandante VARCHAR(20) NOT NULL UNIQUE,
    razon_social TEXT NOT NULL,
    contacto_nombre TEXT,
    contacto_email TEXT,
    contacto_telefono TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Mantenedor Compañías
CREATE TABLE IF NOT EXISTS mantenedor_companias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_compania VARCHAR(20) NOT NULL UNIQUE,
    razon_social TEXT NOT NULL,
    contacto_nombre TEXT,
    contacto_email TEXT,
    contacto_telefono TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla Boletas de Garantía
CREATE TABLE IF NOT EXISTS boletas_garantias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nro_folio VARCHAR(50) NOT NULL,
    mandante_id UUID REFERENCES mantenedor_mandantes(id) ON DELETE RESTRICT,
    compania_id UUID REFERENCES mantenedor_companias(id) ON DELETE RESTRICT,
    motivo TEXT NOT NULL,
    monto_uf NUMERIC NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    obra TEXT,
    proyecto TEXT,
    contrafianza_compania TEXT, -- Guardar nombre de la compañía o NULL/NO
    contador_renovaciones INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla Pólizas de Garantía
CREATE TABLE IF NOT EXISTS polizas_garantias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nro_folio VARCHAR(50) NOT NULL,
    mandante_id UUID REFERENCES mantenedor_mandantes(id) ON DELETE RESTRICT,
    compania_id UUID REFERENCES mantenedor_companias(id) ON DELETE RESTRICT,
    motivo TEXT NOT NULL,
    monto_uf NUMERIC NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    obra TEXT,
    proyecto TEXT,
    contrafianza_compania TEXT, -- Guardar nombre de la compañía o NULL/NO
    contador_renovaciones INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Historial de Renovaciones
CREATE TABLE IF NOT EXISTS historial_renovaciones_garantias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_documento VARCHAR(20) CHECK (tipo_documento IN ('BOLETA', 'POLIZA')) NOT NULL,
    documento_id UUID NOT NULL,
    fecha_vencimiento_anterior DATE NOT NULL,
    fecha_vencimiento_nueva DATE NOT NULL,
    usuario_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_boletas_mandante ON boletas_garantias(mandante_id);
CREATE INDEX IF NOT EXISTS idx_boletas_compania ON boletas_garantias(compania_id);
CREATE INDEX IF NOT EXISTS idx_boletas_vencimiento ON boletas_garantias(fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_polizas_mandante ON polizas_garantias(mandante_id);
CREATE INDEX IF NOT EXISTS idx_polizas_compania ON polizas_garantias(compania_id);
CREATE INDEX IF NOT EXISTS idx_polizas_vencimiento ON polizas_garantias(fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_historial_renov_doc ON historial_renovaciones_garantias(documento_id, tipo_documento);
