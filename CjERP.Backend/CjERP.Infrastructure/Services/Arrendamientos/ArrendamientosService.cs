using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.Arrendamientos;
using CjERP.Application.Interfaces.Services;
using CjERP.Application.Interfaces.Services.Arrendamientos;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services.Arrendamientos;

// ROLLBACK-MARKER: ARRRENDAMIENTOS SERVICE START
public sealed class ArrendamientosService : IArrendamientosService
{
    private const string SpArrendadorGuardar = "dbo.sp_a_Arrendador_Guardar";
    private const string SpInquilinoGuardar = "dbo.sp_a_Inquilino_Guardar";
    private const string SpInmuebleGuardar = "dbo.sp_a_Inmueble_Guardar";
    private const string SpUnidadGuardar = "dbo.sp_a_Unidad_Guardar";
    private const string SpContratoGuardar = "dbo.sp_a_Contrato_Guardar";
    private const string SpContratoUnidadGuardar = "dbo.sp_a_Contrato_Unidad_Guardar";
    private const string SpObligacionGenerar = "dbo.sp_a_Obligacion_Generar";
    private const string SpPagoRegistrar = "dbo.sp_a_Pago_Registrar";
    private const string SpPagoAprobar = "dbo.sp_a_Pago_Aprobar";
    private const string SpPagoAplicar = "dbo.sp_a_Pago_Aplicar";
    private const string SpPagoRevertir = "dbo.sp_a_Pago_Revertir";
    private const string SpFraccionamientoGuardar = "dbo.sp_a_Fraccionamiento_Guardar";
    private const string SpGarantiaGuardar = "dbo.sp_a_Garantia_Guardar";
    private const string SpCobranzaRegistrar = "dbo.sp_a_Cobranza_Gestion_Registrar";
    private const string SpArbitrioGuardar = "dbo.sp_a_Arbitrio_Guardar";
    private const string SpTipoCambioGuardar = "dbo.sp_a_TipoCambioDiario_Guardar";

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public ArrendamientosService(
        ISqlCommandFactory sqlCommandFactory,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    public async Task<ArrendamientosDashboardDto> ObtenerDashboardAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
        SELECT
            (SELECT COUNT(1) FROM dbo.a_arrendador WHERE Activo = 1) AS ArrendadoresActivos,
            (SELECT COUNT(1) FROM dbo.a_inquilino WHERE Activo = 1) AS InquilinosActivos,
            (SELECT COUNT(1) FROM dbo.a_contrato WHERE Activo = 1 AND EstadoContrato IN ('ACTIVO', 'VIGENTE')) AS ContratosVigentes,
            (SELECT COUNT(1) FROM dbo.a_obligacion WHERE Activo = 1 AND Estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')) AS ObligacionesPendientes,
            ISNULL((SELECT SUM(SaldoPendiente) FROM dbo.a_obligacion WHERE Moneda = 'PEN' AND Activo = 1), 0) AS TotalPendientePEN,
            ISNULL((SELECT SUM(SaldoPendiente) FROM dbo.a_obligacion WHERE Moneda = 'USD' AND Activo = 1), 0) AS TotalPendienteUSD,
            ISNULL((SELECT SUM(ImporteConvertido) FROM dbo.a_pago WHERE MonedaOperacion = 'PEN' AND CAST(FechaOperacion AS date) = CAST(SYSDATETIME() AS date)), 0) AS PagosMesPEN,
            ISNULL((SELECT SUM(ImporteConvertido) FROM dbo.a_pago WHERE MonedaOperacion = 'USD' AND CAST(FechaOperacion AS date) = CAST(SYSDATETIME() AS date)), 0) AS PagosMesUSD;
        """;

        await using var connection = _sqlCommandFactory.CreateConnection();
        var result = await connection.QuerySingleAsync<ArrendamientosDashboardDto>(
            _sqlCommandFactory.Create(sql, cancellationToken: cancellationToken));
        return result;
    }

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarArrendadoresAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                IdArrendador AS Id,
                CodigoArrendador AS Codigo,
                RazonSocial AS Nombre,
                NombreComercial AS Detalle,
                CASE WHEN Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END AS Estado,
                NULL AS Moneda,
                NULL AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), FechaCreacion, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                NULL AS Arrendador,
                NULL AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                Observacion,
                'ARRENDADOR' AS Tipo
            FROM dbo.a_arrendador
            ORDER BY FechaCreacion DESC, IdArrendador DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarInquilinosAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                IdInquilino AS Id,
                CodigoInquilino AS Codigo,
                RazonSocial AS Nombre,
                NombreComercial AS Detalle,
                CASE WHEN Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END AS Estado,
                NULL AS Moneda,
                NULL AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), FechaCreacion, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                NULL AS Arrendador,
                NULL AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                Observacion,
                'INQUILINO' AS Tipo
            FROM dbo.a_inquilino
            ORDER BY FechaCreacion DESC, IdInquilino DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarInmueblesAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                IdInmueble AS Id,
                CodigoInmueble AS Codigo,
                NombreInmueble AS Nombre,
                TipoInmueble AS Detalle,
                CASE WHEN Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END AS Estado,
                NULL AS Moneda,
                NULL AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), FechaCreacion, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                NULL AS Arrendador,
                NULL AS Inquilino,
                DireccionCompleta AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                Observacion,
                'INMUEBLE' AS Tipo
            FROM dbo.a_inmueble
            ORDER BY FechaCreacion DESC, IdInmueble DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarUnidadesAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                u.IdUnidad AS Id,
                u.CodigoUnidad AS Codigo,
                u.NombreUnidad AS Nombre,
                u.TipoUnidad AS Detalle,
                CASE WHEN u.Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END AS Estado,
                NULL AS Moneda,
                NULL AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), u.FechaCreacion, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                NULL AS Arrendador,
                NULL AS Inquilino,
                i.NombreInmueble AS Inmueble,
                COALESCE(u.Piso, '') AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                u.Observacion,
                'UNIDAD' AS Tipo
            FROM dbo.a_unidad u
            INNER JOIN dbo.a_inmueble i ON i.IdInmueble = u.IdInmueble
            ORDER BY u.FechaCreacion DESC, u.IdUnidad DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarContratosAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                c.IdContrato AS Id,
                c.CodigoContrato AS Codigo,
                CONCAT(a.RazonSocial, ' / ', i.RazonSocial) AS Nombre,
                COALESCE(u.NombreUnidad, 'Sin unidad') AS Detalle,
                c.EstadoContrato AS Estado,
                c.Moneda,
                c.MonedaAlquiler,
                c.MonedaMantenimiento,
                c.ImporteAlquiler AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), c.FechaCreacion, 23) AS Fecha,
                CONVERT(varchar(10), c.FechaInicio, 23) AS FechaInicio,
                CONVERT(varchar(10), c.FechaFin, 23) AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                inm.NombreInmueble AS Inmueble,
                u.NombreUnidad AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                resp.NombreEmpleado AS Responsable,
                c.Observaciones AS Observacion,
                'CONTRATO' AS Tipo
            FROM dbo.a_contrato c
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
            INNER JOIN dbo.a_inmueble inm ON inm.IdInmueble = c.IdInmueble
            LEFT JOIN dbo.a_unidad u ON u.IdUnidad = c.IdUnidadPrincipal
            LEFT JOIN dbo.EmpleadoCj resp ON resp.IdEmpleado = c.IdEmpleadoResponsable
            ORDER BY c.FechaCreacion DESC, c.IdContrato DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarObligacionesAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                o.IdObligacion AS Id,
                CONCAT('OBL-', o.IdObligacion) AS Codigo,
                c.CodigoContrato AS Nombre,
                CONCAT(CONVERT(varchar(10), o.PeriodoDesde, 23), ' - ', CONVERT(varchar(10), o.PeriodoHasta, 23)) AS Detalle,
                o.Estado,
                o.Moneda,
                o.TotalPagar AS Importe,
                o.SaldoPendiente AS Saldo,
                CONVERT(varchar(10), o.FechaCreacion, 23) AS Fecha,
                CONVERT(varchar(10), o.PeriodoDesde, 23) AS FechaInicio,
                CONVERT(varchar(10), o.PeriodoHasta, 23) AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                inm.NombreInmueble AS Inmueble,
                u.NombreUnidad AS Unidad,
                co.NombreConcepto AS Concepto,
                CONCAT(o.Anio, '-', RIGHT('00' + CAST(o.Mes AS varchar(2)), 2)) AS Periodo,
                NULL AS Responsable,
                o.Observacion,
                'OBLIGACION' AS Tipo
            FROM dbo.a_obligacion o
            INNER JOIN dbo.a_contrato c ON c.IdContrato = o.IdContrato
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
            INNER JOIN dbo.a_inmueble inm ON inm.IdInmueble = c.IdInmueble
            LEFT JOIN dbo.a_unidad u ON u.IdUnidad = o.IdUnidad
            INNER JOIN dbo.a_concepto co ON co.IdConcepto = o.IdConcepto
            ORDER BY o.FechaVencimiento DESC, o.IdObligacion DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarPagosAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                p.IdPago AS Id,
                p.NumeroOperacion AS Codigo,
                CONCAT(i.RazonSocial, ' / ', a.RazonSocial) AS Nombre,
                COALESCE(p.TipoTransferencia, p.ConceptoBanco, '') AS Detalle,
                p.EstadoValidacion AS Estado,
                p.MonedaOperacion AS Moneda,
                p.ImporteConvertido AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), p.FechaOperacion, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                resp.NombreEmpleado AS Responsable,
                p.Observacion,
                'PAGO' AS Tipo
            FROM dbo.a_pago p
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = p.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = p.IdInquilino
            LEFT JOIN dbo.EmpleadoCj resp ON resp.IdEmpleado = p.IdEmpleadoRegistrador
            ORDER BY p.FechaOperacion DESC, p.IdPago DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarFraccionamientosAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                f.IdFraccionamiento AS Id,
                f.NumeroFraccionamiento AS Codigo,
                c.CodigoContrato AS Nombre,
                CONCAT('Cuotas: ', f.CantidadCuotas) AS Detalle,
                f.Estado,
                f.Moneda,
                f.ImporteTotalFraccionado AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), f.FechaCreacion, 23) AS Fecha,
                CONVERT(varchar(10), f.FechaInicial, 23) AS FechaInicio,
                NULL AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                resp.NombreEmpleado AS Responsable,
                f.Motivo AS Observacion,
                'FRACCIONAMIENTO' AS Tipo
            FROM dbo.a_fraccionamiento f
            INNER JOIN dbo.a_contrato c ON c.IdContrato = f.IdContrato
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
            LEFT JOIN dbo.EmpleadoCj resp ON resp.IdEmpleado = f.IdEmpleadoAprueba
            ORDER BY f.FechaCreacion DESC, f.IdFraccionamiento DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarGarantiasAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                g.IdGarantia AS Id,
                CONCAT('GAR-', g.IdGarantia) AS Codigo,
                c.CodigoContrato AS Nombre,
                CONCAT('Pactada: ', FORMAT(g.GarantiaPactada, 'N2')) AS Detalle,
                g.Estado,
                c.Moneda,
                g.GarantiaPactada AS Importe,
                g.GarantiaPendiente AS Saldo,
                CONVERT(varchar(10), g.FechaCreacion, 23) AS Fecha,
                NULL AS FechaInicio,
                CONVERT(varchar(10), g.FechaDevolucion, 23) AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                g.MotivoRetencion AS Observacion,
                'GARANTIA' AS Tipo
            FROM dbo.a_garantia g
            INNER JOIN dbo.a_contrato c ON c.IdContrato = g.IdContrato
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
            ORDER BY g.FechaCreacion DESC, g.IdGarantia DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarArbitriosAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                ar.IdArbitrio AS Id,
                CONCAT('ARB-', ar.IdArbitrio) AS Codigo,
                c.CodigoContrato AS Nombre,
                ar.Periodicidad AS Detalle,
                ar.Estado,
                ar.Moneda,
                ar.MontoAnual AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), ar.FechaCreacion, 23) AS Fecha,
                CONVERT(varchar(10), ar.FechaInicio, 23) AS FechaInicio,
                CONVERT(varchar(10), ar.FechaFin, 23) AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                inm.NombreInmueble AS Inmueble,
                u.NombreUnidad AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                NULL AS Responsable,
                ar.Observacion,
                'ARBITRIO' AS Tipo
            FROM dbo.a_arbitrio ar
            INNER JOIN dbo.a_contrato c ON c.IdContrato = ar.IdContrato
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
            INNER JOIN dbo.a_inmueble inm ON inm.IdInmueble = ar.IdInmueble
            LEFT JOIN dbo.a_unidad u ON u.IdUnidad = ar.IdUnidad
            ORDER BY ar.FechaCreacion DESC, ar.IdArbitrio DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ListarTiposCambioAsync(CancellationToken cancellationToken = default)
        => QueryListAsync("""
            SELECT TOP (300)
                IdTipoCambioDiario AS Id,
                CONCAT(MonedaOrigen, '-', MonedaDestino) AS Codigo,
                CONVERT(varchar(10), FechaTipoCambio, 23) AS Nombre,
                CONCAT('Compra: ', CONVERT(varchar(40), Compra), ' / Venta: ', CONVERT(varchar(40), Venta)) AS Detalle,
                CASE WHEN Activo = 1 THEN 'ACTIVO' ELSE 'INACTIVO' END AS Estado,
                MonedaDestino AS Moneda,
                Promedio AS Importe,
                NULL AS Saldo,
                CONVERT(varchar(10), FechaTipoCambio, 23) AS Fecha,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                NULL AS Arrendador,
                NULL AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                NULL AS Concepto,
                NULL AS Periodo,
                Fuente AS Responsable,
                Observacion,
                'TIPO_CAMBIO' AS Tipo
            FROM dbo.a_tipo_cambio_diario
            ORDER BY FechaTipoCambio DESC, IdTipoCambioDiario DESC;
            """, cancellationToken);

    public Task<IReadOnlyList<ArrendamientosFilaDto>> ConsultarEstadoCuentaAsync(ArrendamientosEstadoCuentaFiltroDto filtro, CancellationToken cancellationToken = default)
    {
        const string sql = """
        SELECT TOP (1000)
            o.IdObligacion AS Id,
            CONCAT('OBL-', o.IdObligacion) AS Codigo,
            c.CodigoContrato AS Nombre,
            CONCAT(CONVERT(varchar(10), o.PeriodoDesde, 23), ' - ', CONVERT(varchar(10), o.PeriodoHasta, 23)) AS Detalle,
            o.Estado,
            o.Moneda,
            o.TotalPagar AS Importe,
            o.SaldoPendiente AS Saldo,
            CONVERT(varchar(10), o.FechaCreacion, 23) AS Fecha,
            CONVERT(varchar(10), o.PeriodoDesde, 23) AS FechaInicio,
            CONVERT(varchar(10), o.PeriodoHasta, 23) AS FechaFin,
            a.RazonSocial AS Arrendador,
            i.RazonSocial AS Inquilino,
            inm.NombreInmueble AS Inmueble,
            u.NombreUnidad AS Unidad,
            co.NombreConcepto AS Concepto,
            CONCAT(o.Anio, '-', RIGHT('00' + CAST(o.Mes AS varchar(2)), 2)) AS Periodo,
            NULL AS Responsable,
            o.Observacion,
            'ESTADO_CUENTA' AS Tipo
        FROM dbo.a_obligacion o
        INNER JOIN dbo.a_contrato c ON c.IdContrato = o.IdContrato
        INNER JOIN dbo.a_arrendador a ON a.IdArrendador = c.IdArrendador
        INNER JOIN dbo.a_inquilino i ON i.IdInquilino = c.IdInquilino
        INNER JOIN dbo.a_inmueble inm ON inm.IdInmueble = c.IdInmueble
        LEFT JOIN dbo.a_unidad u ON u.IdUnidad = o.IdUnidad
        INNER JOIN dbo.a_concepto co ON co.IdConcepto = o.IdConcepto
        WHERE (@IdContrato IS NULL OR o.IdContrato = @IdContrato)
          AND (@IdInquilino IS NULL OR c.IdInquilino = @IdInquilino)
          AND (@IdConcepto IS NULL OR o.IdConcepto = @IdConcepto)
        ORDER BY o.FechaVencimiento DESC, o.IdObligacion DESC;
        """;

        return QueryListAsync(sql, new
        {
            filtro.IdContrato,
            filtro.IdInquilino,
            filtro.IdConcepto
        }, cancellationToken);
    }

    public async Task<ArrendamientosCommandResultDto> GuardarArrendadorAsync(ArrendamientosCatalogoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpArrendadorGuardar, new
        {
            IdArrendador = request.Id,
            CodigoArrendador = request.Codigo,
            RazonSocial = request.Nombre,
            NombreComercial = request.Detalle,
            request.IdEmpleadoResponsable,
            request.Observacion,
            Activo = EsActivo(request.Estado),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_arrendador", result.Id ?? 0, request.Id is null ? "CREAR" : "EDITAR", request.Codigo, request.Nombre, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarInquilinoAsync(ArrendamientosCatalogoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpInquilinoGuardar, new
        {
            IdInquilino = request.Id,
            CodigoInquilino = request.Codigo,
            RazonSocial = request.Nombre,
            NombreComercial = request.Detalle,
            request.IdEmpleadoResponsable,
            request.Observacion,
            Activo = EsActivo(request.Estado),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_inquilino", result.Id ?? 0, request.Id is null ? "CREAR" : "EDITAR", request.Codigo, request.Nombre, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarInmuebleAsync(ArrendamientosInmuebleRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpInmuebleGuardar, new
        {
            IdInmueble = request.Id,
            CodigoInmueble = request.Codigo,
            NombreInmueble = request.Nombre,
            TipoInmueble = request.TipoInmueble,
            DireccionCompleta = request.Direccion,
            request.Ubigeo,
            request.Referencia,
            request.IdEmpleadoResponsable,
            request.Observacion,
            Activo = EsActivo(request.Estado),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_inmueble", result.Id ?? 0, request.Id is null ? "CREAR" : "EDITAR", request.Codigo, request.Nombre, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarUnidadAsync(ArrendamientosUnidadRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpUnidadGuardar, new
        {
            IdUnidad = request.Id,
            request.IdInmueble,
            CodigoUnidad = request.Codigo,
            NombreUnidad = request.Nombre,
            TipoUnidad = request.TipoUnidad,
            request.Piso,
            request.AreaM2,
            Descripcion = request.Detalle,
            request.Observacion,
            Activo = EsActivo(request.Estado),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_unidad", result.Id ?? 0, request.Id is null ? "CREAR" : "EDITAR", request.Codigo, request.Nombre, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarContratoAsync(ArrendamientosContratoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpContratoGuardar, new
        {
            IdContrato = request.IdContrato,
            request.CodigoContrato,
            request.IdArrendador,
            request.IdInquilino,
            request.IdInmueble,
            request.IdUnidadPrincipal,
            FechaFirma = request.FechaFirma?.ToDateTime(TimeOnly.MinValue),
            FechaInicio = request.FechaInicio.ToDateTime(TimeOnly.MinValue),
            FechaFin = request.FechaFin.ToDateTime(TimeOnly.MinValue),
            request.Moneda,
            request.MonedaAlquiler,
            request.MonedaMantenimiento,
            request.ImporteAlquiler,
            request.PeriodicidadAlquiler,
            request.DiaLimitePago,
            request.DiasGracia,
            request.ImporteMantenimiento,
            request.PeriodicidadMantenimiento,
            request.DiaLimiteMantenimiento,
            request.GarantiaPactada,
            request.GarantiaPagada,
            request.GarantiaPendiente,
            request.TipoReajuste,
            request.PorcentajeReajuste,
            request.FormulaReajuste,
            request.FrecuenciaReajuste,
            request.PenalidadMora,
            request.InteresMoratorio,
            request.EstadoContrato,
            request.Observaciones,
            request.DocumentoFirmadoNombre,
            request.DocumentoFirmadoUrl,
            request.DocumentoFirmadoTamanoKB,
            request.IdEmpleadoResponsable,
            FechaSuspension = request.FechaSuspension?.ToDateTime(TimeOnly.MinValue),
            FechaCancelacion = request.FechaCancelacion?.ToDateTime(TimeOnly.MinValue),
            request.MotivoCancelacion,
            request.Activo,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_contrato", result.Id ?? 0, request.IdContrato is null ? "CREAR" : "EDITAR", request.CodigoContrato, request.EstadoContrato, usuarioAccion, request.Observaciones, cancellationToken);
        return result;
    }

    public Task<ArrendamientosCommandResultDto> GuardarContratoUnidadAsync(ArrendamientosContratoUnidadRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
        => ExecuteSaveAsync(SpContratoUnidadGuardar, new
        {
            request.IdContratoUnidad,
            request.IdContrato,
            request.IdUnidad,
            FechaInicio = request.FechaInicio.ToDateTime(TimeOnly.MinValue),
            FechaFin = request.FechaFin?.ToDateTime(TimeOnly.MinValue),
            request.AreaM2,
            request.CanonMensual,
            request.Estado,
            request.Observacion,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

    public async Task<ArrendamientosCommandResultDto> GenerarObligacionesAsync(ArrendamientosObligacionGenerarRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var payload = request.Obligaciones.Select(item => new
        {
            item.IdContrato,
            item.IdContratoVersion,
            item.IdUnidad,
            item.IdConcepto,
            PeriodoDesde = item.PeriodoDesde.ToDateTime(TimeOnly.MinValue),
            PeriodoHasta = item.PeriodoHasta.ToDateTime(TimeOnly.MinValue),
            FechaEmision = item.FechaEmision.ToDateTime(TimeOnly.MinValue),
            FechaVencimiento = item.FechaVencimiento.ToDateTime(TimeOnly.MinValue),
            item.Moneda,
            item.TipoCambio,
            item.ImporteOriginal,
            item.ImporteConvertido,
            item.Interes,
            item.Penalidad,
            item.Descuento,
            item.Ajuste,
            item.Observacion,
            item.EsGeneradaAutomaticamente
        });

        var result = await ExecuteSaveAsync(SpObligacionGenerar, new
        {
            ObligacionesJson = System.Text.Json.JsonSerializer.Serialize(payload),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_obligacion", result.Id ?? 0, "GENERAR", "BATCH", "BATCH", usuarioAccion, "Generacion de obligaciones.", cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> RegistrarPagoAsync(ArrendamientosPagoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpPagoRegistrar, new
        {
            request.NumeroOperacion,
            FechaOperacion = request.FechaOperacion.ToDateTime(TimeOnly.MinValue),
            FechaContabilizacion = request.FechaContabilizacion?.ToDateTime(TimeOnly.MinValue),
            request.IdInquilino,
            request.IdArrendador,
            request.IdEmpleadoRegistrador,
            request.CuentaOrigen,
            request.CuentaDestino,
            request.Banco,
            request.MonedaOperacion,
            request.TipoCambio,
            request.ImporteTransferido,
            request.ComisionBancaria,
            request.Itf,
            request.ImporteTotalCargado,
            request.ImporteOriginal,
            request.ImporteConvertido,
            request.DiferenciaCambio,
            request.TipoTransferencia,
            request.ConceptoBanco,
            request.Observacion,
            request.VoucherNombre,
            request.VoucherExtension,
            request.VoucherTamanoBytes,
            request.VoucherRuta,
            request.VoucherUrl,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_pago", result.Id ?? 0, "CREAR", request.NumeroOperacion, request.MonedaOperacion, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public Task<ArrendamientosCommandResultDto> AprobarPagoAsync(int idPago, ArrendamientosPagoAprobacionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
        => ExecuteSaveAsync(SpPagoAprobar, new
        {
            IdPago = idPago,
            request.NivelAprobacion,
            request.Aprobado,
            request.IdEmpleadoAprobador,
            request.Observacion,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

    public Task<ArrendamientosCommandResultDto> AplicarPagoAsync(int idPago, ArrendamientosPagoAplicacionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
        => ExecuteSaveAsync(SpPagoAplicar, new
        {
            IdPago = idPago,
            AplicacionesJson = System.Text.Json.JsonSerializer.Serialize(request.Aplicaciones.Select(item => new
            {
                item.IdObligacion,
                item.IdConcepto,
                item.MonedaAplicacion,
                item.TipoCambioAplicado,
                item.ImporteAplicado,
                item.ImporteCapital,
                item.ImporteInteres,
                item.ImportePenalidad,
                item.ImporteDescuento,
                item.ImporteAjuste
            })),
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

    public Task<ArrendamientosCommandResultDto> RevertirPagoAsync(int idPago, string usuarioAccion, string? observacion, CancellationToken cancellationToken = default)
        => ExecuteSaveAsync(SpPagoRevertir, new { IdPago = idPago, UsuarioAccion = usuarioAccion, Observacion = observacion }, cancellationToken);

    public async Task<ArrendamientosCommandResultDto> GuardarFraccionamientoAsync(ArrendamientosFraccionamientoRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpFraccionamientoGuardar, new
        {
            request.NumeroFraccionamiento,
            request.IdInquilino,
            request.IdContrato,
            FechaFraccionamiento = request.FechaFraccionamiento.ToDateTime(TimeOnly.MinValue),
            request.ImporteTotalFraccionado,
            request.Moneda,
            request.CantidadCuotas,
            FechaInicial = request.FechaInicial.ToDateTime(TimeOnly.MinValue),
            request.Periodicidad,
            request.ImportePorCuota,
            request.CuotaFinalDiferente,
            request.InteresFraccionamiento,
            request.Estado,
            request.Motivo,
            request.DocumentoAceptacionNombre,
            request.DocumentoAceptacionUrl,
            request.IdEmpleadoAprueba,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_fraccionamiento", result.Id ?? 0, "CREAR", request.NumeroFraccionamiento, request.Estado, usuarioAccion, request.Motivo, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarGarantiaAsync(ArrendamientosGarantiaRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpGarantiaGuardar, new
        {
            request.IdGarantia,
            request.IdContrato,
            request.IdInquilino,
            request.GarantiaPactada,
            request.GarantiaPagada,
            request.GarantiaParcialPagada,
            request.GarantiaPendiente,
            request.GarantiaAplicadaDeudas,
            request.GarantiaDevuelta,
            request.GarantiaRetenida,
            request.GarantiaEjecutada,
            FechaDevolucion = request.FechaDevolucion?.ToDateTime(TimeOnly.MinValue),
            request.MotivoRetencion,
            request.DocumentosSustentatorios,
            request.Estado,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_garantia", result.Id ?? 0, request.IdGarantia is null ? "CREAR" : "EDITAR", request.IdContrato.ToString(), request.Estado, usuarioAccion, request.MotivoRetencion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarCobranzaGestionAsync(ArrendamientosCobranzaGestionRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpCobranzaRegistrar, new
        {
            request.IdContrato,
            request.IdInquilino,
            request.IdObligacion,
            request.TipoGestion,
            request.ResultadoGestion,
            CompromisoPagoFecha = request.CompromisoPagoFecha?.ToDateTime(TimeOnly.MinValue),
            request.CompromisoPagoImporte,
            request.Estado,
            request.Contacto,
            request.Observacion,
            request.IdEmpleadoGestor,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_cobranza_gestion", result.Id ?? 0, "CREAR", request.TipoGestion, request.Estado, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarArbitrioAsync(ArrendamientosArbitrioRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var detallesJson = System.Text.Json.JsonSerializer.Serialize(request.Detalles.Select(item => new
        {
            item.Anio,
            item.Mes,
            PeriodoDesde = item.PeriodoDesde.ToDateTime(TimeOnly.MinValue),
            PeriodoHasta = item.PeriodoHasta.ToDateTime(TimeOnly.MinValue),
            item.Importe,
            item.Estado,
            item.Observacion
        }));

        var result = await ExecuteSaveAsync(SpArbitrioGuardar, new
        {
            request.IdArbitrio,
            request.IdContrato,
            request.IdInmueble,
            request.IdUnidad,
            request.Periodicidad,
            request.MontoAnual,
            request.Moneda,
            FechaInicio = request.FechaInicio.ToDateTime(TimeOnly.MinValue),
            FechaFin = request.FechaFin?.ToDateTime(TimeOnly.MinValue),
            request.AplicaAreaComun,
            request.AplicaLocalPropio,
            request.Estado,
            request.Observacion,
            DetalleJson = detallesJson,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_arbitrio", result.Id ?? 0, request.IdArbitrio is null ? "CREAR" : "EDITAR", request.Periodicidad, request.Estado, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    public async Task<ArrendamientosCommandResultDto> GuardarTipoCambioAsync(ArrendamientosTipoCambioRequestDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        var result = await ExecuteSaveAsync(SpTipoCambioGuardar, new
        {
            request.IdTipoCambioDiario,
            FechaTipoCambio = request.FechaTipoCambio.ToDateTime(TimeOnly.MinValue),
            request.MonedaOrigen,
            request.MonedaDestino,
            request.Compra,
            request.Venta,
            request.Fuente,
            request.EsManual,
            request.Activo,
            request.Observacion,
            UsuarioAccion = usuarioAccion
        }, cancellationToken);

        await RegistrarAuditoriaAsync("Arrendamientos", "a_tipo_cambio_diario", result.Id ?? 0, request.IdTipoCambioDiario is null ? "CREAR" : "EDITAR", request.MonedaOrigen, request.MonedaDestino, usuarioAccion, request.Observacion, cancellationToken);
        return result;
    }

    private async Task<IReadOnlyList<ArrendamientosFilaDto>> QueryListAsync(
        string sql,
        object? parameters = null,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync<ArrendamientosFilaDto>(
            _sqlCommandFactory.Create(sql, parameters, cancellationToken: cancellationToken));
        return rows.ToList();
    }

    private async Task<ArrendamientosCommandResultDto> ExecuteSaveAsync(
        string storedProcedure,
        object parameters,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var row = await connection.QueryFirstOrDefaultAsync<StoredProcedureResultRow>(
            _sqlCommandFactory.Create(storedProcedure, parameters, CommandType.StoredProcedure, cancellationToken));

        return new ArrendamientosCommandResultDto
        {
            Success = row?.Exito is null || row.Exito == true,
            Message = row?.Mensaje ?? "Operacion ejecutada correctamente.",
            Id = row?.Id,
            IdSecundario = row?.IdSecundario,
            IdVersion = row?.IdVersion
        };
    }

    private static bool EsActivo(string? estado)
        => string.IsNullOrWhiteSpace(estado) || estado.Trim().Equals("ACTIVO", StringComparison.OrdinalIgnoreCase);

    private async Task RegistrarAuditoriaAsync(
        string modulo,
        string entidad,
        int idRegistro,
        string accion,
        string valorAnterior,
        string valorNuevo,
        string usuarioAccion,
        string? observacion,
        CancellationToken cancellationToken)
    {
        if (idRegistro <= 0)
        {
            return;
        }

        await _auditoriaCambiosService.RegistrarAsync(
            new AuditoriaCambioDto
            {
                Modulo = modulo,
                Entidad = entidad,
                IdRegistro = idRegistro.ToString(),
                Accion = accion,
            Seccion = "ARRENDAMIENTOS",
                Campo = "RESUMEN",
                ValorAnterior = valorAnterior,
                ValorNuevo = valorNuevo,
                UsuarioAccion = usuarioAccion,
                Observacion = observacion
            },
            cancellationToken);
    }

    private sealed class StoredProcedureResultRow
    {
        public bool? Exito { get; set; }
        public string? Mensaje { get; set; }
        public int? Id { get; set; }
        public int? IdSecundario { get; set; }
        public int? IdVersion { get; set; }
    }
}

// ROLLBACK-MARKER: ARRRENDAMIENTOS SERVICE END
