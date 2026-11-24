using System.Data;
using System.Globalization;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

/// <summary>Carga del txt SIRE/SUNAT (registro de ventas) a dbo.CxcDocumentos sin duplicar (clave: CAR SUNAT).</summary>
public sealed class CxcCargaService : ICxcCargaService
{
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public CxcCargaService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    private sealed class Registro
    {
        public string CarSunat = string.Empty;
        public Dictionary<string, object?> P = new();
        public CxcCargaSireFilaDto Fila = new();
    }

    public async Task<CxcCargaSireResponseDto> CargarSireAsync(
        CxcCargaSireRequestDto request, string? usuario, CancellationToken cancellationToken = default)
    {
        var archivo = (request.NombreArchivo ?? string.Empty).Trim();
        var lineas = (request.Contenido ?? string.Empty)
            .Replace("\r\n", "\n").Replace('\r', '\n')
            .Split('\n')
            .Select((texto, i) => (texto, linea: i + 1))
            .Where(x => !string.IsNullOrWhiteSpace(x.texto))
            .ToList();

        if (lineas.Count < 2)
        {
            throw new InvalidOperationException("El archivo esta vacio o no tiene filas de datos.");
        }

        var cabecera = lineas[0].texto.TrimStart('﻿').Split('|').Select(NormalizarEncabezado).ToList();
        var idx = new Dictionary<string, int>();
        for (var i = 0; i < cabecera.Count; i++)
        {
            idx.TryAdd(cabecera[i], i);
        }

        if (!idx.ContainsKey("carsunat") && NormalizarEncabezado(lineas[0].texto).Contains("numeroconstancia"))
        {
            throw new InvalidOperationException("Este archivo parece ser de detracciones, no un registro SIRE. Cargelo en la pestana Detracciones.");
        }

        foreach (var obligatoria in new[] { "carsunat", "totalcp", "moneda", "fechadeemision" })
        {
            if (!idx.ContainsKey(obligatoria))
            {
                throw new InvalidOperationException($"El archivo no tiene el formato SIRE esperado (falta la columna '{obligatoria}').");
            }
        }

        string Txt(string[] c, string k) => idx.TryGetValue(k, out var p) && p < c.Length ? c[p].Trim() : string.Empty;
        decimal Dec(string[] c, string k) =>
            decimal.TryParse(Txt(c, k), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var v) ? v : 0m;
        decimal? DecN(string[] c, string k) => Txt(c, k).Length == 0 ? null : Dec(c, k);
        DateTime? Fec(string[] c, string k) =>
            DateTime.TryParseExact(Txt(c, k), new[] { "dd/MM/yyyy", "d/M/yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var v) ? v : null;
        static string? N(string s) => string.IsNullOrWhiteSpace(s) ? null : s;

        var registros = new List<Registro>();
        var vistos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (texto, linea) in lineas.Skip(1))
        {
            var c = texto.Split('|');
            var car = Txt(c, "carsunat");
            var fila = new CxcCargaSireFilaDto
            {
                Linea = linea,
                CarSunat = car,
                FechaEmision = Fec(c, "fechadeemision"),
                TipoCp = N(Txt(c, "tipocpdoc")),
                SerieCp = N(Txt(c, "seriedelcdp")),
                NroCp = N(Txt(c, "nrocpodocnroinicialrango")),
                NroDocIdentidad = N(Txt(c, "nrodocidentidad")),
                RazonSocialCliente = N(Txt(c, "apellidosnombresrazonsocial")),
                Moneda = N(Txt(c, "moneda")),
                TotalCp = Dec(c, "totalcp")
            };
            var reg = new Registro { CarSunat = car, Fila = fila };

            if (string.IsNullOrWhiteSpace(car) || car.Length > 40)
            {
                fila.Estado = "INVALIDO";
                fila.Motivo = "CAR SUNAT vacio o invalido.";
            }
            else if (fila.FechaEmision is null)
            {
                fila.Estado = "INVALIDO";
                fila.Motivo = "Fecha de emision invalida.";
            }
            else if (!vistos.Add(car))
            {
                fila.Estado = "REPETIDO_EN_ARCHIVO";
                fila.Motivo = "El CAR SUNAT ya aparece antes en este mismo archivo.";
            }
            else
            {
                fila.Estado = "NUEVO";
                reg.P = new Dictionary<string, object?>
                {
                    ["CarSunat"] = car,
                    ["RucEmisor"] = N(Txt(c, "ruc")),
                    ["RazonSocialEmisor"] = N(Txt(c, "razonsocial")),
                    ["Periodo"] = N(Txt(c, "periodo")),
                    ["FechaEmision"] = fila.FechaEmision,
                    ["FechaVencimiento"] = Fec(c, "fechavctopago"),
                    ["TipoCp"] = fila.TipoCp,
                    ["SerieCp"] = fila.SerieCp,
                    ["NroCp"] = fila.NroCp,
                    ["NroFinalRango"] = N(Txt(c, "nrofinalrango")),
                    ["TipoDocIdentidad"] = N(Txt(c, "tipodocidentidad")),
                    ["NroDocIdentidad"] = fila.NroDocIdentidad,
                    ["RazonSocialCliente"] = fila.RazonSocialCliente,
                    ["ValorFacturadoExportacion"] = Dec(c, "valorfacturadoexportacion"),
                    ["BiGravada"] = Dec(c, "bigravada"),
                    ["DsctoBi"] = Dec(c, "dsctobi"),
                    ["Igv"] = Dec(c, "igvipm"),
                    ["DsctoIgv"] = Dec(c, "dsctoigvipm"),
                    ["MtoExonerado"] = Dec(c, "mtoexonerado"),
                    ["MtoInafecto"] = Dec(c, "mtoinafecto"),
                    ["Isc"] = Dec(c, "isc"),
                    ["BiGravIvap"] = Dec(c, "bigravivap"),
                    ["Ivap"] = Dec(c, "ivap"),
                    ["Icbper"] = Dec(c, "icbper"),
                    ["OtrosTributos"] = Dec(c, "otrostributos"),
                    ["TotalCp"] = fila.TotalCp,
                    ["Moneda"] = fila.Moneda,
                    ["TipoCambio"] = DecN(c, "tipocambio"),
                    ["FechaEmisionDocModificado"] = Fec(c, "fechaemisiondocmodificado"),
                    ["TipoCpModificado"] = N(Txt(c, "tipocpmodificado")),
                    ["SerieCpModificado"] = N(Txt(c, "seriecpmodificado")),
                    ["NroCpModificado"] = N(Txt(c, "nrocpmodificado")),
                    ["IdProyectoOperadores"] = N(Txt(c, "idproyectooperadoresatribucion")),
                    ["TipoNota"] = N(Txt(c, "tipodenota")),
                    ["EstadoComprobante"] = N(Txt(c, "estcomp")),
                    ["ValorFobEmbarcado"] = DecN(c, "valorfobembarcado"),
                    ["ValorOpGratuitas"] = DecN(c, "valoropgratuitas"),
                    ["TipoOperacion"] = N(Txt(c, "tipooperacion")),
                    ["DamCp"] = N(Txt(c, "damcp")),
                    ["Clu"] = N(Txt(c, "clu")),
                    ["ArchivoOrigen"] = N(archivo),
                    ["UsuarioCarga"] = usuario
                };
            }

            registros.Add(reg);
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        // Control de duplicados contra la base (CAR SUNAT ya cargado).
        var candidatos = registros.Where(r => r.Fila.Estado == "NUEVO").Select(r => r.CarSunat).ToList();
        var existentes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var lote in candidatos.Chunk(1000))
        {
            var encontrados = await connection.QueryAsync<string>(_sqlCommandFactory.Create(
                "SELECT CarSunat FROM dbo.CxcDocumentos WHERE CarSunat IN @Cars;",
                new { Cars = lote }, CommandType.Text, cancellationToken));
            foreach (var e in encontrados)
            {
                existentes.Add(e);
            }
        }

        foreach (var r in registros.Where(r => r.Fila.Estado == "NUEVO" && existentes.Contains(r.CarSunat)))
        {
            r.Fila.Estado = "YA_EXISTE";
            r.Fila.Motivo = "Ya fue cargado anteriormente.";
        }

        var response = new CxcCargaSireResponseDto
        {
            SoloAnalizar = request.SoloAnalizar,
            TotalFilas = registros.Count,
            Nuevos = registros.Count(r => r.Fila.Estado == "NUEVO"),
            YaExisten = registros.Count(r => r.Fila.Estado == "YA_EXISTE"),
            RepetidosEnArchivo = registros.Count(r => r.Fila.Estado == "REPETIDO_EN_ARCHIVO"),
            Invalidos = registros.Count(r => r.Fila.Estado == "INVALIDO"),
            Filas = registros.Select(r => r.Fila).ToList()
        };

        if (!request.SoloAnalizar && response.Nuevos > 0)
        {
            const string insertSql = @"
INSERT INTO dbo.CxcDocumentos
(CarSunat, RucEmisor, RazonSocialEmisor, Periodo, FechaEmision, FechaVencimiento, TipoCp, SerieCp, NroCp, NroFinalRango,
 TipoDocIdentidad, NroDocIdentidad, RazonSocialCliente, ValorFacturadoExportacion, BiGravada, DsctoBi, Igv, DsctoIgv,
 MtoExonerado, MtoInafecto, Isc, BiGravIvap, Ivap, Icbper, OtrosTributos, TotalCp, Moneda, TipoCambio,
 FechaEmisionDocModificado, TipoCpModificado, SerieCpModificado, NroCpModificado, IdProyectoOperadores, TipoNota,
 EstadoComprobante, ValorFobEmbarcado, ValorOpGratuitas, TipoOperacion, DamCp, Clu, ArchivoOrigen, UsuarioCarga)
SELECT @CarSunat, @RucEmisor, @RazonSocialEmisor, @Periodo, @FechaEmision, @FechaVencimiento, @TipoCp, @SerieCp, @NroCp, @NroFinalRango,
 @TipoDocIdentidad, @NroDocIdentidad, @RazonSocialCliente, @ValorFacturadoExportacion, @BiGravada, @DsctoBi, @Igv, @DsctoIgv,
 @MtoExonerado, @MtoInafecto, @Isc, @BiGravIvap, @Ivap, @Icbper, @OtrosTributos, @TotalCp, @Moneda, @TipoCambio,
 @FechaEmisionDocModificado, @TipoCpModificado, @SerieCpModificado, @NroCpModificado, @IdProyectoOperadores, @TipoNota,
 @EstadoComprobante, @ValorFobEmbarcado, @ValorOpGratuitas, @TipoOperacion, @DamCp, @Clu, @ArchivoOrigen, @UsuarioCarga
WHERE NOT EXISTS (SELECT 1 FROM dbo.CxcDocumentos WHERE CarSunat = @CarSunat);";

            await using var tx = await connection.BeginTransactionAsync(cancellationToken);
            var insertados = 0;
            foreach (var r in registros.Where(r => r.Fila.Estado == "NUEVO"))
            {
                var cmd = new CommandDefinition(insertSql, new DynamicParameters(r.P), tx, cancellationToken: cancellationToken);
                insertados += await connection.ExecuteAsync(cmd);
            }

            await tx.CommitAsync(cancellationToken);

            // Enlaza detracciones que estaban esperando su factura (si la tabla de detracciones aun no existe, se ignora).
            try
            {
                await connection.ExecuteAsync(new CommandDefinition(CxcDetraccionesService.RelinkSql, cancellationToken: cancellationToken));
            }
            catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 208)
            {
            }

            response.Insertados = insertados;
            response.Grabado = true;
            // Si por concurrencia alguno ya existia, no se inserto: se informa la diferencia.
            response.YaExisten += response.Nuevos - insertados;
            response.Nuevos = insertados;
        }

        response.Mensaje = request.SoloAnalizar
            ? $"Analisis: {response.Nuevos} nuevo(s), {response.YaExisten} ya existente(s), {response.RepetidosEnArchivo} repetido(s) en el archivo, {response.Invalidos} invalido(s). No se grabo nada."
            : $"Carga: {response.Insertados} registro(s) insertado(s). {response.YaExisten} omitido(s) por ya existir, {response.RepetidosEnArchivo} repetido(s) en el archivo, {response.Invalidos} invalido(s).";
        return response;
    }

    public async Task<List<CxcDocumentoDto>> ListarDocumentosAsync(string? periodo, CancellationToken cancellationToken = default)
    {
        const string sql = @"
SELECT IdDocumento, CarSunat, Periodo, FechaEmision, FechaVencimiento, TipoCp, SerieCp, NroCp, NroDocIdentidad,
       RazonSocialCliente, TotalCp, Moneda, TipoCambio, ArchivoOrigen, FechaCarga, UsuarioCarga
FROM dbo.CxcDocumentos
WHERE IdActivo = 1 AND (@Periodo IS NULL OR Periodo = @Periodo)
ORDER BY FechaEmision DESC, SerieCp, NroCp DESC;";

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var rows = await connection.QueryAsync<CxcDocumentoDto>(_sqlCommandFactory.Create(
            sql, new { Periodo = string.IsNullOrWhiteSpace(periodo) ? null : periodo.Trim() }, CommandType.Text, cancellationToken));
        return rows.ToList();
    }

    private static string NormalizarEncabezado(string value)
    {
        var sb = new StringBuilder();
        foreach (var ch in value.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(ch))
            {
                sb.Append(char.ToLowerInvariant(ch));
            }
        }

        return sb.ToString();
    }
}
