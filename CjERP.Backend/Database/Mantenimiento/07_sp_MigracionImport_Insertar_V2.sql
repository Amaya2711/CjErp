/*
  MIGRAR V2
  Procesa exclusivamente el Excel recibido en @Datos. No utiliza ni borra
  dbo.updimportar, que es una tabla compartida y era la causa de bloqueos y
  timeouts entre cargas concurrentes.
*/
IF TYPE_ID(N'dbo.Type_MigracionImportInsertarV2') IS NULL
BEGIN
    CREATE TYPE dbo.Type_MigracionImportInsertarV2 AS TABLE
    (
        Ot nvarchar(100) NULL, Cliente nvarchar(250) NULL, Proyecto nvarchar(250) NULL,
        IdSite nvarchar(100) NULL, TipoTrabajo nvarchar(250) NULL, AnoGestion int NULL,
        Moneda nvarchar(100) NULL, IdMoneda int NULL, MontoBck decimal(18,2) NULL,
        Porcentaje decimal(18,4) NULL, StatusAtp nvarchar(250) NULL, EstatusPap nvarchar(250) NULL,
        EstatusOt nvarchar(250) NULL, Capitalizacion nvarchar(250) NULL, Correlativo int NULL,
        IdZona int NULL, Zona nvarchar(250) NULL, Work nvarchar(250) NULL, Empleado nvarchar(250) NULL,
        Mes int NULL, Ano int NULL, EstadoOc nvarchar(250) NULL, NroOc nvarchar(250) NULL,
        Posicion nvarchar(250) NULL, MontoOc decimal(18,2) NULL, MontoLiq decimal(18,2) NULL,
        Esting nvarchar(250) NULL, Plano nvarchar(250) NULL, Valmet nvarchar(250) NULL,
        StatusCw nvarchar(250) NULL, StatusRini nvarchar(250) NULL, IdActualizar int NULL,
        Site nvarchar(250) NULL
    );
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_MigracionImport_Insertar_V2
    @Datos dbo.Type_MigracionImportInsertarV2 READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM @Datos)
        THROW 50001, 'No se recibieron filas para migrar.', 1;

    CREATE TABLE #DatosLote
    (
        Ot nvarchar(100) NULL, Cliente nvarchar(250) NULL, Proyecto nvarchar(250) NULL,
        IdSite nvarchar(100) NULL, TipoTrabajo nvarchar(250) NULL, AnoGestion int NULL,
        Moneda nvarchar(100) NULL, IdMoneda int NULL, MontoBck decimal(18,2) NULL,
        Porcentaje decimal(18,4) NULL, StatusAtp nvarchar(250) NULL, EstatusPap nvarchar(250) NULL,
        EstatusOt nvarchar(250) NULL, Capitalizacion nvarchar(250) NULL, Correlativo int NULL,
        IdZona int NULL, Zona nvarchar(250) NULL, Work nvarchar(250) NULL, Empleado nvarchar(250) NULL,
        Mes int NULL, Ano int NULL, EstadoOc nvarchar(250) NULL, NroOc nvarchar(250) NULL,
        Posicion nvarchar(250) NULL, MontoOc decimal(18,2) NULL, MontoLiq decimal(18,2) NULL,
        Esting nvarchar(250) NULL, Plano nvarchar(250) NULL, Valmet nvarchar(250) NULL,
        StatusCw nvarchar(250) NULL, StatusRini nvarchar(250) NULL, IdActualizar int NULL,
        Site nvarchar(250) NULL
    );

    INSERT INTO #DatosLote SELECT * FROM @Datos;
    CREATE CLUSTERED INDEX IX_DatosLote_SiteOt ON #DatosLote(IdSite, Site, Ot);

    BEGIN TRY
        BEGIN TRAN;

        DECLARE @SiguienteCliente int = (SELECT ISNULL(MAX(IdCliente), 0) FROM dbo.Cliente WITH (UPDLOCK, HOLDLOCK));
        ;WITH Nuevos AS
        (
            SELECT DISTINCT LTRIM(RTRIM(Cliente)) NombreCliente
            FROM #DatosLote WHERE NULLIF(LTRIM(RTRIM(Cliente)), '') IS NOT NULL
        )
        INSERT dbo.Cliente(IdCliente, NombreCliente, Estado)
        SELECT @SiguienteCliente + ROW_NUMBER() OVER (ORDER BY NombreCliente), NombreCliente, 1
        FROM Nuevos n
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Cliente c WHERE UPPER(LTRIM(RTRIM(c.NombreCliente))) = UPPER(n.NombreCliente) AND c.Estado = 1);

        DECLARE @SiguienteProyecto int = (SELECT ISNULL(MAX(IdProyecto), 0) FROM dbo.Proyecto WITH (UPDLOCK, HOLDLOCK));
        ;WITH Nuevos AS
        (
            SELECT DISTINCT LTRIM(RTRIM(Proyecto)) NombreProyecto
            FROM #DatosLote WHERE NULLIF(LTRIM(RTRIM(Proyecto)), '') IS NOT NULL
        )
        INSERT dbo.Proyecto(IdProyecto, NombreProyecto, Estado)
        SELECT @SiguienteProyecto + ROW_NUMBER() OVER (ORDER BY NombreProyecto), NombreProyecto, 1
        FROM Nuevos n
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Proyecto p WHERE UPPER(LTRIM(RTRIM(p.NombreProyecto))) = UPPER(n.NombreProyecto) AND p.Estado = 1);

        ;WITH Nuevos AS
        (
            SELECT DISTINCT LTRIM(RTRIM(IdSite)) IdSite, LTRIM(RTRIM(Site)) NombreSite, MAX(IdZona) IdZona
            FROM #DatosLote
            WHERE NULLIF(LTRIM(RTRIM(IdSite)), '') IS NOT NULL AND NULLIF(LTRIM(RTRIM(Site)), '') IS NOT NULL
            GROUP BY LTRIM(RTRIM(IdSite)), LTRIM(RTRIM(Site))
        )
        INSERT dbo.Site(IdSite, NombreSite, IdZona, Correlativo)
        SELECT n.IdSite, n.NombreSite, ISNULL(n.IdZona, 0),
            ISNULL((SELECT MAX(s.Correlativo) FROM dbo.Site s WITH (UPDLOCK, HOLDLOCK) WHERE s.IdSite = n.IdSite), 0)
            + ROW_NUMBER() OVER (PARTITION BY n.IdSite ORDER BY n.NombreSite)
        FROM Nuevos n
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Site s WHERE UPPER(LTRIM(RTRIM(s.IdSite))) = UPPER(n.IdSite) AND UPPER(LTRIM(RTRIM(s.NombreSite))) = UPPER(n.NombreSite));

        UPDATE i SET
            i.Correlativo = COALESCE(NULLIF(u.Correlativo, 0), s.Correlativo, i.Correlativo),
            i.IdZona = COALESCE(u.IdZona, i.IdZona), i.Mes = COALESCE(u.Mes, i.Mes), i.Ano = COALESCE(u.Ano, i.Ano),
            i.Estado_Oc = COALESCE(NULLIF(LTRIM(RTRIM(u.EstadoOc)), ''), i.Estado_Oc),
            i.Nro_Oc = COALESCE(NULLIF(LTRIM(RTRIM(u.NroOc)), ''), i.Nro_Oc),
            i.Posicion = COALESCE(NULLIF(LTRIM(RTRIM(u.Posicion)), ''), i.Posicion),
            i.MontoOc = COALESCE(u.MontoOc, i.MontoOc), i.MontoLiq = COALESCE(u.MontoLiq, i.MontoLiq),
            i.Monto_Bck = COALESCE(u.MontoBck, i.Monto_Bck), i.Porcentaje = COALESCE(u.Porcentaje, i.Porcentaje),
            i.Work = COALESCE(NULLIF(LTRIM(RTRIM(u.Work)), ''), i.Work), i.Zona = COALESCE(NULLIF(LTRIM(RTRIM(u.Zona)), ''), i.Zona),
            i.Empleado = COALESCE(NULLIF(LTRIM(RTRIM(u.Empleado)), ''), i.Empleado),
            i.Esting = COALESCE(NULLIF(LTRIM(RTRIM(u.Esting)), ''), i.Esting), i.Plano = COALESCE(NULLIF(LTRIM(RTRIM(u.Plano)), ''), i.Plano),
            i.Valmet = COALESCE(NULLIF(LTRIM(RTRIM(u.Valmet)), ''), i.Valmet),
            i.Status_Cw = COALESCE(NULLIF(LTRIM(RTRIM(u.StatusCw)), ''), i.Status_Cw), i.Status_Rini = COALESCE(NULLIF(LTRIM(RTRIM(u.StatusRini)), ''), i.Status_Rini),
            i.Monto_Visible = CASE WHEN u.Porcentaje IS NULL AND u.MontoBck IS NULL THEN i.Monto_Visible ELSE CAST(COALESCE(u.MontoBck, i.Monto_Bck, 0) * (1 - COALESCE(u.Porcentaje, i.Porcentaje, 0) / 100.0) AS decimal(18,2)) END
        FROM dbo.Importar i
        INNER JOIN #DatosLote u ON UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, ''))))
            AND ISNULL(i.AnoGestion, 0) = ISNULL(u.AnoGestion, 0)
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, ''))))
        LEFT JOIN dbo.Site s ON UPPER(LTRIM(RTRIM(ISNULL(s.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, '')))) AND UPPER(LTRIM(RTRIM(ISNULL(s.NombreSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
        WHERE i.IdEstado = 1;
        DECLARE @FilasActualizadas int = @@ROWCOUNT;

        CREATE TABLE #Insertados(Ot nvarchar(100) NULL, IdCliente int NULL, IdProyecto int NULL, IdSite nvarchar(100) NULL, CorreSite int NULL);
        INSERT dbo.Importar(Ot, Cliente, Proyecto, IdSite, Site, TipoTrabajo, Work, Zona, Empleado, AnoGestion, IdZona, Mes, Ano, Estado_Oc, Nro_Oc, Posicion, MontoOc, MontoLiq, Porcentaje, Esting, Plano, Valmet, Status_Cw, Status_Rini, Monto_Visible, idmoneda, monto_bck, IdActualizar, NroInterno, IdCliente, IdProyecto, Correlativo, idestado)
        OUTPUT INSERTED.Ot, INSERTED.IdCliente, INSERTED.IdProyecto, INSERTED.IdSite, INSERTED.Correlativo INTO #Insertados
        SELECT u.Ot, u.Cliente, u.Proyecto, u.IdSite, u.Site, u.TipoTrabajo, u.Work, u.Zona, u.Empleado, u.AnoGestion, u.IdZona, u.Mes, u.Ano, u.EstadoOc, u.NroOc, u.Posicion, u.MontoOc, u.MontoLiq, u.Porcentaje, u.Esting, u.Plano, u.Valmet, u.StatusCw, u.StatusRini,
            CAST(ISNULL(u.MontoBck, 0) * (1 - ISNULL(u.Porcentaje, 0) / 100.0) AS decimal(18,2)), u.IdMoneda, u.MontoBck, COALESCE(u.IdActualizar, 0),
            ISNULL((SELECT MAX(i.NroInterno) FROM dbo.Importar i), 0) + ROW_NUMBER() OVER (ORDER BY (SELECT NULL)), c.IdCliente, p.IdProyecto, COALESCE(NULLIF(u.Correlativo, 0), s.Correlativo), 1
        FROM #DatosLote u
        LEFT JOIN dbo.Cliente c ON UPPER(LTRIM(RTRIM(ISNULL(c.NombreCliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, '')))) AND c.Estado = 1
        LEFT JOIN dbo.Proyecto p ON UPPER(LTRIM(RTRIM(ISNULL(p.NombreProyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, '')))) AND p.Estado = 1
        LEFT JOIN dbo.Site s ON UPPER(LTRIM(RTRIM(ISNULL(s.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, '')))) AND UPPER(LTRIM(RTRIM(ISNULL(s.NombreSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Importar i WHERE i.IdEstado = 1
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Cliente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Cliente, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Proyecto, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Proyecto, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.IdSite, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.IdSite, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Site, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Site, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.TipoTrabajo, ''))))
            AND ISNULL(i.AnoGestion, 0) = ISNULL(u.AnoGestion, 0)
            AND UPPER(LTRIM(RTRIM(ISNULL(i.Ot, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.Ot, '')))));
        DECLARE @FilasInsertadas int = @@ROWCOUNT;

        UPDATE i SET i.IdWork = c.Correlativo FROM dbo.Importar i INNER JOIN #DatosLote u ON i.IdSite = u.IdSite AND i.Site = u.Site AND ISNULL(i.Ot,'') = ISNULL(u.Ot,'') INNER JOIN dbo.Constante c ON UPPER(LTRIM(RTRIM(ISNULL(c.ValorIni,'')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Work,'')))) AND c.Programa='ASIGNACIONES' AND c.Campo='WORK';
        UPDATE i SET i.IdTipoTrabajo = c.Correlativo FROM dbo.Importar i INNER JOIN #DatosLote u ON i.IdSite = u.IdSite AND i.Site = u.Site AND ISNULL(i.Ot,'') = ISNULL(u.Ot,'') INNER JOIN dbo.Constante c ON UPPER(LTRIM(RTRIM(ISNULL(c.ValorIni,'')))) = UPPER(LTRIM(RTRIM(ISNULL(i.TipoTrabajo,'')))) AND c.Programa='ASIGNACIONES' AND c.Campo='TIPO_TRABAJO';
        UPDATE i SET i.IdZona = c.Correlativo FROM dbo.Importar i INNER JOIN #DatosLote u ON i.IdSite = u.IdSite AND i.Site = u.Site AND ISNULL(i.Ot,'') = ISNULL(u.Ot,'') INNER JOIN dbo.Constante c ON UPPER(LTRIM(RTRIM(ISNULL(c.ValorIni,'')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Zona,'')))) AND c.Programa='ASIGNACIONES' AND c.Campo='ZONA';
        UPDATE i SET i.IdEmpleado = e.IdEmpleado FROM dbo.Importar i INNER JOIN #DatosLote u ON i.IdSite = u.IdSite AND i.Site = u.Site AND ISNULL(i.Ot,'') = ISNULL(u.Ot,'') INNER JOIN dbo.Empleado e ON UPPER(LTRIM(RTRIM(ISNULL(e.InicialesEmpleado,'')))) = UPPER(LTRIM(RTRIM(ISNULL(i.Empleado,''))));
        UPDATE i SET i.Esting=o.Esting, i.Plano=o.Plano, i.Valmet=o.Valmet, i.Status_Cw=o.Status_Cw, i.Status_Rini=o.Status_Rni FROM dbo.Importar i INNER JOIN #DatosLote u ON i.IdSite=u.IdSite AND ISNULL(i.Ot,'')=ISNULL(u.Ot,'') INNER JOIN dbo.Ot o ON UPPER(LTRIM(RTRIM(ISNULL(o.Ot,''))))=UPPER(LTRIM(RTRIM(ISNULL(i.Ot,'')))) AND UPPER(LTRIM(RTRIM(ISNULL(o.Id,''))))=UPPER(LTRIM(RTRIM(ISNULL(i.IdSite,''))));

        ;WITH Operaciones AS (SELECT UPPER(LTRIM(RTRIM(Ot))) OtKey, MAX(Ot) Ot, MAX(IdCliente) IdCliente, MAX(IdProyecto) IdProyecto, MAX(IdSite) IdSite, MAX(CorreSite) CorreSite FROM #Insertados WHERE NULLIF(LTRIM(RTRIM(Ot)), '') IS NOT NULL GROUP BY UPPER(LTRIM(RTRIM(Ot))))
        INSERT dbo.db_operaciones_cj(Ot, IdCliente, IdProyecto, IdSite, CorreSite)
        SELECT o.Ot, o.IdCliente, o.IdProyecto, o.IdSite, o.CorreSite FROM Operaciones o
        WHERE NOT EXISTS (SELECT 1 FROM dbo.db_operaciones_cj d WHERE UPPER(LTRIM(RTRIM(ISNULL(d.Ot,''))))=o.OtKey);
        DECLARE @OperacionesCjNuevas int = @@ROWCOUNT;

        COMMIT;
        SELECT (SELECT COUNT(1) FROM #DatosLote) FilasStaging, @FilasInsertadas FilasInsertadas, @FilasActualizadas FilasActualizadas, 0 FilasNoEncontradas, @OperacionesCjNuevas OperacionesCjNuevas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO
