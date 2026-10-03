using System.Text.RegularExpressions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS ESTATICAS sobre el texto de 02_sp_IA_Planilla_Buscar_Alcance.sql. Verifican que el script
/// propuesto conserva su contrato (validaciones, orden alcance-antes-de-conteo, 15 columnas globales,
/// sin DDL de tablas). NO ejecutan T-SQL: que el script compile y se comporte bien contra SQL Server
/// es una prueba de INTEGRACION REAL pendiente (ver anexo del plan).
/// </summary>
[Trait("Category", "Static")]
public sealed class IaScopedSpScriptContractTests
{
    private static readonly string[] GlobalColumns =
    [
        "Ventas", "TotalPagadoHistoricoSoles", "ConPagadoSoles", "ConPagadoMonedaRegistro", "ConPagado",
        "SaldoOcSitio", "SubOc", "SubPlanilla", "SubPlanillaConRegistroActual", "PorcentajeSubPlanilla",
        "AdelaFic", "DiferenciaFic", "CodigoValidacionFic", "ResultadoValidacionFic", "PorcentajeFic"
    ];

    private static readonly Lazy<string> Script = new(() => LoadScript());

    [Fact]
    public void EsUnCreateOrAlterDelMismoProcedimiento_SinDdlDeTablas()
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
    public void LosParametrosDeAlcanceSonNuevosYSinDefaultUtilizable()
    {
        var sql = Script.Value;

        Assert.Matches(@"@AlcanceNivel\s+VARCHAR\(12\)\s*=\s*NULL", sql);
        Assert.Matches(@"@AlcanceCampos\s+VARCHAR\(2\)\s*=\s*NULL", sql);
        Assert.Matches(@"@AlcanceEmpleados\s+NVARCHAR\(MAX\)\s*=\s*NULL", sql);
        Assert.Matches(@"@VerTotalesGlobales\s+BIT\s*=\s*NULL", sql);
        Assert.True(
            sql.IndexOf("@TipoCambio         DECIMAL(18, 6) = 3.80,", StringComparison.Ordinal)
            < sql.IndexOf("@AlcanceNivel       VARCHAR(12)", StringComparison.Ordinal),
            "Los parametros nuevos deben ir al final de la lista.");
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
    public void RechazaAlcanceAusenteOInvalido_ConErrorPropio(string errorNumber) =>
        Assert.Contains($"THROW {errorNumber},", Script.Value);

    [Fact]
    public void ValidaEstrictamenteLaListaDeIdentificadores()
    {
        var sql = Script.Value;

        Assert.Contains("LIKE N'%[^0-9,]%'", sql);                       // solo digitos y comas
        Assert.Contains("LEN(s.value) = 0 OR LEN(s.value) > 9", sql);   // sin vacios ni desbordes de INT
        Assert.Contains("CONVERT(INT, s.value) > 0", sql);              // positivos
        Assert.Contains("> 500", sql);                                   // tope
        Assert.Contains("@AlcanceNivel NOT IN ('TOTAL', 'RESTRINGIDO')", sql);
        Assert.Contains("@AlcanceCampos NOT IN ('R', 'S', 'RS')", sql);
    }

    [Fact]
    public void LaValidacionDeAlcanceOcurreAntesDelBloqueTry_YAntesDeCualquierConsulta()
    {
        var sql = Script.Value;
        var firstThrow = sql.IndexOf("THROW 50010,", StringComparison.Ordinal);
        var tryBlock = sql.IndexOf("BEGIN TRY", StringComparison.Ordinal);
        var firstFromPlanilla = sql.IndexOf("FROM dbo.Planilla", StringComparison.Ordinal);

        Assert.True(firstThrow > 0);
        Assert.True(firstThrow < tryBlock, "Los errores de alcance no deben pasar por el CATCH que los re-etiqueta como 50001.");
        Assert.True(tryBlock < firstFromPlanilla);
    }

    [Fact]
    public void ElAlcanceSeAplicaAntesDelConteoYLaPaginacion()
    {
        var sql = Script.Value;
        var candidatosStart = sql.IndexOf("CREATE TABLE #Candidatos", StringComparison.Ordinal);
        var scopeFilter = sql.IndexOf("ALCANCE (obligatorio)", StringComparison.Ordinal);
        var paginaStart = sql.IndexOf("CREATE TABLE #Pagina", StringComparison.Ordinal);
        var countOver = sql.IndexOf("COUNT(*) OVER()", paginaStart, StringComparison.Ordinal);
        var rowNumber = sql.IndexOf("ROW_NUMBER() OVER", paginaStart, StringComparison.Ordinal);

        Assert.True(candidatosStart < scopeFilter);
        Assert.True(scopeFilter < paginaStart, "El filtro debe vivir en #Candidatos.");
        Assert.True(scopeFilter < countOver);
        Assert.True(scopeFilter < rowNumber);
        Assert.Single(Regex.Matches(sql, @"ALCANCE \(obligatorio\)"));
    }

    [Fact]
    public void LaPertenenciaUsaIdentificadoresCorporativos_NoNombres()
    {
        var sql = Script.Value;

        Assert.Contains("ai.IdEmpleadoCj = emp.IdEmpleadoCj", sql);
        Assert.Contains("THEN m_cj.IdEmpleado", sql);
        Assert.Contains("m_emp.IdEmpleadoCj", sql);
        Assert.Contains("@AlcanceCampos IN ('R', 'RS')", sql);
        Assert.Contains("@AlcanceCampos IN ('S', 'RS')", sql);
    }

    [Fact]
    public void LasQuinceColumnasGlobales_DevuelvenNullSinElPermiso()
    {
        var sql = Script.Value;

        Assert.Equal(GlobalColumns.Length, Regex.Matches(sql, @"CASE WHEN @VerTotalesGlobales = 1").Count);

        foreach (var column in GlobalColumns)
        {
            // Cada columna global debe cerrar un CASE WHEN @VerTotalesGlobales = 1 ... END AS <columna>
            var pattern = $@"CASE WHEN @VerTotalesGlobales = 1(?:(?!CASE WHEN @VerTotalesGlobales = 1)[\s\S])*?END AS {column}\b";
            Assert.True(Regex.IsMatch(sql, pattern), $"La columna global {column} no esta protegida por @VerTotalesGlobales.");
        }

        // No deben quedar proteccion con ELSE 0 (hay que devolver NULL, no cero).
        Assert.DoesNotMatch(@"CASE WHEN @VerTotalesGlobales = 1[\s\S]{0,400}?ELSE\s+0\s+END\s+AS\s+(Ventas|SubOc|SubPlanilla|SaldoOcSitio)\b", sql);
    }

    // OJO: esta prueba SOLO verifica que el TEXTO del script lleva la condicion en los 4 bloques globales.
    // NO demuestra que SQL Server deje de ejecutarlos: eso requiere ejecucion y plan de ejecucion reales
    // (prueba de integracion pendiente). La proteccion de datos descansa en los CASE del SELECT final.
    [Fact]
    public void LosCuatroBloquesGlobales_LlevanLaCondicionDePermiso_EnElTexto()
    {
        var sql = Script.Value;

        Assert.Equal(4, Regex.Matches(sql, @"(?m)^\s*WHERE @VerTotalesGlobales = 1\s*$").Count);
        Assert.Matches(@"FROM dbo\.Importar i\s+WHERE @VerTotalesGlobales = 1", sql);
        Assert.Matches(@"FROM dbo\.Planilla p\s+WHERE @VerTotalesGlobales = 1", sql);
        Assert.Matches(@"FROM dbo\.Planilla pla\s+WHERE @VerTotalesGlobales = 1", sql);
        Assert.Matches(@"LEFT JOIN dbo\.cabOrdenCompra doc\s+ON doc\.IdOc = det\.IdOc\s+WHERE @VerTotalesGlobales = 1", sql);
    }

    [Fact]
    public void ConservaLosCalculosExistentes_CuandoElPermisoEstaConcedido()
    {
        var sql = Script.Value;

        // Fragmentos clave de la definicion vigente que no deben haberse alterado.
        Assert.Contains("ISNULL(a.Subtotal, 0) * @TipoCambio", sql);
        Assert.Contains("ISNULL(det.PrecioUnitario, 0) * ISNULL(det.Cantidad, 0)", sql);
        Assert.Contains("p.Estado = 4", sql);
        Assert.Contains("pla.Estado = 4", sql);
        Assert.Contains("@IncluirEstado99 = 1", sql);
        Assert.Contains("det.IdEstado NOT IN (3)", sql);
        Assert.Contains("i.idestado=1", sql);
        Assert.Contains("'MAYOR_A_CERO'", sql);
        Assert.Contains("'MENOR_A_CERO'", sql);
        Assert.Contains("'IGUAL_A_CERO'", sql);
        Assert.Contains("OPTION (RECOMPILE);", sql);
        Assert.Contains("THROW 50001, @MensajeError, 1;", sql);
        Assert.Contains("@TipoCambio         DECIMAL(18, 6) = 3.80", sql);
    }

    private static string LoadScript([System.Runtime.CompilerServices.CallerFilePath] string sourceFile = "")
    {
        // Parte del directorio de salida (bin/...) y, si el build se hizo con -o fuera del repo,
        // del directorio del archivo fuente (ruta fijada al compilar).
        var starts = new[] { AppContext.BaseDirectory, Path.GetDirectoryName(sourceFile) ?? string.Empty };

        foreach (var start in starts.Where(Directory.Exists))
        {
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "Database", "IaChat", "02_sp_IA_Planilla_Buscar_Alcance.sql");
                if (File.Exists(candidate))
                {
                    return File.ReadAllText(candidate);
                }
            }
        }

        throw new FileNotFoundException("No se encontro Database/IaChat/02_sp_IA_Planilla_Buscar_Alcance.sql");
    }
}
