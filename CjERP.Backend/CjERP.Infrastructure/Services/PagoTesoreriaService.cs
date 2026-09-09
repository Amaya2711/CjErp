using System.Data;
using CjERP.Application.DTOs;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public sealed partial class PagoTesoreriaService(ISqlCommandFactory factory)
{
    public async Task<object> CatalogosAsync(CancellationToken ct)
    {
        await using var cn = factory.CreateConnection();
        var ejecutores = await cn.QueryAsync(factory.Create("SELECT IdEmpleado AS Id, NombreEmpleado AS Nombre FROM Empleado WHERE IdCargo=14 AND IdEstado=1 ORDER BY NombreEmpleado", cancellationToken: ct));
        var constantes = (await cn.QueryAsync(factory.Create("SELECT Correlativo AS Id, ValorIni AS Nombre, TRY_CONVERT(decimal(18,4),ValorFin) AS Porcentaje, Campo FROM Constante WHERE Sociedad='PE01' AND Programa='PLANTILLA' AND Campo IN ('BANCO','TIPO_TRANSFERENCIA','TIPO_MONEDA','TIPO_COMPROBANTE','TIPO_PAGO','RENDICION','DETRACCION') AND Correlativo>=0 ORDER BY Correlativo", cancellationToken: ct))).ToList();
        return new { ejecutores, bancos = constantes.Where(x => x.Campo == "BANCO"), transferencias = constantes.Where(x => x.Campo == "TIPO_TRANSFERENCIA"), monedas = constantes.Where(x => x.Campo == "TIPO_MONEDA"), comprobantes = constantes.Where(x => x.Campo == "TIPO_COMPROBANTE"), tiposPago = constantes.Where(x => x.Campo == "TIPO_PAGO"), rendiciones = constantes.Where(x => x.Campo == "RENDICION"), retenciones = constantes.Where(x => string.Equals((string)x.Campo,"DETRACCION",StringComparison.OrdinalIgnoreCase)) };
    }

    public async Task<object> ListarAsync(int estado, DateTime? desde, DateTime? hasta, CancellationToken ct)
    {
        if (estado is not (1 or 9 or 8 or 5 or 4 or 2)) throw new ArgumentException("Estado de consulta inválido.");
        if (desde > hasta) throw new ArgumentException("La fecha inicial no puede superar la final.");
        if (estado == 4 && (desde is null || hasta is null)) throw new ArgumentException("Indique el rango de fechas del historial.");
        await using var cn = factory.CreateConnection();
        // Importes originales: la consulta general convierte dólares y agrupa operaciones bancarias.
        return await cn.QueryAsync(factory.Create($"""
            SELECT a.Correlativo, a.IdSite, a.Estado, a.TipoMoneda, a.IdResponsable,
                {VersionSql} AS Version,
                a.IdComprobante, a.IdTipoPago, a.Ruc, fechas.Emision AS FecEmision, a.IdRendicion, a.IdRetencion,
                a.IdBanco, a.IdTransferencia, a.IdMoneda2, a.RevisionPm, a.FechaRevision, a.Observacion, a.ImgFactura,
                a.RevisionPmAprobar, a.FechaRevisionAprobar, ren.ValorIni AS Rendicion,
                fechas.Ingreso AS Fecha, fechas.Deposito AS FechaDeposito, a.OT, a.Detalle, a.Serie,
                a.Subtotal, a.IGV, a.Total, a.MontoRetencion, a.TotalPagar,
                a.NroOperacion, a.Cheque, a.Comentario AS ComentarioAdicional,
                COALESCE(r.NombreEmpleado, a.Responsable) AS Responsable,
                CASE WHEN ISNULL(a.IdWeb,0)=1 THEN sc.NombreEmpleado ELSE s.NombreEmpleado END AS Solicitante,
                c.NombreCliente AS Cliente, p.NombreProyecto AS Proyecto, si.NombreSite AS Site,
                a.Tipo_Trabajo AS TipoTrabajo, tarea.ValorIni AS Tarea, doc.ValorIni AS Comprobante,
                mon.ValorIni AS Moneda, ban.ValorIni AS Banco, trans.ValorIni AS Transferencia
            FROM Planilla a
            CROSS APPLY (SELECT
                COALESCE(TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecEmision)),''),23), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecEmision)),''),101), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecEmision)),''),103)) AS Emision,
                COALESCE(TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecIngreso)),''),23), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecIngreso)),''),101), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FecIngreso)),''),103)) AS Ingreso,
                COALESCE(TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FechaDeposito)),''),23), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FechaDeposito)),''),101), TRY_CONVERT(date,NULLIF(LTRIM(RTRIM(a.FechaDeposito)),''),103)) AS Deposito
            ) fechas
            LEFT JOIN Empleado r ON r.IdEmpleado=a.IdResponsable
            LEFT JOIN Constante ren ON ren.Sociedad='PE01' AND ren.Programa='PLANTILLA' AND ren.Campo='RENDICION' AND ren.Correlativo=a.IdRendicion
            LEFT JOIN Empleado s ON s.IdEmpleado=a.IdSolicitante AND ISNULL(a.IdWeb,0)<>1
            LEFT JOIN EmpleadoCj sc ON sc.IdEmpleado=a.IdSolicitante AND ISNULL(a.IdWeb,0)=1
            LEFT JOIN Cliente c ON c.IdCliente=a.IdCliente
            LEFT JOIN Proyecto p ON p.IdProyecto=a.IdProyecto
            LEFT JOIN Site si ON si.IdSite=a.IdSite AND si.Correlativo=a.CorreSite
            LEFT JOIN Constante tarea ON tarea.Sociedad='PE01' AND tarea.Programa='PLANTILLA' AND tarea.Campo='TAREA' AND tarea.Correlativo=a.IdTarea
            LEFT JOIN Constante doc ON doc.Sociedad='PE01' AND doc.Programa='PLANTILLA' AND doc.Campo='TIPO_COMPROBANTE' AND doc.Correlativo=a.IdComprobante
            LEFT JOIN Constante mon ON mon.Sociedad='PE01' AND mon.Programa='PLANTILLA' AND mon.Campo='TIPO_MONEDA' AND mon.Correlativo=a.TipoMoneda
            LEFT JOIN Constante ban ON ban.Sociedad='PE01' AND ban.Programa='PLANTILLA' AND ban.Campo='BANCO' AND ban.Correlativo=a.IdBanco
            LEFT JOIN Constante trans ON trans.Sociedad='PE01' AND trans.Programa='PLANTILLA' AND trans.Campo='TIPO_TRANSFERENCIA' AND trans.Correlativo=a.IdTransferencia
            WHERE (a.Estado=@estado OR (@estado=2 AND a.Estado=7))
                AND (@desde IS NULL OR (CASE WHEN @estado=4 THEN fechas.Deposito ELSE fechas.Ingreso END)>=@desde)
                AND (@hasta IS NULL OR (CASE WHEN @estado=4 THEN fechas.Deposito ELSE fechas.Ingreso END)<=@hasta)
            ORDER BY a.Correlativo DESC
            """, new { estado, desde = desde?.Date, hasta = hasta?.Date }, cancellationToken: ct));
    }

    public async Task<object> CuentasAsync(int responsable, CancellationToken ct)
    {
        await using var cn = factory.CreateConnection();
        return await cn.QueryAsync(factory.Create("""
            SELECT DISTINCT c.Cuenta, c.CuentaInter, c.NombreCta, b.ValorIni AS Banco
            FROM CuentaEmpleado c
            LEFT JOIN Constante b ON b.Sociedad='PE01' AND b.Programa='PLANTILLA' AND b.Campo='BANCO' AND b.Correlativo=c.IdBanco
            WHERE c.IdEmpleado=@responsable AND c.Estado=1
            """, new { responsable }, cancellationToken: ct));
    }

    public async Task<int> PagarAsync(PagoTesoreriaRequestDto request, string usuario, CancellationToken ct)
    {
        if (request.EstadoOrigen is not (5 or 8)) throw new ArgumentException("Solo se pueden pagar recibos administrativos o programados.");
        if (request.Items.Count is < 1 or > 500 || request.Items.Select(x => x.Correlativo).Distinct().Count() != request.Items.Count)
            throw new ArgumentException("Seleccione entre 1 y 500 recibos sin duplicados.");
        if (request.FechaDeposito == default || request.FechaDeposito.Date > DateTime.UtcNow.AddHours(-5).Date)
            throw new ArgumentException("Indique una fecha de depósito válida, no futura.");
        await using var cn = factory.CreateConnection();
        await cn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        var ids = request.Items.Select(x => x.Correlativo).OrderBy(x => x).ToArray();
        var actuales = (await cn.QueryAsync<PagoActual>(new CommandDefinition($"""
            SELECT Correlativo, IdSite, Estado, TipoMoneda, TotalPagar, {VersionSql} AS Version
            FROM Planilla a WITH (UPDLOCK, HOLDLOCK) WHERE Correlativo IN @ids ORDER BY Correlativo
            """, new { ids }, tx, cancellationToken: ct))).ToList();
        if (actuales.Count != ids.Length || actuales.Any(a => a.Estado != request.EstadoOrigen || a.TipoMoneda != request.IdMoneda2 || a.TotalPagar <= 0 ||
            !request.Items.Any(i => i.Correlativo == a.Correlativo && i.IdSite.Trim() == a.IdSite.Trim() && i.TotalPagar == a.TotalPagar && i.Version == a.Version)))
            throw new InvalidOperationException("Los recibos cambiaron de estado, importe o moneda. Actualice la lista y revise la selección.");

        var comentariosExcedidos = await cn.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT COUNT(*) FROM Planilla WHERE Correlativo IN @ids
            AND DATALENGTH(CONVERT(varchar(max),ISNULL(Comentario,'')) + ' - ' + CONVERT(varchar(max),@comentario)) > COL_LENGTH('dbo.Planilla','Comentario')
            """, new { ids, comentario = request.Comentario.Trim() }, tx, cancellationToken: ct));
        if (comentariosExcedidos > 0) throw new ArgumentException("El comentario supera el espacio disponible en uno de los recibos. Reduzca el texto y vuelva a revisar el lote.");

        var ejecutorValido = await cn.ExecuteScalarAsync<int>(new CommandDefinition("SELECT COUNT(*) FROM Empleado WHERE IdEmpleado=@IdEjecutor AND IdCargo=14 AND IdEstado=1", request, tx, cancellationToken: ct));
        var catalogosValidos = await cn.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT COUNT(DISTINCT Campo) FROM Constante WHERE Sociedad='PE01' AND Programa='PLANTILLA' AND
            ((Campo='BANCO' AND Correlativo=@IdBanco) OR (Campo='TIPO_TRANSFERENCIA' AND Correlativo=@IdTransferencia) OR (Campo='TIPO_MONEDA' AND Correlativo=@IdMoneda2))
            """, request, tx, cancellationToken: ct));
        if (ejecutorValido == 0 || catalogosValidos != 3) throw new ArgumentException("Seleccione ejecutor, banco, medio de pago y moneda válidos.");
        var medio = await cn.QuerySingleAsync<string>(new CommandDefinition("SELECT ValorIni FROM Constante WHERE Sociedad='PE01' AND Programa='PLANTILLA' AND Campo='TIPO_TRANSFERENCIA' AND Correlativo=@IdTransferencia", request, tx, cancellationToken: ct));
        if (medio.Contains("CHEQUE", StringComparison.OrdinalIgnoreCase) ? string.IsNullOrWhiteSpace(request.Cheque) : !medio.Contains("EFECTIVO", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(request.NroOperacion))
            throw new ArgumentException("Ingrese el número de cheque o de operación según el medio de pago.");

        var items = new DataTable();
        items.Columns.Add("Correlativo", typeof(int));
        items.Columns.Add("IdSite", typeof(string));
        foreach (var item in request.Items) items.Rows.Add(item.Correlativo, item.IdSite);
        var parameters = new DynamicParameters();
        parameters.Add("IdEjecutor", request.IdEjecutor);
        parameters.Add("IdTransferencia", request.IdTransferencia);
        parameters.Add("IdBanco", request.IdBanco);
        parameters.Add("IdMoneda2", request.IdMoneda2);
        parameters.Add("FechaDeposito", request.FechaDeposito.Date, DbType.Date);
        parameters.Add("Cheque", request.Cheque.Trim(), DbType.AnsiString, size: 100);
        parameters.Add("NroOperacion", request.NroOperacion.Trim(), DbType.AnsiString, size: 100);
        parameters.Add("Usuario", usuario, DbType.AnsiString, size: 100);
        parameters.Add("FechaCreacion", DateTime.UtcNow.AddHours(-5));
        parameters.Add("Items", items.AsTableValuedParameter("dbo.PlanillaRevisionType"));
        var sp = "dbo.sp_Planilla_AdministrativoMasivo";
        if (request.EstadoOrigen == 8)
        {
            sp = "dbo.sp_Planilla_PagoContabilidadMasivo";
            parameters.Add("Opc", 2);
            parameters.Add("ObsAdicional", request.Comentario.Trim(), DbType.AnsiString);
            parameters.Add("ComentarioLog", request.Comentario.Trim(), DbType.AnsiString);
        }
        else parameters.Add("ComentarioAdicional", request.Comentario.Trim(), DbType.AnsiString);
        await cn.ExecuteAsync(new CommandDefinition(sp, parameters, tx, commandTimeout: 180, commandType: CommandType.StoredProcedure, cancellationToken: ct));
        var pagados = await cn.ExecuteScalarAsync<int>(new CommandDefinition("SELECT COUNT(*) FROM Planilla WHERE Correlativo IN @ids AND Estado=4", new { ids }, tx, cancellationToken: ct));
        if (pagados != ids.Length) throw new InvalidOperationException("El procedimiento no confirmó todos los pagos. La operación se revirtió.");
        await tx.CommitAsync(ct);
        return pagados;
    }

    private sealed class PagoActual
    {
        public int Correlativo { get; set; }
        public string IdSite { get; set; } = "";
        public int Estado { get; set; }
        public int TipoMoneda { get; set; }
        public decimal TotalPagar { get; set; }
        public string Version { get; set; } = "";
    }
}
