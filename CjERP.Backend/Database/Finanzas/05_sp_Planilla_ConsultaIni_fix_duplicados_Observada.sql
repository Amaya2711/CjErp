/* ================================================================
   sp_Planilla_ConsultaIni: evita filas duplicadas por recibo.
   Causa: LEFT JOIN MovEstadosPagos x ON x.Correlativo = a.Correlativo AND x.Estado = 2
   trae una fila por cada vez que el recibo fue observado (Estado 2); solo se usa x.Usuario
   (UsuarioObs) y el DISTINCT no junta filas con usuario distinto.
   Arreglo: OUTER APPLY TOP (1) con la observacion mas reciente.

   El script lee la definicion INSTALADA del SP (no esta versionado en el repo), cambia solo ese
   join, crea antes una copia de respaldo y aplica CREATE OR ALTER. Si el texto del join no se
   encuentra tal cual, se detiene sin cambiar nada. Ejecutar en JC_Db.
   Verificacion: EXEC dbo.sp_Planilla_ConsultaIni @Correlativo = 133427;  -> 1 fila.
   ================================================================ */
USE JC_Db;
SET NOCOUNT ON;

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_Planilla_ConsultaIni'));
IF @def IS NULL THROW 50000, 'No existe dbo.sp_Planilla_ConsultaIni.', 1;

IF @def LIKE N'%OUTER APPLY%MovEstadosPagos%'
BEGIN
    PRINT 'El SP ya usa OUTER APPLY sobre MovEstadosPagos. No se hace ningun cambio.';
    RETURN;
END;

/* 1) Localizar el join: desde "LEFT JOIN MovEstadosPagos x" hasta "x.Estado = 2" (tolera espacios). */
DECLARE @ini INT = CHARINDEX(N'LEFT JOIN MovEstadosPagos x', @def);
IF @ini = 0 SET @ini = CHARINDEX(N'LEFT JOIN dbo.MovEstadosPagos x', @def);
IF @ini = 0 THROW 50001, 'No se encontro "LEFT JOIN MovEstadosPagos x" en el SP. No se modifico nada.', 1;

DECLARE @finClave NVARCHAR(30) = N'x.Estado = 2';
DECLARE @fin INT = CHARINDEX(@finClave, @def, @ini);
IF @fin = 0 OR @fin - @ini > 400 THROW 50002, 'No se encontro la condicion "x.Estado = 2" del join. No se modifico nada.', 1;
SET @fin = @fin + LEN(@finClave);

DECLARE @nuevoJoin NVARCHAR(MAX) = N'OUTER APPLY
    (
        SELECT TOP (1) m.Usuario
        FROM dbo.MovEstadosPagos m
        WHERE m.Correlativo = a.Correlativo
          AND m.Estado = 2
        ORDER BY m.FechaCreacion DESC, m.HoraCreacion DESC
    ) x';

DECLARE @nuevaDef NVARCHAR(MAX) = STUFF(@def, @ini, @fin - @ini, @nuevoJoin);

/* 2) Pasar CREATE ... a CREATE OR ALTER ... */
DECLARE @c INT = CHARINDEX(N'CREATE', @nuevaDef);
IF @c = 0 THROW 50003, 'La definicion no empieza con CREATE.', 1;
IF @nuevaDef NOT LIKE N'%CREATE OR ALTER%'
    SET @nuevaDef = STUFF(@nuevaDef, @c, LEN(N'CREATE'), N'CREATE OR ALTER');

/* 3) Respaldo de la version actual (rollback: ver al final) */
DECLARE @bak NVARCHAR(128) = N'sp_Planilla_ConsultaIni_bak_20261006';
IF OBJECT_ID(N'dbo.' + @bak) IS NULL
BEGIN
    DECLARE @defBak NVARCHAR(MAX) = REPLACE(@def, N'sp_Planilla_ConsultaIni', @bak);
    DECLARE @cb INT = CHARINDEX(N'CREATE', @defBak);
    SET @defBak = STUFF(@defBak, @cb, LEN(N'CREATE'), N'CREATE OR ALTER');
    EXEC sys.sp_executesql @defBak;
    PRINT 'Respaldo creado: dbo.' + @bak;
END;

/* 4) Aplicar */
EXEC sys.sp_executesql @nuevaDef;
PRINT 'dbo.sp_Planilla_ConsultaIni actualizado (una fila por recibo).';
GO

/* ---- ROLLBACK (solo si hiciera falta) ----
DECLARE @d NVARCHAR(MAX) = REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_Planilla_ConsultaIni_bak_20261006')),
                                   N'sp_Planilla_ConsultaIni_bak_20261006', N'sp_Planilla_ConsultaIni');
SET @d = STUFF(@d, CHARINDEX(N'CREATE', @d), LEN(N'CREATE'), N'CREATE OR ALTER');
EXEC sys.sp_executesql @d;
------------------------------------------ */
