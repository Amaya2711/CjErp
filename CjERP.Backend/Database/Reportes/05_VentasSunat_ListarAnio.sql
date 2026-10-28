/* Reporte / Ventas vs Gastos: registros del ultimo lote de cada Periodo + RucEmisor de un anio, en una sola consulta
   (evita una llamada por periodo). Mismas columnas que sp_VentasSunat_Listar. Idempotente (CREATE OR ALTER).
   PV: ejecutar en la BD real; sin este SP la pantalla vuelve a consultar periodo por periodo (mas lento). */
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_ListarAnio
    @Anio CHAR(4)
AS
BEGIN
    SET NOCOUNT ON;

    -- Ultimo lote (mayor IdVentaSunat) de cada periodo y RUC emisor.
    ;WITH ranked AS (
        SELECT Lote,
               ROW_NUMBER() OVER (PARTITION BY Periodo, RucEmisor ORDER BY IdVentaSunat DESC) AS rn
        FROM dbo.VentasSunat
        WHERE Periodo LIKE @Anio + '%'
    ),
    lotes AS (SELECT DISTINCT Lote FROM ranked WHERE rn = 1)
    SELECT v.IdVentaSunat,
           RucEmisor AS rucEmisor, RazonSocialEmisor AS razonSocialEmisor, Periodo AS periodo, CarSunat AS carSunat,
           FechaEmision AS fechaEmision, FechaVcto AS fechaVcto, TipoCp AS tipoCp, Serie AS serie, NroCp AS nroCp,
           NroFinal AS nroFinal, TipoDocIdentidad AS tipoDocIdentidad, NroDocIdentidad AS nroDocIdentidad,
           RazonSocial AS razonSocial, ValorFacturadoExportacion AS valorFacturadoExportacion, BiGravada AS biGravada,
           DsctoBi AS dsctoBi, Igv AS igv, DsctoIgv AS dsctoIgv, MtoExonerado AS mtoExonerado, MtoInafecto AS mtoInafecto,
           Isc AS isc, BiGravIvap AS biGravIvap, Ivap AS ivap, Icbper AS icbper, OtrosTributos AS otrosTributos,
           TotalCp AS totalCp, Moneda AS moneda, TipoCambio AS tipoCambio, FecEmisionDocMod AS fecEmisionDocMod,
           TipoCpMod AS tipoCpMod, SerieCpMod AS serieCpMod, NroCpMod AS nroCpMod, IdProyectoOperadores AS idProyectoOperadores,
           TipoNota AS tipoNota, EstComp AS estComp, ValorFobEmbarcado AS valorFobEmbarcado, ValorOpGratuitas AS valorOpGratuitas,
           TipoOperacion AS tipoOperacion, DamCp AS damCp, Clu AS clu, IdEmpresa, v.IdCliente, v.Empresa, cli.NombreCliente
    FROM dbo.VentasSunat v
    INNER JOIN lotes l ON l.Lote = v.Lote
    OUTER APPLY (SELECT TOP (1) c.NombreCliente FROM dbo.Cliente c WHERE c.IdCliente = v.IdCliente) cli
    WHERE v.Periodo LIKE @Anio + '%'
    ORDER BY v.Periodo, v.IdVentaSunat;
END
GO
