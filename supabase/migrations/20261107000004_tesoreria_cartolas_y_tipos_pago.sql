-- ============================================================================
-- MIGRACIÓN: MÓDULO TESORERÍA, CARTOLAS BANCARIAS Y CATÁLOGO TIPOS DE PAGO
-- ============================================================================

-- 1. Tabla de Tipos de Pago / Clasificación
CREATE TABLE IF NOT EXISTS mantenedor_tipos_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO mantenedor_tipos_pago (nombre) 
VALUES ('ORDEN DE COMPRA'), ('PAGOS A PROVEEDORES')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Tabla Encabezado de Cartolas (Control de Duplicados)
CREATE TABLE IF NOT EXISTS cartolas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    banco VARCHAR(50) NOT NULL,
    numero_cartola VARCHAR(50) NOT NULL,
    numero_cuenta VARCHAR(50) NOT NULL,
    fecha_desde DATE,
    fecha_hasta DATE,
    saldo_inicial NUMERIC DEFAULT 0,
    saldo_final NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_banco_cartola_cuenta UNIQUE (banco, numero_cartola, numero_cuenta)
);

-- 3. Tabla Líneas / Movimientos de Cartola
CREATE TABLE IF NOT EXISTS cartolas_lineas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cartola_id UUID REFERENCES cartolas_bancarias(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    numero_operacion VARCHAR(100),
    descripcion TEXT NOT NULL,
    giro NUMERIC DEFAULT 0 NOT NULL,
    abono NUMERIC DEFAULT 0 NOT NULL,
    saldo NUMERIC,
    tipo_pago_id UUID REFERENCES mantenedor_tipos_pago(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cartolas_lineas_cartola ON cartolas_lineas(cartola_id);
CREATE INDEX IF NOT EXISTS idx_cartolas_lineas_tipo_pago ON cartolas_lineas(tipo_pago_id);
