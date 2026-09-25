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

        /* Dimensiones requeridas por MIGRAR: el archivo puede contener
           clientes, proyectos o sites aún no registrados. */
        DECLARE @SiguienteCliente INT;
        SELECT @SiguienteCliente = ISNULL(MAX(IdCliente), 0)
        FROM dbo.Cliente WITH (UPDLOCK, HOLDLOCK);

        ;WITH ClientesNuevos AS
        (
            SELECT DISTINCT LTRIM(RTRIM(Cliente)) AS NombreCliente
            FROM dbo.updimportar
            WHERE NULLIF(LTRIM(RTRIM(Cliente)), '') IS NOT NULL
        )
        INSERT INTO dbo.Cliente (IdCliente, NombreCliente, Estado)
        SELECT @SiguienteCliente + ROW_NUMBER() OVER (ORDER BY NombreCliente), NombreCliente, 1
        FROM ClientesNuevos origen
        WHERE NOT EXISTS
        (
            SELECT 1 FROM dbo.Cliente destino
            WHERE UPPER(LTRIM(RTRIM(destino.NombreCliente))) = UPPER(origen.NombreCliente)
              AND destino.Estado = 1
        );

        DECLARE @SiguienteProyecto INT;
        SELECT @SiguienteProyecto = ISNULL(MAX(IdProyecto), 0)
        FROM dbo.Proyecto WITH (UPDLOCK, HOLDLOCK);

        ;WITH ProyectosNuevos AS
        (
            SELECT DISTINCT LTRIM(RTRIM(Proyecto)) AS NombreProyecto
            FROM dbo.updimportar
            WHERE NULLIF(LTRIM(RTRIM(Proyecto)), '') IS NOT NULL
        )
        INSERT INTO dbo.Proyecto (IdProyecto, NombreProyecto, Estado)
        SELECT @SiguienteProyecto + ROW_NUMBER() OVER (ORDER BY NombreProyecto), NombreProyecto, 1
        FROM ProyectosNuevos origen
        WHERE NOT EXISTS
        (
            SELECT 1 FROM dbo.Proyecto destino
            WHERE UPPER(LTRIM(RTRIM(destino.NombreProyecto))) = UPPER(origen.NombreProyecto)
              AND destino.Estado = 1
        );

        ;WITH SitesNuevos AS
        (
            SELECT DISTINCT
                LTRIM(RTRIM(IdSite)) AS IdSite,
                LTRIM(RTRIM(Site)) AS NombreSite,
                MAX(IdZona) AS IdZona
            FROM dbo.updimportar
            WHERE NULLIF(LTRIM(RTRIM(IdSite)), '') IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(Site)), '') IS NOT NULL
            GROUP BY LTRIM(RTRIM(IdSite)), LTRIM(RTRIM(Site))
        )
        INSERT INTO dbo.Site (IdSite, NombreSite, IdZona, Correlativo)
        SELECT
            origen.IdSite,
            origen.NombreSite,
            ISNULL(origen.IdZona, 0),
            ISNULL((SELECT MAX(destino.Correlativo) FROM dbo.Site destino WITH (UPDLOCK, HOLDLOCK) WHERE destino.IdSite = origen.IdSite), 0)
                + ROW_NUMBER() OVER (PARTITION BY origen.IdSite ORDER BY origen.NombreSite)
        FROM SitesNuevos origen
        WHERE NOT EXISTS
        (
            SELECT 1 FROM dbo.Site destino
            WHERE UPPER(LTRIM(RTRIM(destino.IdSite))) = UPPER(origen.IdSite)
              AND UPPER(LTRIM(RTRIM(destino.NombreSite))) = UPPER(origen.NombreSite)
        );

        /*
           Completa los registros que ya existen antes de insertar nuevos.
           Los valores vacíos de la plantilla no sobreescriben información previa.
        */
        UPDATE i
           SET i.Correlativo = COALESCE(NULLIF(u.Correlativo, 0), s.Correlativo, i.Correlativo),
               i.IdZona = COALESCE(u.IdZona, i.IdZona),
               i.Mes = COALESCE(u.Mes, i.Mes),
               i.Ano = COALESCE(u.Ano, i.Ano),
               i.Estado_Oc = COALESCE(NULLIF(LTRIM(RTRIM(u.Estado_Oc)), ''), i.Estado_Oc),
               i.Nro_Oc = COALESCE(NULLIF(LTRIM(RTRIM(u.Nro_Oc)), ''), i.Nro_Oc),
               i.Posicion = COALESCE(NULLIF(LTRIM(RTRIM(u.Posicion)), ''), i.Posicion),
               i.MontoOc = COALESCE(u.MontoOc, i.MontoOc),
               i.MontoLiq = COALESCE(u.MontoLiq, i.MontoLiq),
               i.Monto_Bck = COALESCE(u.MontoBck, i.Monto_Bck),
               i.Porcentaje = COALESCE(u.Porcentaje, i.Porcentaje),
               i.Work = COALESCE(NULLIF(LTRIM(RTRIM(u.Work)), ''), i.Work),
               i.Zona = COALESCE(NULLIF(LTRIM(RTRIM(u.Zona)), ''), i.Zona),
               i.Empleado = COALESCE(NULLIF(LTRIM(RTRIM(u.Empleado)), ''), i.Empleado),
               i.Esting = COALESCE(NULLIF(LTRIM(RTRIM(u.Esting)), ''), i.Esting),
               i.Plano = COALESCE(NULLIF(LTRIM(RTRIM(u.Plano)), ''), i.Plano),
               i.Valmet = COALESCE(NULLIF(LTRIM(RTRIM(u.Valmet)), ''), i.Valmet),
               i.Status_Cw = COALESCE(NULLIF(LTRIM(RTRIM(u.StatusCw)), ''), i.Status_Cw),
               i.Status_Rini = COALESCE(NULLIF(LTRIM(RTRIM(u.StatusRini)), ''), i.Status_Rini),
               i.Monto_Visible = CASE
                   WHEN u.Porcentaje IS NULL AND u.MontoBck IS NULL THEN i.Monto_Visible
                   ELSE CAST(
                       COALESCE(u.MontoBck, i.Monto_Bck, 0) *
                       (1 - COALESCE(u.Porcentaje, i.Porcentaje, 0) / 100.0)
                       AS decimal(18, 2)
                   )
               END
        FROM dbo.importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, ''))))
           AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(i.AnoGestion, 0))))) =
               UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20), ISNULL(u.AnoGestion, 0)))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        LEFT JOIN dbo.site s
            ON UPPER(LTRIM(RTRIM(ISNULL(s.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(s.NombreSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
        WHERE i.idestado = 1;

        DECLARE @FilasActualizadas INT = @@ROWCOUNT;

        INSERT INTO dbo.importar
        (
            Ot,
            Cliente,
            Proyecto,
            IdSite,
            Site,
            TipoTrabajo,
            Work,
            Zona,
            Empleado,
            AnoGestion,
            IdZona,
            Mes,
            Ano,
            Estado_Oc,
            Nro_Oc,
            Posicion,
            MontoOc,
            MontoLiq,
            Porcentaje,
            Esting,
            Plano,
            Valmet,
            Status_Cw,
            Status_Rini,
            Monto_Visible,
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
            u.Work,
            u.Zona,
            u.Empleado,
            u.AnoGestion,
            u.IdZona,
            u.Mes,
            u.Ano,
            u.Estado_Oc,
            u.Nro_Oc,
            u.Posicion,
            u.MontoOc,
            u.MontoLiq,
            u.Porcentaje,
            u.Esting,
            u.Plano,
            u.Valmet,
            u.StatusCw,
            u.StatusRini,
            CAST(
                ISNULL(u.MontoBck, 0) * (1 - ISNULL(u.Porcentaje, 0) / 100.0)
                AS decimal(18, 2)
            ),
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
            COALESCE(NULLIF(u.Correlativo, 0), s.Correlativo),
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

        /* Mapeos posteriores del proceso legado, restringidos a la carga actual. */
        UPDATE i
           SET i.IdWork = constante.Correlativo
        FROM dbo.Importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        INNER JOIN dbo.Constante constante
            ON UPPER(LTRIM(RTRIM(ISNULL(constante.ValorIni, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Work, ''))))
           AND constante.Programa = 'ASIGNACIONES'
           AND constante.Campo = 'WORK';

        UPDATE i
           SET i.IdTipoTrabajo = constante.Correlativo
        FROM dbo.Importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        INNER JOIN dbo.Constante constante
            ON UPPER(LTRIM(RTRIM(ISNULL(constante.ValorIni, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, ''))))
           AND constante.Programa = 'ASIGNACIONES'
           AND constante.Campo = 'TIPO_TRABAJO';

        UPDATE i
           SET i.IdZona = constante.Correlativo
        FROM dbo.Importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        INNER JOIN dbo.Constante constante
            ON UPPER(LTRIM(RTRIM(ISNULL(constante.ValorIni, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Zona, ''))))
           AND constante.Programa = 'ASIGNACIONES'
           AND constante.Campo = 'ZONA';

        UPDATE i
           SET i.IdEmpleado = empleado.IdEmpleado
        FROM dbo.Importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        INNER JOIN dbo.Empleado empleado
            ON UPPER(LTRIM(RTRIM(ISNULL(empleado.InicialesEmpleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Empleado, ''))));

        UPDATE i
           SET i.Esting = ot.Esting,
               i.Plano = ot.Plano,
               i.Valmet = ot.Valmet,
               i.Status_Cw = ot.Status_Cw,
               i.Status_Rini = ot.Status_Rni
        FROM dbo.Importar i
        INNER JOIN dbo.updimportar u
            ON UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        INNER JOIN dbo.Ot ot
            ON UPPER(LTRIM(RTRIM(ISNULL(ot.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Ot, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(ot.Id, '')))) = UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, ''))));

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
            @FilasActualizadas AS FilasActualizadas,
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
