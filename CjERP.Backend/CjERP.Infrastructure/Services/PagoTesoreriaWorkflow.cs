using System.Data;
using CjERP.Application.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public sealed partial class PagoTesoreriaService
{
    // La misma huella se entrega al consultar y se compara bajo bloqueo antes de escribir.
    private const string VersionSql = """
        CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT a.Estado,a.TipoMoneda,a.Total,a.TotalPagar,a.MontoRetencion,
        a.IdRetencion,a.IdComprobante,a.IdTipoPago,a.Ruc,a.Serie,a.FecEmision,a.IdRendicion,a.IdBanco,a.IdMoneda2,
        a.FechaDeposito,a.IdTransferencia,a.NroOperacion,a.Cheque,a.IdEjecutor,a.Observacion,a.Comentario,
        a.RevisionPm,a.FechaRevision,a.ImgFactura,a.IdAnticipo,a.IdResponsable,a.IdSolicitante,a.IdCliente,a.IdProyecto,
        a.IdSite,a.CorreSite,a.RevisionPmAprobar,a.FechaRevisionAprobar,CONVERT(varchar(max),a.Detalle) AS Detalle
        FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)),2)
        """;

    public static int EstadoDestino(string accion, int origen) => (accion, origen) switch
    {
        ("revisar", 1) => 9,
        ("contabilidad-programar", 9) => 8,
        ("contabilidad-administrativo", 9) => 5,
        ("programar", 5) => 8,
        ("administrativo", 8) => 5,
        ("observar", 1 or 9 or 8 or 5) => 7,
        ("rendicion", 4) => 4,
        ("corregir", 2 or 7) => origen,
        // Una observación de aprobación vuelve al aprobador; la administrativa vuelve a revisión.
        ("subsanar", 2) => 0,
        ("subsanar", 7) => 1,
        _ => throw new ArgumentException("La acción no está permitida para el estado actual del recibo.")
    };

    public async Task<int> EjecutarAccionAsync(PagoTesoreriaAccionDto request, string usuario, CancellationToken ct)
    {
        if (request.Items.Count is < 1 or > 500 || request.Items.Select(i => i.Correlativo).Distinct().Count() != request.Items.Count)
            throw new ArgumentException("Seleccione entre 1 y 500 recibos diferentes.");
        if (string.IsNullOrWhiteSpace(usuario) || usuario.Length > 50) throw new ArgumentException("Usuario de auditoría inválido.");
        foreach (var item in request.Items) _ = EstadoDestino(request.Accion, item.Estado);
        if (request.Accion is "observar" or "subsanar" or "corregir" && string.IsNullOrWhiteSpace(request.Observacion))
            throw new ArgumentException("Ingrese el motivo de la observación o el detalle de la corrección.");
        bool edicion = request.Accion is "rendicion" or "corregir" or "subsanar";
        if (!edicion && (request.AplicarGenerales || request.AplicarBanco || request.AplicarRendicion || request.AplicarOperacion || request.AplicarDetalle || request.AplicarAdjunto))
            throw new ArgumentException("Esta acción no admite bloques de edición.");
        if (request.Accion is "corregir" or "subsanar" && (request.AplicarBanco || request.AplicarOperacion || request.AplicarRendicion))
            throw new ArgumentException("Los datos de pago y rendición se actualizan en Rendición.");
        if (request.Accion == "rendicion" && (!request.AplicarGenerales && !request.AplicarBanco && !request.AplicarRendicion && !request.AplicarOperacion || request.AplicarDetalle || request.AplicarAdjunto))
            throw new ArgumentException("Seleccione al menos un bloque de rendición válido.");
        if (request.AplicarBanco && request.AplicarOperacion)
            throw new ArgumentException("El bloque Bancos ya incluye el número de operación.");
        if (request.AplicarGenerales && request.Ruc.Length > 0 && (request.Ruc.Length != 11 || request.Ruc.Any(c => c < '0' || c > '9')))
            throw new ArgumentException("El RUC debe tener 11 dígitos o quedar vacío.");
        if (request.AplicarDetalle && string.IsNullOrWhiteSpace(request.Detalle)) throw new ArgumentException("Ingrese el detalle corregido.");
        if (request.AplicarAdjunto && (!Uri.TryCreate(request.ImgFactura, UriKind.Absolute, out var adjunto) || adjunto.Scheme != "https"))
            throw new ArgumentException("Ingrese un enlace HTTPS válido al comprobante.");
        var ahora = DateTime.UtcNow.AddHours(-5);
        if (request.AplicarGenerales && (!request.FecEmision.HasValue || request.FecEmision.Value.Year < 1900 || request.FecEmision.Value.Date > ahora.Date))
            throw new ArgumentException("Seleccione una fecha de emisión válida, no futura.");
        if (request.AplicarBanco && (!request.FechaDeposito.HasValue || request.FechaDeposito.Value.Year < 1900 || request.FechaDeposito.Value.Date > ahora.Date))
            throw new ArgumentException("Seleccione una fecha de depósito válida, no futura.");
        if (request.AplicarOperacion && string.IsNullOrWhiteSpace(request.NroOperacion)) throw new ArgumentException("Ingrese el número de operación.");

        await using var cn = factory.CreateConnection();
        await cn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        var ids = request.Items.Select(i => i.Correlativo).OrderBy(i => i).ToArray();
        var actuales = (await cn.QueryAsync<PagoActual>(new CommandDefinition($"""
            SELECT a.Correlativo,a.IdSite,a.Estado,a.TipoMoneda,a.TotalPagar,{VersionSql} AS Version
            FROM Planilla a WITH (UPDLOCK,HOLDLOCK) WHERE a.Correlativo IN @ids ORDER BY a.Correlativo
            """, new { ids }, tx, cancellationToken: ct))).ToList();
        if (actuales.Count != request.Items.Count || actuales.Any(a => !request.Items.Any(i => i.Correlativo == a.Correlativo && i.IdSite.Trim() == a.IdSite.Trim() && i.Estado == a.Estado && i.Version == a.Version)))
            throw new InvalidOperationException("Uno o más recibos cambiaron desde la consulta. Actualice la lista y revise nuevamente el lote.");

        async Task<string> ValidarCatalogo(string campo, int? id)
        {
            if (!id.HasValue || id < 0) throw new ArgumentException($"Seleccione un valor para {campo}.");
            var opciones = (await cn.QueryAsync<string>(new CommandDefinition("SELECT ValorIni FROM Constante WHERE Sociedad='PE01' AND Programa='PLANTILLA' AND Campo=@campo AND Correlativo=@id", new { campo, id }, tx, cancellationToken: ct))).ToList();
            if (opciones.Count != 1) throw new ArgumentException($"Valor no válido para {campo}.");
            return opciones[0];
        }
        if (request.AplicarGenerales)
        {
            await ValidarCatalogo("TIPO_COMPROBANTE", request.IdComprobante);
            await ValidarCatalogo("TIPO_PAGO", request.IdTipoPago);
        }
        if (request.AplicarRendicion) await ValidarCatalogo("RENDICION", request.IdRendicion);
        if (request.AplicarBanco)
        {
            await ValidarCatalogo("BANCO", request.IdBanco);
            await ValidarCatalogo("TIPO_MONEDA", request.IdMoneda2);
            var medio = await ValidarCatalogo("TIPO_TRANSFERENCIA", request.IdTransferencia);
            if (actuales.Any(i => i.TipoMoneda != request.IdMoneda2)) throw new ArgumentException("La moneda bancaria debe coincidir con la de todos los recibos del lote.");
            if (!medio.Contains("EFECTIVO", StringComparison.OrdinalIgnoreCase) && !medio.Contains("CHEQUE", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(request.NroOperacion))
                throw new ArgumentException("Ingrese el número de operación bancaria.");
        }
        var parameters = new DynamicParameters();
        var table = new DataTable(); table.Columns.Add("Correlativo", typeof(int)); table.Columns.Add("IdSite", typeof(string));
        foreach (var item in request.Items) table.Rows.Add(item.Correlativo, item.IdSite);
        parameters.Add("Items", table.AsTableValuedParameter("dbo.PlanillaRevisionType"));
        string? sp = null;
        if (request.Accion.StartsWith("contabilidad-", StringComparison.Ordinal))
        {
            await ValidarCatalogo("DETRACCION", request.IdRetencion);
            var porcentaje = await cn.ExecuteScalarAsync<decimal?>(new CommandDefinition("SELECT TRY_CONVERT(decimal(18,4),ValorFin) FROM Constante WHERE Sociedad='PE01' AND Programa='PLANTILLA' AND Campo='DETRACCION' AND Correlativo=@id", new { id = request.IdRetencion }, tx, cancellationToken: ct)) ?? 0;
            if (porcentaje < 0 || porcentaje > 100) throw new ArgumentException("El porcentaje de retención del catálogo no es válido.");
            parameters.Add("IdRetencion", request.IdRetencion);
            parameters.Add("ValorRetencion", request.IdRetencion is >= 1 and <= 5 ? porcentaje : 0, DbType.Decimal);
            parameters.Add("Observacion", request.Observacion, DbType.AnsiString);
            sp = request.Accion == "contabilidad-programar" ? "dbo.sp_Planilla_ContabilidadMasivo" : "dbo.sp_Planilla_PasarAdministrativoMasivo";
        }
        else if (request.Accion == "revisar")
        {
            parameters.Add("RevisionPM", ahora.TimeOfDay > TimeSpan.FromHours(14) ? "PM" : "AM", DbType.AnsiString);
            parameters.Add("FechaRevision", ahora); parameters.Add("Estado", 9);
            sp = "dbo.sp_Planilla_ActualizarRevisionMasiva";
        }
        else if (request.Accion == "programar")
        {
            parameters.Add("Observacion", request.Observacion, DbType.AnsiString);
            sp = "dbo.sp_Planilla_ProgramarMasivo";
        }
        else if (edicion)
        {
            parameters.Add("AplicarRendicion", request.AplicarGenerales);
            parameters.Add("AplicarBanco", request.AplicarBanco);
            parameters.Add("AplicarRendicionFinal", request.AplicarRendicion);
            parameters.Add("AplicarOperacion", request.AplicarOperacion);
            parameters.Add("IdComprobante", request.IdComprobante); parameters.Add("IdTipoPago", request.IdTipoPago);
            parameters.Add("Ruc", request.Ruc, DbType.AnsiString); parameters.Add("Serie", request.Serie, DbType.AnsiString);
            parameters.Add("FecEmision", request.FecEmision?.Date, DbType.Date); parameters.Add("Observacion", request.Observacion, DbType.AnsiString);
            parameters.Add("IdBanco", request.IdBanco); parameters.Add("IdMoneda2", request.IdMoneda2);
            parameters.Add("FechaDeposito", request.FechaDeposito?.Date, DbType.Date); parameters.Add("IdTransferencia", request.IdTransferencia);
            parameters.Add("NroOperacionBanco", request.NroOperacion, DbType.AnsiString); parameters.Add("NroOperacionExtra", request.NroOperacion, DbType.AnsiString);
            parameters.Add("IdRendicion", request.IdRendicion);
            sp = "dbo.sp_Planilla_ActualizarRendirMasivo";
        }

        // Los procedimientos de estas etapas no auditan. Guardamos ambos valores en la misma transacción.
        await AuditarAsync(cn, tx, ids, usuario, $"ANTES {request.Accion}", ahora, ct);
        if (sp is not null) await cn.ExecuteAsync(new CommandDefinition(sp, parameters, tx, commandTimeout: 180, commandType: CommandType.StoredProcedure, cancellationToken: ct));
        if (request.Accion == "administrativo")
            await cn.ExecuteAsync(new CommandDefinition("UPDATE Planilla SET Estado=5 WHERE Correlativo IN @ids", new { ids }, tx, cancellationToken: ct));
        if (request.Accion is "observar" or "corregir" or "subsanar")
        {
            await cn.ExecuteAsync(new CommandDefinition("""
                UPDATE Planilla SET Observacion=@observacion,
                    Estado=CASE WHEN @accion='observar' THEN 7 WHEN @accion='subsanar' THEN CASE WHEN Estado=2 THEN 0 ELSE 1 END ELSE Estado END,
                    Detalle=CASE WHEN @aplicarDetalle=1 THEN @detalle ELSE CONVERT(varchar(max),Detalle) END,
                    ImgFactura=CASE WHEN @aplicarAdjunto=1 THEN @adjunto ELSE ImgFactura END
                WHERE Correlativo IN @ids
                """, new { ids, observacion = request.Observacion, accion = request.Accion, aplicarDetalle = request.AplicarDetalle, detalle = request.Detalle, aplicarAdjunto = request.AplicarAdjunto, adjunto = request.ImgFactura }, tx, cancellationToken: ct));
        }
        if (request.Accion == "revisar" && !string.IsNullOrWhiteSpace(request.Observacion))
            await cn.ExecuteAsync(new CommandDefinition("UPDATE Planilla SET Observacion=@observacion WHERE Correlativo IN @ids", new { ids, observacion = request.Observacion }, tx, cancellationToken: ct));
        var finales = (await cn.QueryAsync<PagoActual>(new CommandDefinition("SELECT Correlativo,Estado FROM Planilla WHERE Correlativo IN @ids", new { ids }, tx, cancellationToken: ct))).ToList();
        if (finales.Count != actuales.Count || finales.Any(a => a.Estado != EstadoDestino(request.Accion, actuales.Single(i => i.Correlativo == a.Correlativo).Estado)))
            throw new InvalidOperationException("No se completó la transición de todos los recibos. El lote se revirtió.");
        await AuditarAsync(cn, tx, ids, usuario, $"DESPUÉS {request.Accion}", ahora, ct);
        if (request.Accion is not ("rendicion" or "corregir"))
            await cn.ExecuteAsync(new CommandDefinition("""
                INSERT MovEstadosPagos(Correlativo,Estado,Observacion,Usuario,FechaCreacion,HoraCreacion)
                SELECT Correlativo,Estado,@observacion,LEFT(@usuario,10),@ahora,@ahora FROM Planilla WHERE Correlativo IN @ids
                """, new { ids, observacion = request.Observacion, usuario, ahora }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
        return finales.Count;
    }

    private static Task<int> AuditarAsync(SqlConnection cn, SqlTransaction tx, int[] ids, string usuario, string accion, DateTime ahora, CancellationToken ct) =>
        cn.ExecuteAsync(new CommandDefinition("""
            INSERT LogPlanilla(Correlativo,IdCliente,IdProyecto,IdSite,IdTipoTrabajo,IdTarea,Estado,Total,IdRetencion,
                IdComprobante,IdTipoPago,Ruc,Serie,FecEmision,IdRendicion,IdBanco,IdMoneda2,FechaDeposito,IdTransferencia,NroOperacion,
                Observacion,Detalle,Usuario,FechaCreacion,HoraCreacion,Comentario)
            SELECT Correlativo,IdCliente,IdProyecto,IdSite,IdTipoTrabajo,IdTarea,Estado,Total,IdRetencion,
                IdComprobante,IdTipoPago,Ruc,Serie,FecEmision,IdRendicion,IdBanco,IdMoneda2,FechaDeposito,IdTransferencia,NroOperacion,
                Observacion,CONCAT('Anticipo: ',IdAnticipo,CHAR(10),'Comprobante adjunto: ',ImgFactura,CHAR(10),'Detalle: ',CONVERT(varchar(max),Detalle)),@usuario,CONVERT(varchar(10),@ahora,23),CONVERT(varchar(23),@ahora,121),
                LEFT(CONCAT(@accion,'; retención=',MontoRetencion,'; neto=',TotalPagar,'; revisión=',RevisionPm,'; fecha=',FechaRevision),500)
            FROM Planilla WHERE Correlativo IN @ids
            """, new { ids, usuario, accion, ahora }, tx, cancellationToken: ct));
}
