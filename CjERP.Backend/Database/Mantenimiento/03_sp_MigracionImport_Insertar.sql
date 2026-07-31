CREATE OR ALTER PROCEDURE dbo.sp_MigracionImport_Insertar
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRAN;

        IF OBJECT_ID('tempdb..#Inserted') IS NOT NULL
        BEGIN
            DROP TABLE #Inserted;
        END;

        CREATE TABLE #Inserted
        (
            Ot nvarchar(100) NULL,
            IdCliente int NULL,
            IdProyecto int NULL,
            IdSite nvarchar(16) NULL,
            CorreSite int NULL
        );

        INSERT INTO dbo.importar
        (
            Ot,
            Cliente,
            Proyecto,
            IdSite,
            Site,
            TipoTrabajo,
            AnoGestion,
            idmoneda,
            monto_bck,
            IdActualizar,
            NroInterno,
            IdCliente,
            IdProyecto,
            Correlativo,
            idestado
        )
        OUTPUT
            INSERTED.Ot,
            INSERTED.IdCliente,
            INSERTED.IdProyecto,
            INSERTED.IdSite,
            INSERTED.Correlativo
        INTO #Inserted
        SELECT
            u.Ot,
            u.Cliente,
            u.Proyecto,
            u.IdSite,
            u.Site,
            u.TipoTrabajo,
            u.AnoGestion,
            u.IdMoneda,
            u.MontoBck,
            COALESCE(u.IdActualizar, 0),
            COALESCE(
                (
                    SELECT MAX(i.NroInterno)
                    FROM dbo.importar i
                ),
                0
            ) + ROW_NUMBER() OVER (ORDER BY (SELECT NULL)),
            c.IdCliente,
            p.IdProyecto,
            s.Correlativo,
            1
        FROM dbo.updimportar u
        LEFT JOIN dbo.cliente c
            ON UPPER(LTRIM(RTRIM(ISNULL(c.NombreCliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, ''))))
           AND c.Estado = 1
        LEFT JOIN dbo.proyecto p
            ON UPPER(LTRIM(RTRIM(ISNULL(p.NombreProyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, ''))))
           AND p.Estado = 1
        LEFT JOIN dbo.site s
            ON UPPER(LTRIM(RTRIM(ISNULL(s.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(s.NombreSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
        WHERE NOT EXISTS
        (
            SELECT 1
            FROM dbo.importar i
            WHERE i.idestado = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, ''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, ''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, ''))))
              AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(i.AnoGestion, 0))))) =
                  UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(u.AnoGestion, 0)))))
              AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        );

        DECLARE @FilasStaging INT = (SELECT COUNT(1) FROM dbo.updimportar);
        DECLARE @FilasInsertadas INT = @@ROWCOUNT;
        DECLARE @OperacionesCjNuevas INT = 0;

        ;WITH Operaciones AS
        (
            SELECT
                UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) AS OtKey,
                MAX(i.Ot) AS Ot,
                MAX(i.IdCliente) AS IdCliente,
                MAX(i.IdProyecto) AS IdProyecto,
                MAX(i.IdSite) AS IdSite,
                MAX(i.CorreSite) AS CorreSite
            FROM #Inserted i
            WHERE i.Ot IS NOT NULL
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
            @FilasInsertadas AS FilasInsertadas,
            0 AS FilasActualizadas,
            0 AS FilasNoEncontradas,
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
