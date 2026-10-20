/*
  Logistica / Stock - TABLAS BASE (idempotente). Requiere haber revisado 00_Diagnostico_Stock_SoloLectura.sql.
  PV: script no ejecutado ni probado contra la BD; revisar antes de desplegar.

  Modelo
  - StockBucket           catalogo de "colas" de stock. Cada bucket = unidades pendientes de la SIGUIENTE etapa
                          (misma semantica que usa el sistema antiguo sobre MaterialStock).
  - StockSaldo            saldo vigente por (CodPap, IdAlmacen, Bucket). IdAlmacen = 0 -> general (hoy se maneja por CodPap).
                          Listo para manejo por almacen: basta registrar movimientos con IdAlmacen > 0.
  - StockMovimiento       libro de movimientos (solo se agrega). Cada fila mueve una cantidad de un bucket a otro;
                          origen NULL = entrada, destino NULL = salida. Las correcciones son movimientos inversos.
  - LogisticaEtapaConfig  reglas de cada etapa del flujo de equipos (estados y buckets), en datos.
  MaterialStock (tabla antigua) pasa a ser una PROYECCION de StockSaldo (la mantiene sp_Stock_Mover).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

------------------------------------------------------------------------------------------------------------------
-- 1. Catalogo de buckets
------------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.StockBucket', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StockBucket (
    Bucket        varchar(20)   NOT NULL CONSTRAINT PK_StockBucket PRIMARY KEY,
    Orden         int           NOT NULL,
    Descripcion   nvarchar(200) NOT NULL,
    ColumnaLegacy sysname       NULL     -- columna equivalente en dbo.MaterialStock
  );
END;

MERGE dbo.StockBucket AS t
USING (VALUES
  ('Recepcionado', 10, N'Recepcionado, pendiente de validar',                'Recepcionado'),
  ('Validado',     20, N'Validado, pendiente de pasar a disponible',        'Validado'),
  ('Disponible',   30, N'Disponible para solicitar',                         'Disponible'),
  ('Bloqueado',    35, N'Bloqueado administrativamente',                     'Bloqueado'),
  ('Solicitado',   40, N'Solicitado (sin uso en el flujo nuevo)',            'Solicitado'),
  ('Aprobado',     50, N'Solicitado, pendiente de aprobar',                  'Aprobado'),
  ('Despachado',   60, N'Aprobado, pendiente de despachar',                  'Despachado'),
  ('Enviado',      70, N'Despachado, pendiente de enviar',                   'Enviado'),
  ('Campo',        80, N'Enviado, pendiente de confirmar en campo',          'Campo'),
  ('Cruce',        90, N'En campo, pendiente de cruce',                      'Cruce'),
  ('Cierre',      100, N'Cruzado, pendiente de cierre',                      'Cierre'),
  ('Folio',       110, N'Cerrado, pendiente de generar folio',               'Folio'),
  ('Culminadas',  120, N'Folio generado, proceso culminado',                 'Culminadas'),
  ('Excedente',   130, N'Excedente por recoger',                             'Excedente'),
  ('Observada',   140, N'Observada',                                         'Observada')
) AS s (Bucket, Orden, Descripcion, ColumnaLegacy)
ON t.Bucket = s.Bucket
WHEN NOT MATCHED THEN INSERT (Bucket, Orden, Descripcion, ColumnaLegacy) VALUES (s.Bucket, s.Orden, s.Descripcion, s.ColumnaLegacy)
WHEN MATCHED AND (t.Orden <> s.Orden OR t.Descripcion <> s.Descripcion OR ISNULL(t.ColumnaLegacy, '') <> ISNULL(s.ColumnaLegacy, ''))
  THEN UPDATE SET Orden = s.Orden, Descripcion = s.Descripcion, ColumnaLegacy = s.ColumnaLegacy;

------------------------------------------------------------------------------------------------------------------
-- 2. Saldos vigentes
------------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.StockSaldo', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StockSaldo (
    CodPap             nvarchar(50)  NOT NULL,
    IdAlmacen          int           NOT NULL CONSTRAINT DF_StockSaldo_Almacen DEFAULT (0),
    Bucket             varchar(20)   NOT NULL,
    Cantidad           decimal(18,4) NOT NULL CONSTRAINT DF_StockSaldo_Cantidad DEFAULT (0),
    FechaModificacion  datetime2(3)  NOT NULL CONSTRAINT DF_StockSaldo_Fecha DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_StockSaldo PRIMARY KEY (CodPap, IdAlmacen, Bucket),
    CONSTRAINT FK_StockSaldo_Bucket FOREIGN KEY (Bucket) REFERENCES dbo.StockBucket (Bucket)
  );
  -- Cuando termine la migracion (el sistema antiguo ya no escribe MaterialStock) agregar:
  --   ALTER TABLE dbo.StockSaldo ADD CONSTRAINT CK_StockSaldo_NoNegativo CHECK (Cantidad >= 0);
END;

------------------------------------------------------------------------------------------------------------------
-- 3. Libro de movimientos
------------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.StockMovimiento', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StockMovimiento (
    IdMovimiento        bigint        IDENTITY(1,1) NOT NULL CONSTRAINT PK_StockMovimiento PRIMARY KEY,
    FechaHoraUtc        datetime2(3)  NOT NULL CONSTRAINT DF_StockMov_Fecha DEFAULT (SYSUTCDATETIME()),
    CodPap              nvarchar(50)  NOT NULL,
    IdAlmacen           int           NOT NULL CONSTRAINT DF_StockMov_Almacen DEFAULT (0),
    Serie               nvarchar(100) NULL,
    BucketOrigen        varchar(20)   NULL,
    BucketDestino       varchar(20)   NULL,
    Cantidad            decimal(18,4) NOT NULL,
    Operacion           varchar(40)   NOT NULL,   -- SOLICITAR, APROBAR, DESPACHAR, ..., SALDO_INICIAL, LEGACY_UPDATE, AJUSTE
    NroSolicitud        nvarchar(50)  NULL,
    Posicion            nvarchar(50)  NULL,
    CorrelativoDet      nvarchar(50)  NULL,
    IdEstadoDoc         int           NULL,       -- estado del documento (DetSolicitud) tras el movimiento
    Usuario             nvarchar(100) NULL,
    IdEmpleadoCj        int           NULL,
    Observacion         nvarchar(500) NULL,
    ClaveIdempotencia   nvarchar(100) NULL,
    IdMovimientoReversa bigint        NULL,       -- si este movimiento revierte a otro
    CONSTRAINT CK_StockMov_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_StockMov_Buckets  CHECK (BucketOrigen IS NOT NULL OR BucketDestino IS NOT NULL),
    CONSTRAINT FK_StockMov_Origen   FOREIGN KEY (BucketOrigen)  REFERENCES dbo.StockBucket (Bucket),
    CONSTRAINT FK_StockMov_Destino  FOREIGN KEY (BucketDestino) REFERENCES dbo.StockBucket (Bucket),
    CONSTRAINT FK_StockMov_Reversa  FOREIGN KEY (IdMovimientoReversa) REFERENCES dbo.StockMovimiento (IdMovimiento)
  );
  CREATE INDEX IX_StockMov_CodPap      ON dbo.StockMovimiento (CodPap, IdAlmacen, FechaHoraUtc);
  CREATE INDEX IX_StockMov_Solicitud   ON dbo.StockMovimiento (NroSolicitud) WHERE NroSolicitud IS NOT NULL;
  CREATE INDEX IX_StockMov_Serie       ON dbo.StockMovimiento (Serie) WHERE Serie IS NOT NULL;
  CREATE UNIQUE INDEX UX_StockMov_Idempotencia ON dbo.StockMovimiento (ClaveIdempotencia) WHERE ClaveIdempotencia IS NOT NULL;
END;

------------------------------------------------------------------------------------------------------------------
-- 4. Configuracion de etapas del flujo de equipos
--    EstadosOrigen: estados de DetSolicitud (ESTADO_LOG) desde los que se puede ejecutar la etapa.
--    EstadoDiferencia/BucketDiferencia: destino de la cantidad NO atendida cuando la etapa sale del flujo
--    (ej. excedente en CRUCE). Si son NULL, la cantidad no atendida SE QUEDA en el bucket de origen, pendiente.
--    Migrada: 1 cuando la etapa ya la ejecuta la pagina nueva y el sistema antiguo no debe usarla.
------------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.LogisticaEtapaConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.LogisticaEtapaConfig (
    Etapa                 varchar(30)   NOT NULL CONSTRAINT PK_LogisticaEtapaConfig PRIMARY KEY,
    Orden                 int           NOT NULL,
    Descripcion           nvarchar(200) NOT NULL,
    EstadosOrigen         varchar(60)   NULL,
    EstadoDestino         int           NOT NULL,
    EstadoDestinoAlterno  int           NULL,    -- p. ej. material que no aplica (Aplica = 0)
    BucketOrigen          varchar(20)   NULL,
    BucketDestino         varchar(20)   NULL,
    BucketDestinoAlterno  varchar(20)   NULL,
    EstadoDiferencia      int           NULL,
    BucketDiferencia      varchar(20)   NULL,
    Migrada               bit           NOT NULL CONSTRAINT DF_LogEtapa_Migrada DEFAULT (0),
    FechaMigracion        datetime2(0)  NULL,
    Observacion           nvarchar(400) NULL,
    CONSTRAINT FK_LogEtapa_BOrigen  FOREIGN KEY (BucketOrigen)         REFERENCES dbo.StockBucket (Bucket),
    CONSTRAINT FK_LogEtapa_BDestino FOREIGN KEY (BucketDestino)        REFERENCES dbo.StockBucket (Bucket),
    CONSTRAINT FK_LogEtapa_BAlterno FOREIGN KEY (BucketDestinoAlterno) REFERENCES dbo.StockBucket (Bucket),
    CONSTRAINT FK_LogEtapa_BDif     FOREIGN KEY (BucketDiferencia)     REFERENCES dbo.StockBucket (Bucket)
  );
END;

MERGE dbo.LogisticaEtapaConfig AS t
USING (VALUES
  -- Etapa,           Orden, Descripcion,                         EstadosOrigen,        Dest, Alt,  BOrigen,      BDestino,     BAlterno,     EstDif, BDif,        Observacion
  ('SOLICITAR',        10, N'Crear solicitud de equipos',        NULL,                  9,  NULL, 'Disponible',  'Aprobado',   NULL,         NULL, NULL,        N'Reserva el stock al crear la solicitud (el sistema antiguo no descontaba Disponible).'),
  ('APROBAR',          20, N'Aprobar solicitud',                 '9',                   4,  NULL, 'Aprobado',    'Despachado', NULL,         NULL, NULL,        NULL),
  ('OBSERVAR_APROB',   25, N'Observar solicitud pendiente',      '9',                   6,  NULL, 'Aprobado',    'Disponible', NULL,         NULL, NULL,        N'Libera la reserva.'),
  ('DESPACHAR',        30, N'Despachar',                         '3,4',                 5,  NULL, 'Despachado',  'Enviado',    NULL,         NULL, NULL,        N'Estado 3 (sin aprobacion) debe entrar por Despachado: ver SOLICITAR sin aprobacion.'),
  ('RECHAZAR_DESP',    35, N'Rechazar en despacho',              '3,4',                 6,  NULL, 'Despachado',  'Disponible', NULL,         NULL, NULL,        N'Libera la reserva.'),
  ('ENVIAR',           40, N'Enviar a campo',                    '5',                  11,  NULL, 'Enviado',     'Campo',      NULL,         NULL, NULL,        NULL),
  ('CAMPO',            50, N'Conformidad de campo',              '11',                 14,  21,   'Campo',       'Cruce',      'Cruce',      NULL, NULL,        N'Aplica = 0 salta a estado 21; el stock sigue la misma cola.'),
  ('CRUCE',            60, N'Cruce',                             '14',                 21,  NULL, 'Cruce',       'Cierre',     NULL,         17,   'Excedente', N'La cantidad menor a la solicitada pasa a Excedente (estado 17).'),
  ('CIERRE',           70, N'Cierre',                            '21,7,22,23,24,25',   16,  20,   'Cierre',      'Folio',      'Culminadas', NULL, NULL,        N'Aplica = 0 va directo a Culminadas.'),
  ('FOLIO',            80, N'Generar folio',                     '16',                 20,  NULL, 'Folio',       'Culminadas', NULL,         NULL, NULL,        N'El sistema antiguo hacia Folio -> Cierre; aqui Folio -> Culminadas.'),
  ('RECOJO_EXCEDENTE', 90, N'Registrar guia de excedente',       '17,15,25',           28,  NULL, NULL,          NULL,         NULL,         NULL, NULL,        N'Solo documental; no mueve stock.'),
  ('RECOGER_EXCEDENTE',95, N'Recoger excedente (retorno almacen)','28',                19,  NULL, 'Excedente',   'Disponible', NULL,         NULL, NULL,        NULL)
) AS s (Etapa, Orden, Descripcion, EstadosOrigen, EstadoDestino, EstadoDestinoAlterno, BucketOrigen, BucketDestino, BucketDestinoAlterno, EstadoDiferencia, BucketDiferencia, Observacion)
ON t.Etapa = s.Etapa
WHEN NOT MATCHED THEN INSERT (Etapa, Orden, Descripcion, EstadosOrigen, EstadoDestino, EstadoDestinoAlterno, BucketOrigen, BucketDestino, BucketDestinoAlterno, EstadoDiferencia, BucketDiferencia, Observacion)
  VALUES (s.Etapa, s.Orden, s.Descripcion, s.EstadosOrigen, s.EstadoDestino, s.EstadoDestinoAlterno, s.BucketOrigen, s.BucketDestino, s.BucketDestinoAlterno, s.EstadoDiferencia, s.BucketDiferencia, s.Observacion);
-- (si la fila ya existe no se sobreescribe: puede haberse ajustado a mano o marcado como Migrada)
