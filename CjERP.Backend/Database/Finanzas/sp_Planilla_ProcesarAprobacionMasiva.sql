USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ================================================================
   dbo.sp_Planilla_ProcesarAprobacionMasiva

   Cambio respecto a la version anterior (2026-10-05):
   - Se agrega el bloque "RE-APROBACION ENVIADA COMO CODESTADO = 1":
     el backend fuerza @CodEstado = 1 para el empleado 77, por lo que una
     re-aprobacion (registros en Estado 6) llegaba como 1 y era rechazada con
     "El estado actual no permite realizar esta aprobacion". Ahora, si el
     registro esta en Estado 6 y llega @CodEstado = 1, se trata como
     re-aprobacion (EstadoSolicitado = 6 -> EstadoFinal = 1).
   ================================================================ */

CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_ProcesarAprobacionMasiva]
(
    /* Registros seleccionados */
    @Registros dbo.TVP_Planilla_Aprobacion READONLY,

    /* ============================================================
       ESTADOS
       1  = APROBACION / HORMIGA
       2  = OBSERVADO
       3  = RECHAZADO
       6  = SEGUNDA APROBACION / RE-APROBACION
       10 = PRIMERA APROBACION
       ============================================================ */
    @CodEstado INT,
    @IdEmpleadoCj INT,
    @CodEmpleado INT,
    @Usuario VARCHAR(100),
    @NombreDispositivo VARCHAR(250) = NULL,
    @Observacion VARCHAR(1000) = NULL,
    @IdRegularizar INT = 0
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    /* ============================================================
       VARIABLES GENERALES
       ============================================================ */
    DECLARE
        @FechaActual DATETIME2(0) = SYSDATETIME(),
        @FechaAprobacion DATE,
        @Revision VARCHAR(2);

    SET @FechaAprobacion = CAST(@FechaActual AS DATE);

    SET @Revision =
        CASE
            WHEN CAST(@FechaActual AS TIME) > CAST('14:00:00' AS TIME)
            THEN 'PM'
            ELSE 'AM'
        END;

    SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), '');

    BEGIN TRY

        /* ========================================================
           VALIDAR ESTADO
           ======================================================== */
        IF @CodEstado NOT IN (1,2,3,6,10)
        BEGIN
            THROW 50001, 'El código de estado enviado no es válido.', 1;
        END;

        /* ========================================================
           RECHAZADO / OBSERVADO REQUIERE COMENTARIO
           ======================================================== */
        IF @CodEstado IN (2,3)
           AND @Observacion IS NULL
        BEGIN
            THROW 50002, 'Debe ingresar detalle indicando el motivo del rechazo u observación.', 1;
        END;

        /* ========================================================
           VALIDAR REGISTROS
           ======================================================== */
        IF NOT EXISTS (SELECT 1 FROM @Registros)
        BEGIN
            THROW 50003, 'No se enviaron registros para procesar.', 1;
        END;

        /* ========================================================
           VALIDAR MONEDAS
           ======================================================== */
        IF EXISTS
        (
            SELECT 1
            FROM @Registros r
            WHERE NOT EXISTS
            (
                SELECT 1
                FROM Constante c
                WHERE UPPER(LTRIM(RTRIM(c.Campo))) = 'TIPO_MONEDA'
                  AND c.Correlativo = r.TipoMoneda
            )
        )
        BEGIN
            THROW 50004, 'Existen registros con TipoMoneda no válido.', 1;
        END;

        /* ========================================================
           INICIAR TRANSACCION
           ======================================================== */
        BEGIN TRAN;

        /* ========================================================
           TABLA DE REGISTROS SELECCIONADOS

           EstadoSolicitado: estado enviado por frontend.
           EstadoFinal:      estado que realmente se grabara.
           ======================================================== */
        DECLARE @Procesar TABLE
        (
            Correlativo INT NOT NULL,
            IdSite VARCHAR(50) NOT NULL,
            TipoMoneda INT NOT NULL,
            Moneda VARCHAR(100) NULL,
            Fecha DATE NULL,
            Total DECIMAL(18,2) NULL,
            IdResponsable INT NULL,
            EstadoAnterior INT NULL,
            EstadoSolicitado INT NULL,
            EstadoFinal INT NULL,
            RequiereSegundaAprobacion BIT NOT NULL DEFAULT 0,
            MotivoSegundaAprobacion VARCHAR(100) NULL,
            Procesar BIT NOT NULL DEFAULT 1,
            Mensaje VARCHAR(1000) NULL,
            PRIMARY KEY (Correlativo, IdSite)
        );

        /* ========================================================
           CARGAR REGISTROS SELECCIONADOS
           ======================================================== */
        INSERT INTO @Procesar
        (
            Correlativo,
            IdSite,
            TipoMoneda,
            Moneda,
            Fecha,
            Total,
            IdResponsable,
            EstadoAnterior,
            EstadoSolicitado,
            EstadoFinal,
            RequiereSegundaAprobacion,
            MotivoSegundaAprobacion,
            Procesar,
            Mensaje
        )
        SELECT
            r.Correlativo,
            r.IdSite,
            r.TipoMoneda,
            c.ValorIni,
            CAST(p.FecIngreso AS DATE),
            ISNULL(p.Total, 0),
            p.IdResponsable,
            p.Estado,
            @CodEstado,
            @CodEstado,
            0,
            NULL,
            CASE WHEN p.Correlativo IS NULL THEN 0 ELSE 1 END,
            CASE
                WHEN p.Correlativo IS NULL
                THEN 'No se encontró el registro en Planilla.'
                ELSE NULL
            END
        FROM @Registros r
        LEFT JOIN Planilla p WITH (UPDLOCK, HOLDLOCK)
            ON p.Correlativo = r.Correlativo
           AND p.IdSite = r.IdSite
        LEFT JOIN Constante c
            ON UPPER(LTRIM(RTRIM(c.Campo))) = 'TIPO_MONEDA'
           AND c.Correlativo = r.TipoMoneda;

        /* ========================================================
           REGLA 1
           VALIDACION INDIVIDUAL

           Si un registro por si solo llega al limite:
               EstadoFinal = 6

           Solo aplica para CodEstado 1 y 10.
           No aplica para empleado 77.
           ======================================================== */
        UPDATE x
        SET
            x.EstadoFinal = 6,
            x.RequiereSegundaAprobacion = 1,
            x.MotivoSegundaAprobacion = 'INDIVIDUAL',
            x.Mensaje = 'El monto individual supera el límite permitido y debe pasar por 2da aprobación.'
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado IN (1,10)
          AND @IdEmpleadoCj <> 77
          AND x.TipoMoneda IN (1,2,3,4,5)
          AND x.Total >=
              CASE x.TipoMoneda
                  WHEN 1 THEN CAST(2000 AS DECIMAL(18,2))   /* SOLES */
                  WHEN 2 THEN CAST(530 AS DECIMAL(18,2))    /* DOLARES */
                  WHEN 3 THEN CAST(512 AS DECIMAL(18,2))    /* EUROS */
                  WHEN 4 THEN CAST(34483 AS DECIMAL(18,2))  /* PESO DOMINICANO */
                  WHEN 5 THEN CAST(1819 AS DECIMAL(18,2))   /* PESO COLOMBIANO */
              END;

        /* ========================================================
           TABLA ACUMULADO DIARIO

           Agrupa por IdResponsable, Fecha, TipoMoneda.

           TotalExistente:             suma Planilla Estado 6 y 10
           TotalSeleccionadoAdicional: seleccionados que NO estaban en 6/10
           TotalDia:                   existente + adicional
           ======================================================== */
        DECLARE @AcumuladoDiario TABLE
        (
            IdResponsable INT NOT NULL,
            Fecha DATE NOT NULL,
            TipoMoneda INT NOT NULL,
            TotalExistente DECIMAL(18,2) NOT NULL DEFAULT 0,
            TotalSeleccionadoAdicional DECIMAL(18,2) NOT NULL DEFAULT 0,
            TotalDia DECIMAL(18,2) NOT NULL DEFAULT 0,
            Limite DECIMAL(18,2) NOT NULL,
            SuperaLimite BIT NOT NULL DEFAULT 0,
            PRIMARY KEY (IdResponsable, Fecha, TipoMoneda)
        );

        /* ========================================================
           REGLA 2
           ACUMULADO DIARIO

           Se ejecuta para primera aprobacion / aprobacion.

           El registro seleccionado puede estar todavia en Estado 0,
           2, etc.; por eso se suma aparte aunque fisicamente no
           este en Estado 6.
           ======================================================== */
        IF @CodEstado IN (1,10)
           AND @IdEmpleadoCj <> 77
        BEGIN

            /* 2.1 CREAR GRUPOS QUE DEBEN SER EVALUADOS */
            INSERT INTO @AcumuladoDiario
            (
                IdResponsable,
                Fecha,
                TipoMoneda,
                TotalExistente,
                TotalSeleccionadoAdicional,
                TotalDia,
                Limite,
                SuperaLimite
            )
            SELECT DISTINCT
                x.IdResponsable,
                x.Fecha,
                x.TipoMoneda,
                0,
                0,
                0,
                CASE x.TipoMoneda
                    WHEN 1 THEN CAST(2000 AS DECIMAL(18,2))
                    WHEN 2 THEN CAST(530 AS DECIMAL(18,2))
                    WHEN 3 THEN CAST(512 AS DECIMAL(18,2))
                    WHEN 4 THEN CAST(34483 AS DECIMAL(18,2))
                    WHEN 5 THEN CAST(1819 AS DECIMAL(18,2))
                END,
                0
            FROM @Procesar x
            WHERE x.Procesar = 1
              AND x.IdResponsable IS NOT NULL
              AND x.Fecha IS NOT NULL
              AND x.TipoMoneda IN (1,2,3,4,5);

            /* 2.2 SUMAR REGISTROS YA EXISTENTES (Estado 6 y 10,
                   mismo Responsable / Fecha / Moneda) */
            UPDATE d
            SET d.TotalExistente =
                ISNULL
                (
                    (
                        SELECT SUM(ISNULL(p.Total, 0))
                        FROM Planilla p WITH (UPDLOCK, HOLDLOCK)
                        WHERE p.IdResponsable = d.IdResponsable
                          AND CAST(p.FecIngreso AS DATE) = d.Fecha
                          AND p.TipoMoneda = d.TipoMoneda
                          AND p.Estado IN (6,10)
                    ),
                    0
                )
            FROM @AcumuladoDiario d;

            /* 2.3 SUMAR REGISTROS SELECCIONADOS ADICIONALES
                   (los que NO estaban originalmente en 6 o 10, para
                   no duplicar lo ya incluido en TotalExistente) */
            UPDATE d
            SET d.TotalSeleccionadoAdicional =
                ISNULL
                (
                    (
                        SELECT SUM(ISNULL(x.Total, 0))
                        FROM @Procesar x
                        WHERE x.Procesar = 1
                          AND x.IdResponsable = d.IdResponsable
                          AND x.Fecha = d.Fecha
                          AND x.TipoMoneda = d.TipoMoneda
                          AND ISNULL(x.EstadoAnterior, -999) NOT IN (6,10)
                    ),
                    0
                )
            FROM @AcumuladoDiario d;

            /* 2.4 TOTAL DEL DIA */
            UPDATE d
            SET d.TotalDia = d.TotalExistente + d.TotalSeleccionadoAdicional
            FROM @AcumuladoDiario d;

            /* 2.5 VALIDAR LIMITE */
            UPDATE d
            SET d.SuperaLimite =
                CASE WHEN d.TotalDia >= d.Limite THEN 1 ELSE 0 END
            FROM @AcumuladoDiario d;

            /* 2.6 ACTUALIZAR ESTADO FINAL DE LOS SELECCIONADOS
                   Si el acumulado supera el limite: EstadoFinal = 6 */
            UPDATE x
            SET
                x.EstadoFinal = 6,
                x.RequiereSegundaAprobacion = 1,
                x.MotivoSegundaAprobacion =
                    CASE
                        WHEN x.MotivoSegundaAprobacion = 'INDIVIDUAL'
                        THEN 'INDIVIDUAL + ACUMULADO'
                        ELSE 'ACUMULADO'
                    END,
                x.Mensaje = 'El monto acumulado diario del responsable supera el límite permitido y debe pasar por 2da aprobación.'
            FROM @Procesar x
            INNER JOIN @AcumuladoDiario d
                ON d.IdResponsable = x.IdResponsable
               AND d.Fecha = x.Fecha
               AND d.TipoMoneda = x.TipoMoneda
            WHERE x.Procesar = 1
              AND d.SuperaLimite = 1;

            /* 2.7 ACTUALIZAR TODOS LOS OTROS REGISTROS DEL GRUPO
                   Si el acumulado supera el limite, todos los registros
                   Planilla del mismo Responsable / Fecha / TipoMoneda en
                   Estado 6 o 10 quedan en Estado 6.

                   Ejemplo: 580 (Estado 10) + 2500 seleccionado = 3080
                            580 -> 6, 2500 -> 6 */
            UPDATE p
            SET p.Estado = 6
            FROM Planilla p
            INNER JOIN @AcumuladoDiario d
                ON d.IdResponsable = p.IdResponsable
               AND d.Fecha = CAST(p.FecIngreso AS DATE)
               AND d.TipoMoneda = p.TipoMoneda
            WHERE p.Estado IN (6,10)
              AND d.SuperaLimite = 1;

        END;

        /* ========================================================
           RE-APROBACION ENVIADA COMO CODESTADO = 1   << NUEVO >>

           El backend fuerza @CodEstado = 1 para el empleado 77.
           Si el registro ya esta en Estado 6 y llega @CodEstado = 1,
           se trata como re-aprobacion (segunda aprobacion) y pasa
           a Estado 1 con el flujo normal de re-aprobacion.
           ======================================================== */
        UPDATE x
        SET
            x.EstadoSolicitado = 6,
            x.EstadoFinal = 6
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND @CodEstado = 1
          AND x.EstadoAnterior = 6;

        /* ========================================================
           SEGUNDA APROBACION / RE-APROBACION

           Si se esta procesando EstadoSolicitado = 6:
               EstadoFinal = 1
           ======================================================== */
        UPDATE x
        SET x.EstadoFinal = 1
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado = 6;

        /* ========================================================
           VALIDACION APROBACION EMPLEADO 77
           ======================================================== */
        UPDATE x
        SET
            x.Procesar = 0,
            x.Mensaje = 'El estado actual no permite realizar esta aprobación.'
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado <> 6
          AND x.EstadoFinal = 1
          AND @IdEmpleadoCj = 77
          AND ISNULL(x.EstadoAnterior, -999) NOT IN (0, 2, 10);

        /* ========================================================
           APROBACION FINAL NORMAL

           Debe venir de Estado 10.
           ======================================================== */
        UPDATE x
        SET
            x.Procesar = 0,
            x.Mensaje = 'El registro debe encontrarse en estado 10 para realizar la aprobación final.'
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado <> 6
          AND x.EstadoFinal = 1
          AND @IdEmpleadoCj <> 77
          AND ISNULL(x.EstadoAnterior, -999) <> 10;

        /* ========================================================
           PRIMERA APROBACION

           Si sigue en EstadoFinal = 10:
               EstadoAnterior debe ser 0 o 2.
           ======================================================== */
        UPDATE x
        SET
            x.Procesar = 0,
            x.Mensaje = 'El estado actual no permite realizar la primera aprobación.'
        FROM @Procesar x
        WHERE x.Procesar = 1
          AND x.EstadoFinal = 10
          AND ISNULL(x.EstadoAnterior, -999) NOT IN (0, 2);

        /* ========================================================
           RE-APROBACION

           EstadoSolicitado = 6
           EstadoFinal = 1
           ======================================================== */
        UPDATE p
        SET
            p.revisionpmaprobar = @Revision,
            p.fecharevisionaprobar = @FechaActual,
            p.macreaprobador = @NombreDispositivo,
            p.Estado = x.EstadoFinal,
            p.observacion = @Observacion,
            p.FechaReAprobador = @FechaActual,
            p.IdReAprobador = @CodEmpleado,
            p.IdRegularizar = @IdRegularizar
        FROM Planilla p
        INNER JOIN @Procesar x
            ON x.Correlativo = p.Correlativo
           AND x.IdSite = p.IdSite
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado = 6;

        /* ========================================================
           ACTUALIZACION NORMAL

           IMPORTANTE: Estado = EstadoFinal  (NO @CodEstado)
           ======================================================== */
        UPDATE p
        SET
            p.revisionpmaprobar = @Revision,
            p.fecharevisionaprobar = @FechaActual,
            p.macaprobador = @NombreDispositivo,
            p.Estado = x.EstadoFinal,
            p.observacion = @Observacion,
            p.FechaAprobador = @FechaAprobacion,
            p.IdRegularizar = @IdRegularizar
        FROM Planilla p
        INNER JOIN @Procesar x
            ON x.Correlativo = p.Correlativo
           AND x.IdSite = p.IdSite
        WHERE x.Procesar = 1
          AND x.EstadoSolicitado <> 6;

        /* ========================================================
           HISTORIAL DE LOS REGISTROS SELECCIONADOS

           Conserva comportamiento actual:
               MovEstadosPagos.Estado = EstadoSolicitado
           ======================================================== */
        INSERT INTO MovEstadosPagos
        (
            Correlativo,
            Estado,
            Observacion,
            Usuario,
            FechaCreacion,
            HoraCreacion
        )
        SELECT
            x.Correlativo,
            x.EstadoSolicitado,
            @Observacion,
            @Usuario,
            @FechaAprobacion,
            @FechaActual
        FROM @Procesar x
        WHERE x.Procesar = 1;

        /* ========================================================
           MENSAJES
           ======================================================== */
        UPDATE x
        SET x.Mensaje =
            CASE
                WHEN x.RequiereSegundaAprobacion = 1
                     AND x.MotivoSegundaAprobacion = 'INDIVIDUAL + ACUMULADO'
                THEN 'El registro supera el límite individual y además el acumulado diario supera el límite. Debe pasar por 2da aprobación.'

                WHEN x.RequiereSegundaAprobacion = 1
                     AND x.MotivoSegundaAprobacion = 'INDIVIDUAL'
                THEN 'El monto individual supera el límite permitido y debe pasar por 2da aprobación.'

                WHEN x.RequiereSegundaAprobacion = 1
                     AND x.MotivoSegundaAprobacion = 'ACUMULADO'
                THEN 'El monto acumulado diario del responsable supera el límite permitido y debe pasar por 2da aprobación.'

                WHEN x.EstadoSolicitado = 6
                     AND x.EstadoFinal = 1
                THEN 'Segunda aprobación realizada correctamente.'

                WHEN x.EstadoFinal = 1
                THEN 'Registro aprobado correctamente.'

                WHEN x.EstadoFinal = 10
                THEN 'Primera aprobación realizada correctamente.'

                WHEN x.EstadoFinal = 3
                THEN 'Registro rechazado correctamente.'

                WHEN x.EstadoFinal = 2
                THEN 'Registro observado correctamente.'

                ELSE 'Proceso realizado correctamente.'
            END
        FROM @Procesar x
        WHERE x.Procesar = 1;

        /* ========================================================
           COMMIT
           ======================================================== */
        COMMIT TRAN;

        /* ========================================================
           RESULTSET 1
           DETALLE DE REGISTROS SELECCIONADOS
           ======================================================== */
        SELECT
            CASE WHEN x.Procesar = 1 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS Exito,
            x.Correlativo,
            x.IdSite,
            x.TipoMoneda,
            x.Moneda,
            x.Fecha AS FecIngreso,
            x.Total,
            x.IdResponsable,
            x.EstadoAnterior,
            x.EstadoSolicitado,
            x.EstadoFinal AS EstadoAplicado,
            x.RequiereSegundaAprobacion,
            x.MotivoSegundaAprobacion,
            CASE x.TipoMoneda
                WHEN 1 THEN CAST(2000 AS DECIMAL(18,2))
                WHEN 2 THEN CAST(530 AS DECIMAL(18,2))
                WHEN 3 THEN CAST(512 AS DECIMAL(18,2))
                WHEN 4 THEN CAST(34483 AS DECIMAL(18,2))
                WHEN 5 THEN CAST(1819 AS DECIMAL(18,2))
                ELSE NULL
            END AS LimiteSegundaAprobacion,
            d.TotalExistente,
            d.TotalSeleccionadoAdicional,
            d.TotalDia AS TotalAcumuladoDia,
            d.Limite AS LimiteAcumuladoDia,
            d.SuperaLimite,
            x.Mensaje
        FROM @Procesar x
        LEFT JOIN @AcumuladoDiario d
            ON d.IdResponsable = x.IdResponsable
           AND d.Fecha = x.Fecha
           AND d.TipoMoneda = x.TipoMoneda
        ORDER BY
            x.Correlativo,
            x.IdSite;

        /* ========================================================
           RESULTSET 2
           RESUMEN
           ======================================================== */
        SELECT
            COUNT(*) AS TotalSeleccionados,

            SUM(CASE WHEN Procesar = 1 THEN 1 ELSE 0 END) AS Procesados,

            SUM(CASE WHEN Procesar = 0 THEN 1 ELSE 0 END) AS NoProcesados,

            SUM(CASE WHEN Procesar = 1 AND RequiereSegundaAprobacion = 1 THEN 1 ELSE 0 END)
                AS EnviadosSegundaAprobacion,

            SUM(CASE WHEN Procesar = 1 AND MotivoSegundaAprobacion = 'INDIVIDUAL' THEN 1 ELSE 0 END)
                AS SegundaPorMontoIndividual,

            SUM(CASE WHEN Procesar = 1 AND MotivoSegundaAprobacion = 'ACUMULADO' THEN 1 ELSE 0 END)
                AS SegundaPorAcumulado,

            SUM(CASE WHEN Procesar = 1 AND MotivoSegundaAprobacion = 'INDIVIDUAL + ACUMULADO' THEN 1 ELSE 0 END)
                AS SegundaPorAmbasReglas,

            SUM(CASE WHEN Procesar = 1 AND EstadoFinal = 1 THEN 1 ELSE 0 END) AS Aprobados,

            SUM(CASE WHEN Procesar = 1 AND EstadoFinal = 10 THEN 1 ELSE 0 END) AS PrimeraAprobacion,

            SUM(CASE WHEN Procesar = 1 AND EstadoFinal = 2 THEN 1 ELSE 0 END) AS Observados,

            SUM(CASE WHEN Procesar = 1 AND EstadoFinal = 3 THEN 1 ELSE 0 END) AS Rechazados
        FROM @Procesar;

        /* ========================================================
           RESULTSET 3
           DIAGNOSTICO DEL ACUMULADO

           TotalExistente             = registros Estado 6/10
           TotalSeleccionadoAdicional = seleccionados que no estaban en 6/10
           TotalDia                   = suma real
           ======================================================== */
        SELECT
            d.IdResponsable,
            d.Fecha AS FecIngreso,
            d.TipoMoneda,
            c.ValorIni AS Moneda,
            d.TotalExistente,
            d.TotalSeleccionadoAdicional,
            d.TotalDia,
            d.Limite,
            d.SuperaLimite
        FROM @AcumuladoDiario d
        LEFT JOIN Constante c
            ON UPPER(LTRIM(RTRIM(c.Campo))) = 'TIPO_MONEDA'
           AND c.Correlativo = d.TipoMoneda
        ORDER BY
            d.Fecha,
            d.IdResponsable,
            d.TipoMoneda;

    END TRY

    BEGIN CATCH

        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRAN;
        END;

        THROW;

    END CATCH;

END
GO
