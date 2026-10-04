using System.Text.RegularExpressions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS ESTATICAS sobre el texto de 17_sp_IA_Planilla_Buscar_v3_ModoResumen.sql. Verifican que el modo RESUMEN
/// reutiliza el filtrado con alcance de #Candidatos (un solo origen), que las dimensiones salen de una lista blanca
/// y que el modo por defecto sigue siendo DETALLE. NO ejecutan T-SQL: la prueba real contra SQL Server esta
/// pendiente (ver docs y Aceptacion_SP_Alcance_Dev.sql).
/// </summary>
[Trait("Category", "Static")]
public sealed class IaScopedSpV3ScriptContractTests
{
    private static readonly string[] Dimensions =
    [
        "CLIENTE", "PROYECTO", "RESPONSABLE", "SOLICITANTE", "SITE", "ESTADO", "MONEDA", "BIEN",
        "COMPROBANTE", "TIPOPAGO", "TIPOTRABAJO", "FECHA", "MES"
    ];

    private static readonly Lazy<string> Script = new(() => LoadScript());

    [Fact]
    public void EsUnCreateOrAlterDelMismoProcedimiento_SinDdlSobreTablasDeNegocio()
    {
        var sql = Script.Value;

        Assert.Contains("CREATE OR ALTER PROCEDURE [dbo].[sp_IA_Planilla_Buscar]", sql);
        Assert.DoesNotContain("ALTER TABLE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("CREATE TABLE dbo.", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("INSERT INTO dbo.", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("UPDATE dbo.", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM dbo.", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LosParametrosNuevosVanAlFinal_ConElModoDetalleComoDefecto()
    {
        var sql = Script.Value;

        Assert.Matches(@"@Modo\s+VARCHAR\(10\)\s*=\s*'DETALLE'", sql);
        Assert.Matches(@"@AgruparPor\s+VARCHAR\(100\)\s*=\s*NULL", sql);
        Assert.Matches(@"@Top\s+INT\s*=\s*NULL", sql);
        Assert.True(
            sql.IndexOf("@TipoCambioCOP      DECIMAL", StringComparison.Ordinal)
            < sql.IndexOf("@Modo               VARCHAR(10)", StringComparison.Ordinal),
            "Los parametros del modo deben ir despues de los de tipo de cambio.");
    }

    [Theory]
    [InlineData("50010")]
    [InlineData("50011")]
    [InlineData("50012")]
    [InlineData("50013")]
    [InlineData("50014")]
    [InlineData("50015")]
    [InlineData("50016")]
    [InlineData("50017")]
    [InlineData("50018")]
    [InlineData("50020")]
    [InlineData("50021")]
    [InlineData("50022")]
    [InlineData("50023")]
    public void ConservaLasValidacionesDeAlcanceYAgregaLasDelModo(string errorNumber) =>
        Assert.Contains($"THROW {errorNumber},", Script.Value);

    [Fact]
    public void LasDimensionesPermitidasSalenDeUnaListaBlanca()
    {
        var sql = Script.Value;

        foreach (var dimension in Dimensions)
        {
            Assert.Matches($@"\('{dimension}',\s+'[A-Za-z]+',", sql);
        }
    }

    [Fact]
    public void ElResumenReutilizaLosCandidatosConAlcance_YNoPagina()
    {
        var sql = Script.Value;
        var candidatos = sql.IndexOf("INTO #Candidatos", StringComparison.Ordinal);
        var alcance = sql.IndexOf("@AlcanceNivel = 'TOTAL'", candidatos, StringComparison.Ordinal);
        var rama = sql.IndexOf("IF @Modo = 'RESUMEN'", alcance, StringComparison.Ordinal);
        var paginar = sql.IndexOf("4. PAGINAR CANDIDATOS", StringComparison.Ordinal);

        Assert.True(candidatos > 0 && alcance > candidatos, "El alcance debe aplicarse al armar #Candidatos.");
        Assert.True(rama > alcance, "La rama RESUMEN debe ir despues de aplicar el alcance.");
        Assert.True(rama < paginar, "La rama RESUMEN debe cortar antes de paginar.");
        Assert.Contains("FROM #Candidatos c", RamaResumen());
    }

    [Fact]
    public void LaIdentidadDeFilaEsLaClavePrimariaCompletaDePlanilla_NoSoloElCorrelativo()
    {
        // Planilla.Correlativo se repite (77 correlativos, 155 filas): la PK real es
        // (IdProyecto, IdSite, IdTipoTrabajo, IdTarea, Correlativo, IdCliente). Con solo Correlativo el detalle y el
        // resumen no coincidian con el conteo independiente (3890 / 3897 / 3893 en setiembre 2026).
        var sql = Script.Value;

        foreach (var key in new[] { "KProyecto", "KSite", "KTipoTrabajo", "KTarea", "KCliente" })
        {
            Assert.Contains($"AS {key}", sql);          // se capturan al armar #Candidatos
        }

        // Todas las uniones a Planilla desde #Candidatos / #Pagina usan la clave completa.
        Assert.Matches(@"a\.Correlativo = c\.IdPlanilla\s+AND a\.IdProyecto = c\.KProyecto\s+AND a\.IdSite = c\.KSite\s+AND a\.IdTipoTrabajo = c\.KTipoTrabajo\s+AND a\.IdTarea = c\.KTarea\s+AND a\.IdCliente = c\.KCliente", sql);
        Assert.Matches(@"a\.Correlativo = pg\.IdPlanilla\s+AND a\.IdProyecto = pg\.KProyecto\s+AND a\.IdSite = pg\.KSite\s+AND a\.IdTipoTrabajo = pg\.KTipoTrabajo\s+AND a\.IdTarea = pg\.KTarea\s+AND a\.IdCliente = pg\.KCliente", sql);
        Assert.DoesNotMatch(@"GROUP BY\s+x\.IdPlanilla\s*;", sql);   // ya no se agrupa solo por Correlativo
    }

    [Fact]
    public void ElSqlDinamicoNoConcatenaTextoLibreDelUsuario()
    {
        var rama = RamaResumen();

        Assert.DoesNotMatch(
            @"\+\s*@(AgruparPor|TextoBusqueda|Cliente|Proyecto|Responsable|Solicitante|Site|Ot|Estados|AlcanceEmpleados|IdSite)\b",
            rama);
        // Solo se concatenan fragmentos construidos desde la lista blanca y constantes.
        Assert.Contains("@SelDims", rama);
        Assert.Contains("@GrpDims", rama);
        // Los valores variables viajan como parametros de sp_executesql.
        Assert.Contains("@pTop", rama);
        Assert.Contains("@pUsd", rama);
    }

    [Fact]
    public void LaMonedaSiempreFormaParteDelGrupo_YNoSeCalculanColumnasGlobales()
    {
        var rama = RamaResumen();

        Assert.Contains("AS [Moneda]", rama);
        Assert.Contains("SubtotalMonedaOriginal", rama);
        Assert.Contains("SubtotalSolesEquivalente", rama);

        foreach (var global in new[] { "SaldoOcSitio", "ConPagadoSoles", "TotalPagadoHistoricoSoles", "montoSitio", "pagSitio" })
        {
            Assert.DoesNotContain(global, rama);
        }
    }

    private static string RamaResumen()
    {
        var sql = Script.Value;
        var inicio = sql.IndexOf("3.1 MODO RESUMEN", StringComparison.Ordinal);
        var fin = sql.IndexOf("4. PAGINAR CANDIDATOS", StringComparison.Ordinal);

        Assert.True(inicio > 0 && fin > inicio, "No se encontro la rama RESUMEN en el script.");
        return sql[inicio..fin];
    }

    private static string LoadScript([System.Runtime.CompilerServices.CallerFilePath] string sourceFile = "")
    {
        var starts = new[] { AppContext.BaseDirectory, Path.GetDirectoryName(sourceFile) ?? string.Empty };

        foreach (var start in starts.Where(Directory.Exists))
        {
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "Database", "IaChat", "17_sp_IA_Planilla_Buscar_v3_ModoResumen.sql");
                if (File.Exists(candidate))
                {
                    return File.ReadAllText(candidate);
                }
            }
        }

        throw new FileNotFoundException("No se encontro Database/IaChat/17_sp_IA_Planilla_Buscar_v3_ModoResumen.sql");
    }
}
