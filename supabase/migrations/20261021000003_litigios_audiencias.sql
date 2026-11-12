-- ============================================================================
-- MIGRACIÓN: BITÁCORA CORRELATIVA DE AUDIENCIAS Y CUANTÍA CLP EN JUICIOS
-- ============================================================================

-- 1. Actualizar tabla de Juicios para asegurar columna cuantia_clp
ALTER TABLE IF EXISTS litigios_juicios 
ADD COLUMN IF NOT EXISTS cuantia_clp NUMERIC DEFAULT 0;

-- Sincronizar cuantia_clp con cuantia existente
UPDATE litigios_juicios
SET cuantia_clp = cuantia
WHERE cuantia_clp IS NULL OR cuantia_clp = 0;

-- 2. Tabla para la Bitácora Correlativa de Audiencias
CREATE TABLE IF NOT EXISTS litigios_audiencias_juicio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    juicio_id UUID REFERENCES litigios_juicios(id) ON DELETE CASCADE,
    numero_audiencia INT NOT NULL, -- 1, 2, 3, etc.
    fecha_audiencia DATE NOT NULL,
    resultado_dictamen TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas rápidas de la última audiencia
CREATE INDEX IF NOT EXISTS idx_audiencias_juicio_fecha 
ON litigios_audiencias_juicio(juicio_id, fecha_audiencia DESC);

CREATE INDEX IF NOT EXISTS idx_audiencias_juicio_correlativo 
ON litigios_audiencias_juicio(juicio_id, numero_audiencia ASC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE litigios_audiencias_juicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir select litigios_audiencias_juicio"
  ON litigios_audiencias_juicio FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir insert litigios_audiencias_juicio"
  ON litigios_audiencias_juicio FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir update litigios_audiencias_juicio"
  ON litigios_audiencias_juicio FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir delete litigios_audiencias_juicio"
  ON litigios_audiencias_juicio FOR DELETE
  TO authenticated, anon
  USING (true);
