/*
  Logistica de equipos - consultas base (solo lectura). PV: no ejecutado ni probado contra la BD.
  Requiere 01 y 03 para sp_Logistica_Stock_Descuadres (la creacion de los SP no falla si aun no existen: resolucion diferida).
  Columnas de Material tomadas del sistema antiguo: CodPap, NombreMaterial, CodEstado, UnidadMedida.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Material_Listar
  @Texto        nvarchar(100) = NULL,
  @SoloActivos  bit           = 1
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP (500)
         m.CodPap, m.NombreMaterial, m.UnidadMedida, m.CodEstado
  FROM dbo.Material m
  WHERE (@SoloActivos = 0 OR m.CodEstado = 1)
    AND (@Texto IS NULL OR LTRIM(RTRIM(@Texto)) = N''
         OR CAST(m.CodPap AS nvarchar(50)) LIKE LTRIM(RTRIM(@Texto)) + N'%'
         OR m.NombreMaterial LIKE N'%' + LTRIM(RTRIM(@Texto)) + N'%')
  ORDER BY m.NombreMaterial;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Stock_Consultar
  @Texto         nvarchar(100) = NULL,
  @SoloConSaldo  bit           = 1
AS
BEGIN
  SET NOCOUNT ON;

  SELECT s.CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(ISNULL(s.Stock, 0)        AS decimal(18,4)) AS Stock,
         CAST(ISNULL(s.Disponible, 0)   AS decimal(18,4)) AS Disponible,
         CAST(ISNULL(s.Bloqueado, 0)    AS decimal(18,4)) AS Bloqueado,
         CAST(ISNULL(s.Solicitado, 0)   AS decimal(18,4)) AS Solicitado,
         CAST(ISNULL(s.Aprobado, 0)     AS decimal(18,4)) AS Aprobado,
         CAST(ISNULL(s.Despachado, 0)   AS decimal(18,4)) AS Despachado,
         CAST(ISNULL(s.Enviado, 0)      AS decimal(18,4)) AS Enviado,
         CAST(ISNULL(s.Campo, 0)        AS decimal(18,4)) AS Campo,
         CAST(ISNULL(s.Cruce, 0)        AS decimal(18,4)) AS Cruce,
         CAST(ISNULL(s.Cierre, 0)       AS decimal(18,4)) AS Cierre,
         CAST(ISNULL(s.Excedente, 0)    AS decimal(18,4)) AS Excedente,
         CAST(ISNULL(s.Folio, 0)        AS decimal(18,4)) AS Folio,
         CAST(ISNULL(s.Culminadas, 0)   AS decimal(18,4)) AS Culminadas,
         CAST(ISNULL(s.Recepcionado, 0) AS decimal(18,4)) AS Recepcionado,
         CAST(ISNULL(s.Validado, 0)     AS decimal(18,4)) AS Validado,
         CAST(ISNULL(s.Observada, 0)    AS decimal(18,4)) AS Observada
  FROM dbo.MaterialStock s
  LEFT JOIN dbo.Material m ON m.CodPap = s.CodPap
  WHERE (@SoloConSaldo = 0 OR ISNULL(s.Stock, 0) <> 0 OR ISNULL(s.Disponible, 0) <> 0)
    AND (@Texto IS NULL OR LTRIM(RTRIM(@Texto)) = N''
         OR s.CodPap LIKE LTRIM(RTRIM(@Texto)) + N'%'
         OR m.NombreMaterial LIKE N'%' + LTRIM(RTRIM(@Texto)) + N'%')
  ORDER BY m.NombreMaterial, s.CodPap;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Stock_Descuadres
AS
BEGIN
  SET NOCOUNT ON;

  SELECT d.CodPap, m.NombreMaterial, d.Bucket, d.EnMaterialStock, d.EnStockSaldo, d.Diferencia, d.Tipo
  FROM dbo.vStockDescuadres d
  LEFT JOIN dbo.Material m ON m.CodPap = d.CodPap
  ORDER BY ABS(d.Diferencia) DESC, d.CodPap, d.Bucket;
END;
GO
