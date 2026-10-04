using System.Text.RegularExpressions;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS ESTATICAS sobre el texto de 16_sp_IA_Planilla_Buscar_v2_ColumnasAnalisis.sql. Verifican que la
/// version 2 conserva el contrato de alcance de la Fase 2 y que las columnas globales nuevas salen en NULL
/// sin el permiso. NO ejecutan T-SQL: que el script compile y se comporte bien contra SQL Server es una
/// prueba de INTEGRACION REAL pendiente (parte A/B de Aceptacion_SP_Alcance_Dev.sql).
/// </summary>
[Trait("Category", "Static")]
public sealed class IaScopedSpV2ScriptContractTests
{
    private static readonly Lazy<string> Script = new(() => LoadScript());

    [Fact]
    public void EsUnCreateOrAlterDelMismoProcedimiento_SinDdlNiDmlSobreTablas()
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
    public void ConservaLasValidacionesDeAlcanceDeLaFase2(string errorNumber) =>
        Assert.Contains($"THROW {errorNumber},", Script.Value);

    [Fact]
    public void LosParametrosDeTipoDeCambioSonOpcionalesYVanDespuesDelAlcance()
    {
        var sql = Script.Value;

        Assert.Matches(@"@TipoCambio\s+DECIMAL\(18, 6\)\s*=\s*NULL", sql);
        foreach (var moneda in new[] { "USD", "EUR", "DOP", "COP" })
        {
            Assert.Matches($@"@TipoCambio{moneda}\s+DECIMAL\(18, 6\)\s*=\s*NULL", sql);
        }

        Assert.True(
            sql.IndexOf("@VerTotalesGlobales BIT = NULL", StringComparison.Ordinal)
            < sql.IndexOf("@TipoCambioUSD      DECIMAL", StringComparison.Ordinal),
            "Los parametros de tipo de cambio deben ir al final de la lista.");
    }

    [Fact]
    public void LosValoresPorDefectoDelTipoDeCambioSonLosDecididosPorNegocio()
    {
        var sql = Script.Value;

        Assert.Contains("SET @TipoCambioUSD = COALESCE(@TipoCambioUSD, 3.50);", sql);
        Assert.Contains("SET @TipoCambioEUR = COALESCE(@TipoCambioEUR, 3.80);", sql);
        Assert.Contains("SET @TipoCambioDOP = COALESCE(@TipoCambioDOP, 0.057);", sql);
        Assert.Contains("SET @TipoCambioCOP = COALESCE(@TipoCambioCOP, 0.0010);", sql);
    }

    [Fact]
    public void TodasLasColumnasGlobalesSeAnulanSinElPermiso()
    {
        var sql = Script.Value;

        foreach (var name in IaGlobalColumns.Names)
        {
            // Cada columna global debe salir como "CASE WHEN @VerTotalesGlobales = 1 THEN ... END AS <Nombre>".
            var pattern = $@"CASE\s+WHEN\s+@VerTotalesGlobales\s*=\s*1\s+THEN[\s\S]{{0,900}}?END\s+AS\s+{name}\b";
            Assert.True(Regex.IsMatch(sql, pattern), $"La columna global {name} no esta protegida por @VerTotalesGlobales = 1.");
        }
    }

    [Fact]
    public void IncluyeCuentaCuentaInterYRuc_PeroNoFiltrosPorCargoOEmpleadoDelCliente()
    {
        // Se ignoran los comentarios: la cabecera menciona estos nombres para explicar su alcance.
        var sql = Regex.Replace(Regex.Replace(Script.Value, @"/\*[\s\S]*?\*/", string.Empty), @"--[^\r\n]*", string.Empty);

        Assert.Matches(@"ctaEmp\.Cuenta\s*,", sql);
        Assert.Matches(@"ctaEmp\.CuentaInter\s*,", sql);
        Assert.Matches(@"\bAS\s+RUC\b", sql);
        Assert.DoesNotContain("@IdCargo", sql);
        Assert.DoesNotContain("@IdEmpleado ", sql);
        Assert.DoesNotContain("'PERMISOS'", sql);
    }

    [Fact]
    public void ElAlcanceSigueAplicandoseAntesDelConteoYLaPaginacion()
    {
        var sql = Script.Value;

        Assert.True(
            sql.IndexOf("@AlcanceNivel = 'TOTAL'", StringComparison.Ordinal)
            < sql.IndexOf("COUNT(*) OVER() AS TotalRegistros", StringComparison.Ordinal),
            "El alcance debe filtrarse en #Candidatos, antes de contar y paginar.");
    }

    private static string LoadScript([System.Runtime.CompilerServices.CallerFilePath] string sourceFile = "")
    {
        var starts = new[] { AppContext.BaseDirectory, Path.GetDirectoryName(sourceFile) ?? string.Empty };

        foreach (var start in starts.Where(Directory.Exists))
        {
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "Database", "IaChat", "16_sp_IA_Planilla_Buscar_v2_ColumnasAnalisis.sql");
                if (File.Exists(candidate))
                {
                    return File.ReadAllText(candidate);
                }
            }
        }

        throw new FileNotFoundException("No se encontro Database/IaChat/16_sp_IA_Planilla_Buscar_v2_ColumnasAnalisis.sql");
    }
}
