CREATE OR ALTER PROCEDURE dbo.sp_MigracionImport_Actualizar
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRAN;

        IF OBJECT_ID('tempdb..#Src') IS NOT NULL
        BEGIN
            DROP TABLE #Src;
        END;

        IF OBJECT_ID('tempdb..#Matched') IS NOT NULL
        BEGIN
            DROP TABLE #Matched;
        END;

        SELECT
            u.Ot,
            u.Cliente,
            u.Proyecto,
            u.IdSite,
            u.TipoTrabajo,
            u.AnoGestion,
            u.Moneda,
            u.IdMoneda,
            u.MontoBck,
            u.Fecha,
            u.Hora,
            u.IdActualizar,
            u.Site,
            UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, '')))) AS ClienteKey,
            UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, '')))) AS ProyectoKey,
            UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, '')))) AS IdSiteKey,
            UPPER(LTRIM(RTRIM(ISNULL(u.Site, '')))) AS SiteKey,
            UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, '')))) AS TipoTrabajoKey,
            UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(u.AnoGestion, 0))))) AS AnoGestionKey
        INTO #Src
        FROM dbo.updimportar u;

        SELECT
            s.ClienteKey,
            s.ProyectoKey,
            s.IdSiteKey,
            s.SiteKey,
            s.TipoTrabajoKey,
            s.AnoGestionKey,
            MAX(s.IdMoneda) AS IdMoneda,
            SUM(s.MontoBck) AS MontoBck
        INTO #Matched
        FROM #Src s
        INNER JOIN dbo.importar i
            ON UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = s.ClienteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = s.ProyectoKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = s.IdSiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = s.SiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = s.TipoTrabajoKey
           AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(i.AnoGestion, 0))))) = s.AnoGestionKey
           AND i.idestado = 1
        GROUP BY
            s.ClienteKey,
            s.ProyectoKey,
            s.IdSiteKey,
            s.SiteKey,
            s.TipoTrabajoKey,
            s.AnoGestionKey;

        DECLARE @FilasStaging INT = (SELECT COUNT(1) FROM #Src);
        DECLARE @FilasActualizadas INT = 0;
        DECLARE @FilasNoEncontradas INT = 0;
        DECLARE @OperacionesCjNuevas INT = 0;

        UPDATE i
           SET i.IdActualizar = 1,
               i.idmoneda = COALESCE(m.IdMoneda, i.idmoneda),
               i.monto_bck = COALESCE(m.MontoBck, i.monto_bck)
        FROM dbo.importar i
        INNER JOIN #Matched m
            ON UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = m.ClienteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = m.ProyectoKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = m.IdSiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = m.SiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = m.TipoTrabajoKey
           AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(i.AnoGestion, 0))))) = m.AnoGestionKey
        WHERE i.idestado = 1;

        SET @FilasActualizadas = @@ROWCOUNT;

        UPDATE u
           SET u.IdActualizar = 1,
               u.Fecha = SYSDATETIME(),
               u.Hora = SYSDATETIME()
        FROM dbo.updimportar u
        INNER JOIN #Matched m
            ON UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, '')))) = m.ClienteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, '')))) = m.ProyectoKey
           AND UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, '')))) = m.IdSiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(u.Site, '')))) = m.SiteKey
           AND UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, '')))) = m.TipoTrabajoKey
           AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(u.AnoGestion, 0))))) = m.AnoGestionKey;

        UPDATE u
           SET u.IdActualizar = 2,
               u.Fecha = SYSDATETIME(),
               u.Hora = SYSDATETIME()
        FROM dbo.updimportar u
        WHERE NOT EXISTS
        (
            SELECT 1
            FROM #Matched m
            WHERE UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, '')))) = m.ClienteKey
              AND UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, '')))) = m.ProyectoKey
              AND UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, '')))) = m.IdSiteKey
              AND UPPER(LTRIM(RTRIM(ISNULL(u.Site, '')))) = m.SiteKey
              AND UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, '')))) = m.TipoTrabajoKey
              AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(u.AnoGestion, 0))))) = m.AnoGestionKey
        );

        SET @FilasNoEncontradas = @@ROWCOUNT;

        ;WITH Operaciones AS
        (
            SELECT
                UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) AS OtKey,
                MAX(i.Ot) AS Ot,
                MAX(i.IdCliente) AS IdCliente,
                MAX(i.IdProyecto) AS IdProyecto,
                MAX(i.IdSite) AS IdSite,
                MAX(i.Correlativo) AS CorreSite
            FROM dbo.importar i
            INNER JOIN #Matched m
                ON UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = m.ClienteKey
               AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = m.ProyectoKey
               AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = m.IdSiteKey
               AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = m.SiteKey
               AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = m.TipoTrabajoKey
               AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(i.AnoGestion, 0))))) = m.AnoGestionKey
            WHERE i.idestado = 1
              AND i.Ot IS NOT NULL
              AND LTRIM(RTRIM(i.Ot)) <> ''
            GROUP BY UPPER(LTRIM(RTRIM(ISNULL(i.Ot, ''))))
        )
        INSERT INTO dbo.db_operaciones_cj (
            Ot,
            IdCliente,
            IdProyecto,
            IdSite,
            CorreSite
        )
        SELECT
            o.Ot,
            o.IdCliente,
            o.IdProyecto,
            o.IdSite,
            o.CorreSite
        FROM Operaciones o
        WHERE NOT EXISTS
        (
            SELECT 1
            FROM dbo.db_operaciones_cj d
            WHERE UPPER(LTRIM(RTRIM(ISNULL(d.Ot, '')))) = o.OtKey
        );

        SET @OperacionesCjNuevas = @@ROWCOUNT;

        COMMIT;

        SELECT
            @FilasStaging AS FilasStaging,
            @FilasActualizadas AS FilasActualizadas,
            @FilasNoEncontradas AS FilasNoEncontradas,
            @OperacionesCjNuevas AS OperacionesCjNuevas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK;
        END;

        THROW;
    END CATCH
END;
GO
