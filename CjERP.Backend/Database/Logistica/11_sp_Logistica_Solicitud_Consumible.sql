/*
  Logistica de equipos - pestana Solicitud, vista CONSUMIBLE (materiales cod. 30 con stock disponible, sin linea de origen).
  PV: NO ejecutado ni probado contra la BD. Material/MaterialStock segun el sistema antiguo (CargaMaterialCon: codpap 30/40).
  Un consumible se solicita por cantidad: sp_Logistica_Solicitud_Registrar lo recibe con correlativo vacio y mueve el stock
  Disponible -> Aprobado (estado 9).
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Consumible
  @Texto nvarchar(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @Texto = NULLIF(LTRIM(RTRIM(@Texto)), N'');

  SELECT TOP (500)
         CAST(m.CodPap AS nvarchar(50))                  AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(ISNULL(s.Disponible, 0) AS decimal(18,4))  AS Disponible
  FROM dbo.Material m
  INNER JOIN dbo.MaterialStock s ON CAST(s.CodPap AS nvarchar(50)) = CAST(m.CodPap AS nvarchar(50))
  WHERE m.CodEstado = 1
    AND LEFT(CAST(m.CodPap AS nvarchar(50)), 2) = N'30'
    AND ISNULL(s.Disponible, 0) > 0
    AND (@Texto IS NULL
         OR CAST(m.CodPap AS nvarchar(50)) LIKE @Texto + N'%'
         OR m.NombreMaterial LIKE N'%' + @Texto + N'%')
  ORDER BY m.NombreMaterial;
END;
GO
