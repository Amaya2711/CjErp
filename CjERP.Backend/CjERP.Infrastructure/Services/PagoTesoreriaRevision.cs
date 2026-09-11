using CjERP.Application.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public sealed partial class PagoTesoreriaService
{
    // Usuario.IdEmpleado es pCodEmpleado; Empleado.IdEmpleadoCj es pIdEmpleadoCj.
    public static PagoRevisionPermisos PermisosRevision(int? empleado, int? empleadoCj) => new(
        empleado is > 0,
        empleado is > 0,
        empleado is > 0 && empleadoCj == 77,
        empleado);

    public async Task<PagoRevisionPermisos> PermisosRevisionAsync(string usuario, CancellationToken ct)
    {
        await using var cn = factory.CreateConnection();
        var identidad = await cn.QuerySingleOrDefaultAsync<IdentidadRevision>(factory.Create("""
            SELECT e.IdEmpleado, e.IdEmpleadoCj FROM Usuario u
            JOIN Empleado e ON e.IdEmpleado=u.IdEmpleado WHERE u.IdUsuario=@usuario
            """, new { usuario }, cancellationToken: ct));
        return PermisosRevision(identidad?.IdEmpleado, identidad?.IdEmpleadoCj);
    }

    public static void ValidarRevision(PagoRevisionDto request, PagoRevisionPermisos permisos)
    {
        if (!permisos.PuedeEditar) throw new UnauthorizedAccessException("No se pudo identificar al empleado autorizado.");
        if (request.Item.Estado != 1 || request.Item.Correlativo <= 0 || string.IsNullOrWhiteSpace(request.Item.IdSite)
            || !System.Text.RegularExpressions.Regex.IsMatch(request.Item.Version, "\\A[A-Fa-f0-9]{64}\\z"))
            throw new ArgumentException("Solo se pueden editar recibos de Revisión con una versión válida.");
        if (request.Estado != 1 && (!permisos.PuedeEditarEstado || !request.ConfirmarCambioEstado))
            throw new ArgumentException("El cambio de estado requiere permiso especial y confirmación.");
        if (request.NroOperacion?.Length > 50 || request.ImgFactura?.Length > 2500)
            throw new ArgumentException("El número de operación o la referencia de factura supera la longitud permitida.");
    }

    public async Task GuardarRevisionAsync(PagoRevisionDto request, string usuario, CancellationToken ct)
    {
        var permisos = await PermisosRevisionAsync(usuario, ct);
        ValidarRevision(request, permisos);
        await using var cn = factory.CreateConnection();
        await cn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        var actual = await cn.QuerySingleOrDefaultAsync<RevisionActual>(new CommandDefinition($"""
            SELECT a.Estado,a.IdSite,{VersionSql} AS Version,a.IdAnticipo,a.NroOperacion,
                a.IdComprobante,a.IdTipoPago,a.ImgFactura
            FROM Planilla a WITH (UPDLOCK,HOLDLOCK) WHERE a.Correlativo=@Correlativo
            """, request.Item, tx, cancellationToken: ct));
        if (actual is null || actual.Estado != 1 || actual.IdSite.Trim() != request.Item.IdSite.Trim() || actual.Version != request.Item.Version)
            throw new InvalidOperationException("El recibo cambió desde la consulta. Actualice la lista antes de volver a editarlo.");
        if (!permisos.PuedeEditarOperacion && request.NroOperacion != actual.NroOperacion)
            throw new UnauthorizedAccessException("No tiene permiso para modificar NroOperacion.");

        async Task ValidarOpcion(string programa, string campo, int? nuevo, int? anterior)
        {
            // Los datos históricos sin catálogo se pueden conservar, pero no asignar nuevamente.
            if (nuevo == anterior) return;
            var count = await cn.ExecuteScalarAsync<int>(new CommandDefinition("""
                SELECT COUNT(*) FROM Constante WHERE Sociedad='PE01' AND Programa=@programa AND Campo=@campo AND Correlativo=@nuevo
                """, new { programa, campo, nuevo }, tx, cancellationToken: ct));
            if (count != 1) throw new ArgumentException($"Seleccione un valor válido para {campo}.");
        }
        await ValidarOpcion("MAESTRO", "ANTICIPO", request.IdAnticipo, actual.IdAnticipo);
        await ValidarOpcion("MAESTRO", "ESTADO", request.Estado, actual.Estado);
        await ValidarOpcion("PLANTILLA", "TIPO_COMPROBANTE", request.IdComprobante, actual.IdComprobante);
        await ValidarOpcion("PLANTILLA", "TIPO_PAGO", request.IdTipoPago, actual.IdTipoPago);
        bool cambiaAdjunto = request.ImgFactura != actual.ImgFactura;
        if (cambiaAdjunto && !string.IsNullOrWhiteSpace(request.ImgFactura)
            && (!Uri.TryCreate(request.ImgFactura, UriKind.Absolute, out var uri) || uri.Scheme != "https"))
            throw new ArgumentException("La nueva factura debe ser un archivo cargado o un enlace HTTPS válido.");
        int[] ids = [request.Item.Correlativo];
        var ahora = DateTime.UtcNow.AddHours(-5);
        await AuditarAsync(cn, tx, ids, usuario, "ANTES editar revisión", ahora, ct);
        await cn.ExecuteAsync(new CommandDefinition("""
            UPDATE Planilla SET IdAnticipo=@IdAnticipo,NroOperacion=@NroOperacion,IdComprobante=@IdComprobante,
                IdTipoPago=@IdTipoPago,ImgFactura=@ImgFactura,Estado=@Estado,
                IdUsuarioFactura=CASE WHEN @cambiaAdjunto=1 THEN @empleado ELSE IdUsuarioFactura END,
                FecImaFactura=CASE WHEN @cambiaAdjunto=1 THEN @ahora ELSE FecImaFactura END
            WHERE Correlativo=@correlativo
            """, new { request.IdAnticipo, request.NroOperacion, request.IdComprobante, request.IdTipoPago,
                request.ImgFactura, request.Estado, cambiaAdjunto, empleado = permisos.IdEmpleado, ahora, correlativo = request.Item.Correlativo }, tx, cancellationToken: ct));
        await AuditarAsync(cn, tx, ids, usuario, "DESPUÉS editar revisión", ahora, ct);
        if (request.Estado != actual.Estado)
            await cn.ExecuteAsync(new CommandDefinition("""
                INSERT MovEstadosPagos(Correlativo,Estado,Observacion,Usuario,FechaCreacion,HoraCreacion)
                VALUES(@correlativo,@Estado,'Corrección de estado desde Revisión',LEFT(@usuario,10),@ahora,@ahora)
                """, new { correlativo = request.Item.Correlativo, request.Estado, usuario, ahora }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task<string?> ObtenerFacturaRevisionAsync(int correlativo, CancellationToken ct)
    {
        await using var cn = factory.CreateConnection();
        return await cn.QuerySingleOrDefaultAsync<string>(factory.Create(
            "SELECT ImgFactura FROM Planilla WHERE Correlativo=@correlativo", new { correlativo }, cancellationToken: ct));
    }

    private sealed class IdentidadRevision { public int IdEmpleado { get; set; } public int? IdEmpleadoCj { get; set; } }
    private sealed class RevisionActual
    {
        public int Estado { get; set; }
        public string IdSite { get; set; } = "";
        public string Version { get; set; } = "";
        public int? IdAnticipo { get; set; }
        public int? IdComprobante { get; set; }
        public int? IdTipoPago { get; set; }
        public string? NroOperacion { get; set; }
        public string? ImgFactura { get; set; }
    }
}
