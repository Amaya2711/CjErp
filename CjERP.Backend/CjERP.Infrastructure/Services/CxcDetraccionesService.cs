using System.Data;
using System.Globalization;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Carga del csv de detracciones SUNAT a dbo.CxcDetracciones sin duplicar (clave: Numero Constancia).
/// Solo se guardan las RECIBIDAS (proveedor = CJ TELECOM); las EMITIDAS son compras y se omiten.
/// </summary>
public sealed class CxcDetraccionesService : ICxcDetraccionesService
{
    private const string RucCj = "20505958111";
    private const string AvisoDuplicado = "Posible deposito duplicado: hay mas de una constancia para el mismo comprobante. Por confirmar por el area.";

    /// <summary>Enlaza detracciones sin comprobante con el SIRE (RUC cliente + tipo + serie + numero sin ceros).</summary>
    internal const string RelinkSql = @"
UPDATE t SET t.IdDocumento = d.IdDocumento
FROM dbo.CxcDetracciones t
JOIN dbo.CxcDocumentos d
  ON d.IdActivo = 1
 AND d.NroDocIdentidad = t.NroDocAdquiriente
 AND d.TipoCp = t.TipoComprobante
 AND d.SerieCp = t.SerieComprobante
 AND SUBSTRING(d.NroCp, PATINDEX('%[^0]%', d.NroCp + '.'), 20) = SUBSTRING(t.NumeroComprobante, PATINDEX('%[^0]%', t.NumeroComprobante + '.'), 20)
WHERE t.IdDetraccion IS NOT NULL AND t.IdDocumento IS NULL;";

    private readonly ISqlCommandFactory _sqlCommandFactory;

    public CxcDetraccionesService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    private sealed class Registro
    {
        public CxcCargaDetraccionFilaDto Fila = new();
        public Dictionary<string, object?> P = new();
        public string KeyComprobante = string.Empty;
    }

    private sealed class ExistenteRow
    {
        public string NumeroConstancia { get; set; } = string.Empty;
        public string? NroDocAdquiriente { get; set; }
        public string? TipoComprobante { get; set; }
        public string? SerieComprobante { get; set; }
        public string? NumeroComprobante { get; set; }
    }

    private sealed class DocRow
    {
        public string? NroDocIdentidad { get; set; }
        public string? TipoCp { get; set; }
        public string? SerieCp { get; set; }
        public string? NroCp { get; set; }
    }

    public async Task<CxcCargaDetraccionesResponseDto> CargarAsync(
        CxcCargaDetraccionesRequestDto request, string? usuario, CancellationToken cancellationToken = default)
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

        var encabezadoTexto = lineas[0].texto.TrimStart('﻿');
        // El archivo puede venir separado por comas (descarga SUNAT) o por tabuladores (resultado ya trabajado en Excel).
        var separador = encabezadoTexto.Contains('\t') ? '\t' : ',';
        var cabecera = SplitCsv(encabezadoTexto, separador).Select(NormalizarEncabezado).ToList();
        var idx = new Dictionary<string, int>();
        for (var i = 0; i < cabecera.Count; i++)
        {
            idx.TryAdd(cabecera[i], i);
        }

        // Cabeceras abreviadas del formato trabajado -> nombre estandar.
        var alias = new Dictionary<string, string>
        {
            ["tdadq"] = "tipodedocumentoadquiriente",
            ["rucadquiriente"] = "numerodedocumentoadquiriente",
            ["razonsocialdeladquiriente"] = "nombrerazonsocialdeladquiriente",
            ["top"] = "tipooperacion",
            ["tcpe"] = "tipodecomprobante",
            ["seriecpe"] = "seriedecomprobante",
            ["numerocpe"] = "numerodecomprobante",
            ["pagodet"] = "numerodepagodedetracciones"
        };
        foreach (var (corto, estandar) in alias)
        {
            if (idx.TryGetValue(corto, out var pos))
            {
                idx.TryAdd(estandar, pos);
            }
        }

        if (!idx.ContainsKey("numeroconstancia") && NormalizarEncabezado(encabezadoTexto).Contains("carsunat"))
        {
            throw new InvalidOperationException("Este archivo parece ser un registro SIRE (comprobantes), no un archivo de detracciones. Cargelo en la pestana SIRE.");
        }

        foreach (var obligatoria in new[] { "numeroconstancia", "rucproveedor", "montodeposito", "fechapago" })
        {
            if (!idx.ContainsKey(obligatoria))
            {
                throw new InvalidOperationException($"El archivo no tiene el formato de detracciones esperado (falta la columna '{obligatoria}').");
            }
        }

        string Txt(string[] c, string k) => idx.TryGetValue(k, out var p) && p < c.Length ? c[p].Trim() : string.Empty;
        DateTime? Fec(string[] c, string k) =>
            DateTime.TryParseExact(Txt(c, k), new[] { "dd/MM/yyyy", "d/M/yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var v) ? v : null;
        static string? N(string s, int max) => string.IsNullOrWhiteSpace(s) ? null : (s.Length > max ? s[..max] : s);

        var registros = new List<Registro>();
        var vistos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (texto, linea) in lineas.Skip(1))
        {
            var c = SplitCsv(texto, separador);
            var constancia = Txt(c, "numeroconstancia");
            var rucProveedor = Txt(c, "rucproveedor");
            // El SIRE guarda el tipo con 2 digitos ("01"); algunos archivos traen "1".
            var tipoComp = N(Txt(c, "tipodecomprobante"), 5);
            if (tipoComp is { Length: 1 } && char.IsDigit(tipoComp[0]))
            {
                tipoComp = "0" + tipoComp;
            }

            var serie = N(Txt(c, "seriedecomprobante").ToUpperInvariant(), 10);
            var numero = N(Txt(c, "numerodecomprobante"), 20);
            var rucCliente = N(Txt(c, "numerodedocumentoadquiriente"), 15);
            var montoOk = decimal.TryParse(Txt(c, "montodeposito"), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var monto);

            var fila = new CxcCargaDetraccionFilaDto
            {
                Linea = linea,
                NumeroConstancia = constancia,
                FechaPago = Fec(c, "fechapago"),
                MontoDeposito = monto,
                RucCliente = rucCliente,
                Cliente = N(Txt(c, "nombrerazonsocialdeladquiriente"), 200),
                TipoComprobante = tipoComp,
                SerieComprobante = serie,
                NumeroComprobante = numero,
                NumeroCuenta = N(Txt(c, "numerodecuenta"), 30)
            };
            var reg = new Registro { Fila = fila, KeyComprobante = ClaveComprobante(rucCliente, tipoComp, serie, numero) };

            if (!string.Equals(rucProveedor, RucCj, StringComparison.Ordinal))
            {
                fila.Estado = "OMITIDO_COMPRA";
                fila.Motivo = "Detraccion emitida por CJ a un proveedor (compras): no se carga.";
            }
            else if (string.IsNullOrWhiteSpace(constancia) || constancia.Length > 30)
            {
                fila.Estado = "INVALIDO";
                fila.Motivo = "Numero de constancia vacio o invalido.";
            }
            else if (!montoOk || fila.FechaPago is null)
            {
                fila.Estado = "INVALIDO";
                fila.Motivo = "Monto o fecha de pago invalidos.";
            }
            else if (!vistos.Add(constancia))
            {
                fila.Estado = "REPETIDO_EN_ARCHIVO";
                fila.Motivo = "La constancia ya aparece antes en este mismo archivo.";
            }
            else
            {
                fila.Estado = "NUEVO";
                reg.P = new Dictionary<string, object?>
                {
                    ["NumeroConstancia"] = constancia,
                    ["TipoCuenta"] = N(Txt(c, "tipodecuenta"), 80),
                    ["NumeroCuenta"] = fila.NumeroCuenta,
                    ["FechaPago"] = fila.FechaPago,
                    ["MontoDeposito"] = monto,
                    ["NumeroPagoDetracciones"] = N(Txt(c, "numerodepagodedetracciones"), 30),
                    ["RucProveedor"] = N(rucProveedor, 15),
                    ["NombreProveedor"] = N(Txt(c, "nombreproveedor"), 200),
                    ["TipoDocAdquiriente"] = N(Txt(c, "tipodedocumentoadquiriente"), 5),
                    ["NroDocAdquiriente"] = rucCliente,
                    ["NombreAdquiriente"] = fila.Cliente,
                    ["PeriodoTributario"] = N(Txt(c, "periodotributario"), 6),
                    ["TipoComprobante"] = tipoComp,
                    ["SerieComprobante"] = serie,
                    ["NumeroComprobante"] = numero,
                    ["TipoBien"] = N(Txt(c, "tipobien"), 5),
                    ["TipoOperacion"] = N(Txt(c, "tipooperacion"), 5),
                    ["ArchivoOrigen"] = N(archivo, 260),
                    ["UsuarioCarga"] = N(usuario ?? string.Empty, 100)
                };
            }

            registros.Add(reg);
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        // Duplicados contra la base (constancia ya cargada).
        var candidatos = registros.Where(r => r.Fila.Estado == "NUEVO").Select(r => r.Fila.NumeroConstancia).ToList();
        var existentesConstancia = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var lote in candidatos.Chunk(1000))
        {
            var encontrados = await connection.QueryAsync<string>(_sqlCommandFactory.Create(
                "SELECT NumeroConstancia FROM dbo.CxcDetracciones WHERE NumeroConstancia IN @Nros;",
                new { Nros = lote }, CommandType.Text, cancellationToken));
            foreach (var e in encontrados)
            {
                existentesConstancia.Add(e);
            }
        }

        foreach (var r in registros.Where(r => r.Fila.Estado == "NUEVO" && existentesConstancia.Contains(r.Fila.NumeroConstancia)))
        {
            r.Fila.Estado = "YA_EXISTE";
            r.Fila.Motivo = "Ya fue cargada anteriormente.";
        }

        var nuevos = registros.Where(r => r.Fila.Estado == "NUEVO").ToList();
        var rucsCliente = nuevos.Select(r => r.Fila.RucCliente).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().Select(x => x!).ToList();

        // Aviso: comprobante con mas de una constancia (en la base o dentro de este archivo).
        var constanciasPorComprobante = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var lote in rucsCliente.Chunk(1000))
        {
            var filas = await connection.QueryAsync<ExistenteRow>(_sqlCommandFactory.Create(
                @"SELECT NumeroConstancia, NroDocAdquiriente, TipoComprobante, SerieComprobante, NumeroComprobante
                  FROM dbo.CxcDetracciones WHERE IdActivo = 1 AND NroDocAdquiriente IN @Rucs;",
                new { Rucs = lote }, CommandType.Text, cancellationToken));
            foreach (var f in filas)
            {
                Agregar(constanciasPorComprobante, ClaveComprobante(f.NroDocAdquiriente, f.TipoComprobante, f.SerieComprobante, f.NumeroComprobante), f.NumeroConstancia);
            }
        }

        foreach (var r in nuevos)
        {
            Agregar(constanciasPorComprobante, r.KeyComprobante, r.Fila.NumeroConstancia);
        }

        // Aviso: factura aun no cargada en el SIRE.
        var docs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var lote in rucsCliente.Chunk(1000))
        {
            var filas = await connection.QueryAsync<DocRow>(_sqlCommandFactory.Create(
                "SELECT NroDocIdentidad, TipoCp, SerieCp, NroCp FROM dbo.CxcDocumentos WHERE IdActivo = 1 AND NroDocIdentidad IN @Rucs;",
                new { Rucs = lote }, CommandType.Text, cancellationToken));
            foreach (var d in filas)
            {
                docs.Add(ClaveComprobante(d.NroDocIdentidad, d.TipoCp, d.SerieCp, d.NroCp));
            }
        }

        foreach (var r in nuevos)
        {
            var avisos = new List<string>();
            r.Fila.FacturaEnSire = docs.Contains(r.KeyComprobante);
            if (!r.Fila.FacturaEnSire)
            {
                avisos.Add("Sin factura en el SIRE (aun no cargada).");
            }

            if (constanciasPorComprobante.TryGetValue(r.KeyComprobante, out var set) && set.Count > 1)
            {
                avisos.Add(AvisoDuplicado);
            }

            r.Fila.Aviso = avisos.Count == 0 ? null : string.Join(" ", avisos);
        }

        var response = new CxcCargaDetraccionesResponseDto
        {
            SoloAnalizar = request.SoloAnalizar,
            TotalFilas = registros.Count,
            Nuevos = nuevos.Count,
            YaExisten = registros.Count(r => r.Fila.Estado == "YA_EXISTE"),
            RepetidosEnArchivo = registros.Count(r => r.Fila.Estado == "REPETIDO_EN_ARCHIVO"),
            Invalidos = registros.Count(r => r.Fila.Estado == "INVALIDO"),
            OmitidosCompra = registros.Count(r => r.Fila.Estado == "OMITIDO_COMPRA"),
            SinFacturaSire = nuevos.Count(r => !r.Fila.FacturaEnSire),
            PosiblesDuplicados = nuevos.Count(r => r.Fila.Aviso?.Contains("duplicado", StringComparison.OrdinalIgnoreCase) == true),
            Filas = registros.Select(r => r.Fila).ToList()
        };

        if (!request.SoloAnalizar && response.Nuevos > 0)
        {
            const string insertSql = @"
INSERT INTO dbo.CxcDetracciones
(NumeroConstancia, TipoCuenta, NumeroCuenta, FechaPago, MontoDeposito, NumeroPagoDetracciones, RucProveedor, NombreProveedor,
 TipoDocAdquiriente, NroDocAdquiriente, NombreAdquiriente, PeriodoTributario, TipoComprobante, SerieComprobante, NumeroComprobante,
 TipoBien, TipoOperacion, ArchivoOrigen, UsuarioCarga)
SELECT @NumeroConstancia, @TipoCuenta, @NumeroCuenta, @FechaPago, @MontoDeposito, @NumeroPagoDetracciones, @RucProveedor, @NombreProveedor,
 @TipoDocAdquiriente, @NroDocAdquiriente, @NombreAdquiriente, @PeriodoTributario, @TipoComprobante, @SerieComprobante, @NumeroComprobante,
 @TipoBien, @TipoOperacion, @ArchivoOrigen, @UsuarioCarga
WHERE NOT EXISTS (SELECT 1 FROM dbo.CxcDetracciones WHERE NumeroConstancia = @NumeroConstancia);";

            const string marcarDuplicadosSql = @"
UPDATE t SET t.Observacion = @Aviso
FROM dbo.CxcDetracciones t
WHERE t.IdActivo = 1 AND t.Observacion IS NULL
  AND EXISTS (SELECT 1 FROM dbo.CxcDetracciones o
              WHERE o.IdDetraccion <> t.IdDetraccion AND o.IdActivo = 1
                AND o.NroDocAdquiriente = t.NroDocAdquiriente AND o.TipoComprobante = t.TipoComprobante
                AND o.SerieComprobante = t.SerieComprobante
                AND SUBSTRING(o.NumeroComprobante, PATINDEX('%[^0]%', o.NumeroComprobante + '.'), 20)
                  = SUBSTRING(t.NumeroComprobante, PATINDEX('%[^0]%', t.NumeroComprobante + '.'), 20));";

            await using var tx = await connection.BeginTransactionAsync(cancellationToken);
            var insertados = 0;
            foreach (var r in nuevos)
            {
                var cmd = new CommandDefinition(insertSql, new DynamicParameters(r.P), tx, cancellationToken: cancellationToken);
                insertados += await connection.ExecuteAsync(cmd);
            }

            await connection.ExecuteAsync(new CommandDefinition(RelinkSql, transaction: tx, cancellationToken: cancellationToken));
            await connection.ExecuteAsync(new CommandDefinition(marcarDuplicadosSql, new { Aviso = AvisoDuplicado }, tx, cancellationToken: cancellationToken));
            await tx.CommitAsync(cancellationToken);

            response.Insertados = insertados;
            response.Grabado = true;
            response.YaExisten += response.Nuevos - insertados;
            response.Nuevos = insertados;
        }

        var extras = $"{response.OmitidosCompra} omitida(s) por ser compras, {response.SinFacturaSire} sin factura en el SIRE, {response.PosiblesDuplicados} con posible deposito duplicado";
        response.Mensaje = request.SoloAnalizar
            ? $"Analisis: {response.Nuevos} nueva(s), {response.YaExisten} ya existente(s), {response.RepetidosEnArchivo} repetida(s) en el archivo, {response.Invalidos} invalida(s); {extras}. No se grabo nada."
            : $"Carga: {response.Insertados} detraccion(es) insertada(s). {response.YaExisten} omitida(s) por ya existir, {response.RepetidosEnArchivo} repetida(s) en el archivo, {response.Invalidos} invalida(s); {extras}.";
        return response;
    }

    public async Task<List<CxcDetraccionDto>> ListarAsync(CancellationToken cancellationToken = default)
    {
        const string sql = @"
SELECT IdDetraccion, NumeroConstancia, FechaPago, MontoDeposito, NroDocAdquiriente, NombreAdquiriente, TipoComprobante,
       SerieComprobante, NumeroComprobante, PeriodoTributario, NumeroCuenta, IdDocumento, Observacion, ArchivoOrigen,
       FechaCarga, UsuarioCarga
FROM dbo.CxcDetracciones
WHERE IdActivo = 1
ORDER BY FechaPago DESC, NumeroConstancia DESC;";

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var rows = await connection.QueryAsync<CxcDetraccionDto>(_sqlCommandFactory.Create(sql, null, CommandType.Text, cancellationToken));
        return rows.ToList();
    }

    private static void Agregar(Dictionary<string, HashSet<string>> dic, string clave, string constancia)
    {
        if (!dic.TryGetValue(clave, out var set))
        {
            set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            dic[clave] = set;
        }

        set.Add(constancia);
    }

    private static string ClaveComprobante(string? ruc, string? tipo, string? serie, string? numero)
    {
        var nro = (numero ?? string.Empty).Trim().TrimStart('0');
        return $"{(ruc ?? string.Empty).Trim()}|{(tipo ?? string.Empty).Trim()}|{(serie ?? string.Empty).Trim().ToUpperInvariant()}|{nro}";
    }

    /// <summary>Divide una linea csv respetando comillas dobles.</summary>
    private static string[] SplitCsv(string linea, char separador)
    {
        var res = new List<string>();
        var sb = new StringBuilder();
        var enComillas = false;
        for (var i = 0; i < linea.Length; i++)
        {
            var ch = linea[i];
            if (ch == '"')
            {
                if (enComillas && i + 1 < linea.Length && linea[i + 1] == '"')
                {
                    sb.Append('"');
                    i++;
                }
                else
                {
                    enComillas = !enComillas;
                }
            }
            else if (ch == separador && !enComillas)
            {
                res.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(ch);
            }
        }

        res.Add(sb.ToString());
        return res.ToArray();
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
