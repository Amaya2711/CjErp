/*
  Actualización por TVP: no usa dbo.updimportar ni borra staging compartido.
  Ejecutar una vez en JC_Db antes de desplegar el backend.
*/
IF TYPE_ID(N'dbo.Type_MigracionImportActualizar') IS NULL
    EXEC('CREATE TYPE dbo.Type_MigracionImportActualizar AS TABLE
    (
        Cliente NVARCHAR(250) NULL, Proyecto NVARCHAR(250) NULL,
        IdSite NVARCHAR(100) NULL, Site NVARCHAR(250) NULL,
        TipoTrabajo NVARCHAR(150) NULL, AnoGestion INT NULL,
        IdMoneda INT NULL, MontoBck DECIMAL(18,2) NULL,
        Porcentaje DECIMAL(18,6) NULL
    );');
GO

CREATE OR ALTER PROCEDURE dbo.sp_MigracionImport_Actualizar_V2
    @Datos dbo.Type_MigracionImportActualizar READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FilasStaging INT = (SELECT COUNT(*) FROM @Datos);
    DECLARE @FilasActualizadas INT = 0;
    DECLARE @FilasEncontradas INT = 0;
    DECLARE @FilasNoEncontradas INT = 0;

    SELECT
        ClienteKey = UPPER(LTRIM(RTRIM(ISNULL(Cliente, '')))),
        ProyectoKey = UPPER(LTRIM(RTRIM(ISNULL(Proyecto, '')))),
        IdSiteKey = UPPER(LTRIM(RTRIM(ISNULL(IdSite, '')))),
        SiteKey = UPPER(LTRIM(RTRIM(ISNULL(Site, '')))),
        TipoTrabajoKey = UPPER(LTRIM(RTRIM(ISNULL(TipoTrabajo, '')))),
        AnoGestionKey = ISNULL(AnoGestion, 0),
        IdMoneda = MAX(IdMoneda),
        MontoBck = SUM(ISNULL(MontoBck, 0)),
        Porcentaje = MAX(ISNULL(Porcentaje, 0))
    INTO #Src
    FROM @Datos
    GROUP BY
        UPPER(LTRIM(RTRIM(ISNULL(Cliente, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(Proyecto, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(IdSite, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(Site, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(TipoTrabajo, '')))), ISNULL(AnoGestion, 0);

    CREATE UNIQUE CLUSTERED INDEX IX_Src_Key ON #Src
        (ClienteKey, ProyectoKey, IdSiteKey, SiteKey, AnoGestionKey, TipoTrabajoKey);

    SELECT s.* INTO #Matched
    FROM #Src s
    WHERE EXISTS
    (
        SELECT 1 FROM dbo.Importar i
        WHERE i.IdEstado = 1
          AND UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = s.ClienteKey
          AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = s.ProyectoKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = s.IdSiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = s.SiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = s.TipoTrabajoKey
           AND
           (
               ISNULL(i.AnoGestion, 0) = s.AnoGestionKey
               OR (ISNULL(i.AnoGestion, 0) = 0 AND s.AnoGestionKey > 0)
           )
    );
    CREATE UNIQUE CLUSTERED INDEX IX_Matched_Key ON #Matched
        (ClienteKey, ProyectoKey, IdSiteKey, SiteKey, AnoGestionKey, TipoTrabajoKey);
    SET @FilasEncontradas = (SELECT COUNT(*) FROM #Matched);

    BEGIN TRANSACTION;
    UPDATE i SET
        IdActualizar = 1,
        IdMoneda = COALESCE(m.IdMoneda, i.IdMoneda),
        Monto_Bck = COALESCE(m.MontoBck, i.Monto_Bck),
        Porcentaje = COALESCE(m.Porcentaje, i.Porcentaje),
        Monto_Visible = COALESCE(m.MontoBck, i.Monto_Bck, 0) * (1 - COALESCE(m.Porcentaje, i.Porcentaje, 0) / 100.0),
        AnoGestion = CASE
            WHEN ISNULL(i.AnoGestion, 0) = 0 AND m.AnoGestionKey > 0 THEN m.AnoGestionKey
            ELSE i.AnoGestion
        END
    FROM dbo.Importar i
    INNER JOIN #Matched m ON
        UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = m.ClienteKey AND
        UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = m.ProyectoKey AND
        UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = m.IdSiteKey AND
        UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = m.SiteKey AND
        UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = m.TipoTrabajoKey AND
        (
            ISNULL(i.AnoGestion, 0) = m.AnoGestionKey
            OR (ISNULL(i.AnoGestion, 0) = 0 AND m.AnoGestionKey > 0)
        )
    WHERE i.IdEstado = 1 OPTION (RECOMPILE);
    SET @FilasActualizadas = @@ROWCOUNT;
    COMMIT;

    SET @FilasNoEncontradas = @FilasStaging - @FilasEncontradas;
    SELECT
        @FilasStaging AS FilasStaging,
        0 AS FilasInsertadas,
        @FilasActualizadas AS FilasActualizadas,
        @FilasNoEncontradas AS FilasNoEncontradas,
        0 AS OperacionesCjNuevas;

    SELECT
        Cliente = s.ClienteKey,
        Proyecto = s.ProyectoKey,
        IdSite = s.IdSiteKey,
        Site = s.SiteKey,
        TipoTrabajo = s.TipoTrabajoKey,
        AnoGestion = s.AnoGestionKey,
        s.IdMoneda,
        s.MontoBck,
        s.Porcentaje
    FROM #Src s
    LEFT JOIN #Matched m ON
        m.ClienteKey = s.ClienteKey AND
        m.ProyectoKey = s.ProyectoKey AND
        m.IdSiteKey = s.IdSiteKey AND
        m.SiteKey = s.SiteKey AND
        m.TipoTrabajoKey = s.TipoTrabajoKey AND
        m.AnoGestionKey = s.AnoGestionKey
    WHERE m.ClienteKey IS NULL
    ORDER BY s.ClienteKey, s.ProyectoKey, s.IdSiteKey, s.SiteKey, s.TipoTrabajoKey, s.AnoGestionKey;
END;
GO
