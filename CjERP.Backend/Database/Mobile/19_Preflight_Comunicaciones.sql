/*
  Diagnóstico de solo lectura para JC_Db.
  No crea, modifica ni elimina objetos o datos.
*/
SET NOCOUNT ON;

DECLARE @Objetos TABLE
(
  Orden int NOT NULL,
  Tipo varchar(20) NOT NULL,
  Esquema sysname NOT NULL,
  Nombre sysname NOT NULL,
  RequeridoPor nvarchar(200) NOT NULL
);

INSERT @Objetos(Orden, Tipo, Esquema, Nombre, RequeridoPor) VALUES
  (10, 'TABLE', 'dbo', 'Comunicacion', N'Bandeja y publicación'),
  (20, 'TABLE', 'dbo', 'ComunicacionDestinatario', N'Lectura, confirmación y destinatarios'),
  (30, 'TABLE', 'dbo', 'DispositivoMovil', N'Registro de dispositivos'),
  (40, 'TABLE', 'dbo', 'ComunicacionEvento', N'Auditoría'),
  (50, 'TABLE', 'dbo', 'ComunicacionAdjunto', N'Adjuntos SharePoint'),
  (60, 'TABLE', 'dbo', 'ComunicacionPushEntrega', N'Despacho y auditoría push'),
  (100, 'PROCEDURE', 'dbo', 'sp_Comunicacion_ListarPorEmpleado', N'Bandeja móvil'),
  (110, 'PROCEDURE', 'dbo', 'sp_Comunicacion_Obtener', N'Detalle móvil'),
  (120, 'PROCEDURE', 'dbo', 'sp_Comunicacion_MarcarLeido', N'Lectura móvil'),
  (130, 'PROCEDURE', 'dbo', 'sp_Comunicacion_Confirmar', N'Confirmación móvil'),
  (140, 'PROCEDURE', 'dbo', 'sp_DispositivoMovil_Registrar', N'Registro push'),
  (150, 'PROCEDURE', 'dbo', 'sp_Comunicacion_ResumenPorEmpleado', N'Resumen móvil'),
  (160, 'PROCEDURE', 'dbo', 'sp_ComunicacionAdjunto_ListarPorEmpleado', N'Listado de adjuntos'),
  (170, 'PROCEDURE', 'dbo', 'sp_ComunicacionAdjunto_ObtenerPorEmpleado', N'Descarga segura de adjuntos'),
  (180, 'PROCEDURE', 'dbo', 'sp_ComunicacionPush_ObtenerPendientes', N'Despacho push'),
  (190, 'PROCEDURE', 'dbo', 'sp_ComunicacionPush_RegistrarResultado', N'Auditoría push'),
  (200, 'PROCEDURE', 'dbo', 'sp_Comunicacion_Monitor', N'Monitor administrativo'),
  (210, 'PROCEDURE', 'dbo', 'sp_Comunicacion_Crear', N'Publicación administrativa e integración ERP'),
  (220, 'PROCEDURE', 'dbo', 'sp_ComunicacionAdjunto_Crear', N'Carga administrativa de adjuntos'),
  (230, 'PROCEDURE', 'dbo', 'sp_Comunicacion_Seguimiento', N'Seguimiento por destinatario'),
  (240, 'PROCEDURE', 'dbo', 'sp_DispositivoMovil_ListarAdmin', N'Inventario administrativo de dispositivos');

DECLARE @Resultados TABLE
(
  Orden int NOT NULL,
  Tipo varchar(20) NOT NULL,
  Objeto nvarchar(300) NOT NULL,
  RequeridoPor nvarchar(200) NOT NULL,
  Estado nvarchar(10) NOT NULL
);

INSERT @Resultados(Orden, Tipo, Objeto, RequeridoPor, Estado)
SELECT o.Orden, o.Tipo, QUOTENAME(o.Esquema) + N'.' + QUOTENAME(o.Nombre), o.RequeridoPor,
  CASE WHEN o.Tipo = 'TABLE' AND EXISTS
      (SELECT 1 FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = o.Esquema AND t.name = o.Nombre)
    THEN N'OK'
    WHEN o.Tipo = 'PROCEDURE' AND OBJECT_ID(QUOTENAME(o.Esquema) + N'.' + QUOTENAME(o.Nombre), N'P') IS NOT NULL
    THEN N'OK'
    ELSE N'FALTA'
  END
FROM @Objetos o;

SELECT Orden, Tipo, Objeto, RequeridoPor, Estado
FROM @Resultados
ORDER BY Orden;

SELECT
  COUNT(*) AS ObjetosEsperados,
  SUM(CASE WHEN Estado = N'OK' THEN 1 ELSE 0 END) AS ObjetosPresentes,
  SUM(CASE WHEN Estado = N'FALTA' THEN 1 ELSE 0 END) AS ObjetosFaltantes
FROM @Resultados;
