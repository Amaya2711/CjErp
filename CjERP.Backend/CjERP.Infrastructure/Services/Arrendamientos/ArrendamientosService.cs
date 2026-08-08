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
    private const string SpArrendamientoResumenAnual = "dbo.sp_Arrendamiento_ResumenAnual";
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

    public async Task<ArrendamientosDshPagosResponseDto> ObtenerDshPagosAsync(
        ArrendamientosDshPagosFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        const string sql = """
        SET NOCOUNT ON;

        DECLARE @IdInmuebleSeleccionado INT = @IdInmueble;
        DECLARE @IdInquilinoSeleccionado INT = @IdInquilino;

        IF OBJECT_ID('tempdb..#ContratosFiltrados') IS NOT NULL
        BEGIN
            DROP TABLE #ContratosFiltrados;
        END;

        SELECT
            a.IdContrato,
            a.CodigoContrato,
            a.IdInquilino,
            COALESCE(c.NombreComercial, c.RazonSocial) AS NombreInquilino,
            a.IdInmueble,
            b.NombreInmueble,
            a.EstadoContrato,
            CONVERT(varchar(10), a.FechaInicio, 23) AS FechaInicio,
            CONVERT(varchar(10), a.FechaFin, 23) AS FechaFin,
            a.Moneda,
            a.ImporteAlquiler,
            a.ImporteMantenimiento,
            COALESCE(a.ImporteCochera, 0) AS ImporteCochera
        INTO #ContratosFiltrados
        FROM dbo.a_contrato a
        LEFT JOIN dbo.a_inmueble b ON a.IdInmueble = b.IdInmueble
        LEFT JOIN dbo.a_inquilino c ON a.IdInquilino = c.IdInquilino
        WHERE a.Activo = 1
          AND (@IdInmuebleSeleccionado IS NULL OR a.IdInmueble = @IdInmuebleSeleccionado)
          AND (@IdInquilinoSeleccionado IS NULL OR a.IdInquilino = @IdInquilinoSeleccionado);

        IF @IdInquilinoSeleccionado IS NULL
        BEGIN
            SELECT TOP (1) @IdInquilinoSeleccionado = IdInquilino
            FROM #ContratosFiltrados
            ORDER BY NombreInquilino, NombreInmueble, CodigoContrato, IdContrato;
        END;

        SELECT
            @IdInmuebleSeleccionado AS IdInmuebleSeleccionado,
            @IdInquilinoSeleccionado AS IdInquilinoSeleccionado;

        SELECT
            IdInmueble,
            NombreInmueble
        FROM dbo.a_inmueble
        WHERE Activo = 1
        ORDER BY NombreInmueble;

        SELECT DISTINCT
            IdInquilino,
            NombreInquilino AS NombreComercial,
            IdInmueble,
            NombreInmueble
        FROM #ContratosFiltrados
        ORDER BY NombreComercial, NombreInmueble, IdInquilino;

        SELECT
            COUNT(1) AS ContratosActivos,
            ISNULL((
                SELECT COUNT(1)
                FROM dbo.a_obligacion o
                INNER JOIN #ContratosFiltrados cf ON cf.IdContrato = o.IdContrato
                WHERE o.Activo = 1
                  AND o.Estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
                  AND cf.IdInquilino = @IdInquilinoSeleccionado
            ), 0) AS ObligacionesPendientes,
            ISNULL((
                SELECT SUM(o.SaldoPendiente)
                FROM dbo.a_obligacion o
                INNER JOIN #ContratosFiltrados cf ON cf.IdContrato = o.IdContrato
                WHERE o.Activo = 1
                  AND cf.IdInquilino = @IdInquilinoSeleccionado
            ), 0) AS SaldoPendiente,
            ISNULL((
                SELECT SUM(p.ImporteConvertido)
                FROM dbo.a_pago p
                WHERE p.Activo = 1
                  AND p.IdInquilino = @IdInquilinoSeleccionado
                  AND p.EstadoValidacion IN ('APROBADO', 'PARCIAL')
            ), 0) AS PagosAplicados,
            (
                SELECT TOP (1) CONVERT(varchar(10), p.FechaOperacion, 23)
                FROM dbo.a_pago p
                WHERE p.Activo = 1
                  AND p.IdInquilino = @IdInquilinoSeleccionado
                ORDER BY p.FechaOperacion DESC, p.IdPago DESC
            ) AS UltimoPagoFecha,
            ISNULL((
                SELECT TOP (1) p.ImporteConvertido
                FROM dbo.a_pago p
                WHERE p.Activo = 1
                  AND p.IdInquilino = @IdInquilinoSeleccionado
                ORDER BY p.FechaOperacion DESC, p.IdPago DESC
            ), 0) AS UltimoPagoImporte,
            (
                SELECT TOP (1) p.MonedaOperacion
                FROM dbo.a_pago p
                WHERE p.Activo = 1
                  AND p.IdInquilino = @IdInquilinoSeleccionado
                ORDER BY p.FechaOperacion DESC, p.IdPago DESC
            ) AS MonedaBase
        FROM #ContratosFiltrados
        WHERE IdInquilino = @IdInquilinoSeleccionado;

        SELECT
            cf.IdContrato,
            cf.CodigoContrato,
            cf.NombreInmueble,
            cf.NombreInquilino,
            cf.EstadoContrato,
            cf.FechaInicio,
            cf.FechaFin,
            cf.Moneda,
            cf.ImporteAlquiler,
            cf.ImporteMantenimiento,
            cf.ImporteCochera,
            ISNULL(obl.TotalObligado, 0) AS TotalObligado,
            ISNULL(obl.SaldoPendiente, 0) AS SaldoPendiente,
            ISNULL(pag.TotalPagado, 0) AS TotalPagado,
            pag.UltimoPagoFecha,
            ISNULL(pag.UltimoPagoImporte, 0) AS UltimoPagoImporte
        FROM #ContratosFiltrados cf
        OUTER APPLY (
            SELECT
                SUM(o.TotalPagar) AS TotalObligado,
                SUM(o.SaldoPendiente) AS SaldoPendiente
            FROM dbo.a_obligacion o
            WHERE o.Activo = 1
              AND o.IdContrato = cf.IdContrato
        ) obl
        OUTER APPLY (
            SELECT
                SUM(p.ImporteConvertido) AS TotalPagado,
                (
                    SELECT TOP (1) CONVERT(varchar(10), p2.FechaOperacion, 23)
                    FROM dbo.a_pago p2
                    WHERE p2.Activo = 1
                      AND p2.IdInquilino = cf.IdInquilino
                    ORDER BY p2.FechaOperacion DESC, p2.IdPago DESC
                ) AS UltimoPagoFecha,
                (
                    SELECT TOP (1) p2.ImporteConvertido
                    FROM dbo.a_pago p2
                    WHERE p2.Activo = 1
                      AND p2.IdInquilino = cf.IdInquilino
                    ORDER BY p2.FechaOperacion DESC, p2.IdPago DESC
                ) AS UltimoPagoImporte
            FROM dbo.a_pago p
            WHERE p.Activo = 1
              AND p.IdInquilino = cf.IdInquilino
        ) pag
        WHERE cf.IdInquilino = @IdInquilinoSeleccionado
        ORDER BY cf.FechaInicio DESC, cf.IdContrato DESC;

        SELECT
            x.IdMovimiento,
            x.TipoMovimiento,
            x.CodigoContrato,
            x.NombreInmueble,
            x.NombreInquilino,
            x.Concepto,
            x.Periodo,
            x.Estado,
            x.Fecha,
            x.Moneda,
            x.Importe,
            x.Saldo,
            x.Observacion
        FROM (
            SELECT
                o.IdObligacion AS IdMovimiento,
                'OBLIGACION' AS TipoMovimiento,
                cf.CodigoContrato,
                cf.NombreInmueble,
                cf.NombreInquilino,
                co.NombreConcepto AS Concepto,
                CONCAT(o.Anio, '-', RIGHT('00' + CAST(o.Mes AS varchar(2)), 2)) AS Periodo,
                o.Estado,
                CONVERT(varchar(10), o.FechaVencimiento, 23) AS Fecha,
                o.Moneda,
                o.TotalPagar AS Importe,
                o.SaldoPendiente AS Saldo,
                o.Observacion
            FROM dbo.a_obligacion o
            INNER JOIN #ContratosFiltrados cf ON cf.IdContrato = o.IdContrato
            INNER JOIN dbo.a_concepto co ON co.IdConcepto = o.IdConcepto
            WHERE o.Activo = 1
              AND cf.IdInquilino = @IdInquilinoSeleccionado

            UNION ALL

            SELECT
                p.IdPago AS IdMovimiento,
                'PAGO' AS TipoMovimiento,
                ct.CodigoContrato,
                ct.NombreInmueble,
                ct.NombreInquilino,
                COALESCE(p.ConceptoPago, p.TipoPago) AS Concepto,
                NULL AS Periodo,
                p.EstadoValidacion AS Estado,
                CONVERT(varchar(10), p.FechaOperacion, 23) AS Fecha,
                p.MonedaOperacion AS Moneda,
                p.ImporteConvertido AS Importe,
                CAST(0 AS decimal(18,2)) AS Saldo,
                p.Observacion
            FROM dbo.a_pago p
            OUTER APPLY (
                SELECT TOP (1)
                    cf.CodigoContrato,
                    cf.NombreInmueble,
                    cf.NombreInquilino
                FROM #ContratosFiltrados cf
                WHERE cf.IdInquilino = p.IdInquilino
                ORDER BY cf.FechaInicio DESC, cf.IdContrato DESC
            ) ct
            WHERE p.Activo = 1
              AND p.IdInquilino = @IdInquilinoSeleccionado
              AND (@IdInmuebleSeleccionado IS NULL OR EXISTS (
                    SELECT 1
                    FROM #ContratosFiltrados cf2
                    WHERE cf2.IdInquilino = p.IdInquilino
                      AND cf2.IdInmueble = @IdInmuebleSeleccionado
              ))
        ) x
        ORDER BY x.Fecha DESC, x.IdMovimiento DESC;
        """;

        await using var connection = _sqlCommandFactory.CreateConnection();
        var reader = await connection.QueryMultipleAsync(
            _sqlCommandFactory.Create(
                sql,
                new
                {
                    filtro.IdInmueble,
                    filtro.IdInquilino
                },
                cancellationToken: cancellationToken));

        var seleccion = await reader.ReadSingleAsync<ArrendamientosDshPagosSeleccionDto>();
        var inmuebles = (await reader.ReadAsync<ArrendamientosDshPagosInmuebleDto>()).ToList();
        var inquilinos = (await reader.ReadAsync<ArrendamientosDshPagosInquilinoDto>()).ToList();
        var kpi = await reader.ReadSingleOrDefaultAsync<ArrendamientosDshPagosKpiDto>() ?? new ArrendamientosDshPagosKpiDto();
        var principal = (await reader.ReadAsync<ArrendamientosDshPagosPrincipalDto>()).ToList();
        var detalle = (await reader.ReadAsync<ArrendamientosDshPagosDetalleDto>()).ToList();

        return new ArrendamientosDshPagosResponseDto
        {
            IdInmuebleSeleccionado = seleccion.IdInmuebleSeleccionado,
            IdInquilinoSeleccionado = seleccion.IdInquilinoSeleccionado,
            Inmuebles = inmuebles,
            Inquilinos = inquilinos,
            Kpi = kpi,
            Principal = principal,
            Detalle = detalle
        };
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
            WHERE ISNULL(Activo, 0) = 1
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

    public async Task<IReadOnlyList<ArrendamientosFilaDto>> ListarContratosAsync(CancellationToken cancellationToken = default)
    {
        var monedaCocheraSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_contrato",
            "MonedaCochera",
            "c.MonedaCochera",
            "NULL AS MonedaCochera",
            cancellationToken);
        var monedaGarantiaSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_contrato",
            "MonedaGarantia",
            "c.MonedaGarantia",
            "NULL AS MonedaGarantia",
            cancellationToken);

        var sql = $"""
            SELECT TOP (300)
                c.IdContrato AS Id,
                c.CodigoContrato AS Codigo,
                CONCAT(a.RazonSocial, ' / ', i.RazonSocial) AS Nombre,
                COALESCE(u.NombreUnidad, 'Sin unidad') AS Detalle,
                c.EstadoContrato AS Estado,
                c.Moneda,
                c.MonedaAlquiler,
                c.MonedaMantenimiento,
                {monedaCocheraSelect},
                {monedaGarantiaSelect},
                c.ImporteAlquiler AS Importe,
                c.ImporteAlquiler AS ImporteAlquiler,
                c.ImporteMantenimiento AS ImporteMantenimiento,
                c.ImporteCochera AS ImporteCochera,
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
            """;

        return await QueryListAsync(sql, cancellationToken: cancellationToken);
    }

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

    public async Task<IReadOnlyList<ArrendamientosFilaDto>> ListarPagosAsync(CancellationToken cancellationToken = default)
    {
        var tipoPagoSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_pago",
            "TipoPago",
            "p.TipoPago",
            "'COMPLETO' AS TipoPago",
            cancellationToken);
        var conceptoPagoSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_pago",
            "ConceptoPago",
            "p.ConceptoPago",
            "NULL",
            cancellationToken);

        return await QueryListAsync($"""
            SELECT TOP (300)
                p.IdPago AS Id,
                p.NumeroOperacion AS Codigo,
                CONCAT(i.RazonSocial, ' / ', a.RazonSocial) AS Nombre,
                COALESCE(p.TipoTransferencia, p.ConceptoBanco, '') AS Detalle,
                p.EstadoValidacion AS Estado,
                {tipoPagoSelect},
                p.MonedaOperacion AS Moneda,
                p.TipoCambio,
                p.ImporteTransferido,
                p.ComisionBancaria,
                p.Itf,
                p.ImporteTotalCargado,
                p.ImporteOriginal,
                p.ImporteConvertido AS Importe,
                p.ImporteConvertido,
                p.DiferenciaCambio,
                NULL AS Saldo,
                CONVERT(varchar(10), p.FechaOperacion, 23) AS Fecha,
                CONVERT(varchar(10), p.FechaContabilizacion, 23) AS FechaContabilizacion,
                NULL AS FechaInicio,
                NULL AS FechaFin,
                a.RazonSocial AS Arrendador,
                i.RazonSocial AS Inquilino,
                NULL AS Inmueble,
                NULL AS Unidad,
                {conceptoPagoSelect} AS ConceptoPago,
                {conceptoPagoSelect} AS Concepto,
                NULL AS Periodo,
                resp.NombreEmpleado AS Responsable,
                p.CuentaOrigen,
                p.CuentaDestino,
                p.Banco,
                p.TipoTransferencia,
                p.ConceptoBanco,
                p.Observacion,
                p.VoucherNombre,
                p.VoucherExtension,
                p.VoucherTamanoBytes,
                p.VoucherRuta,
                p.VoucherUrl,
                'PAGO' AS Tipo
            FROM dbo.a_pago p
            INNER JOIN dbo.a_arrendador a ON a.IdArrendador = p.IdArrendador
            INNER JOIN dbo.a_inquilino i ON i.IdInquilino = p.IdInquilino
            LEFT JOIN dbo.EmpleadoCj resp ON resp.IdEmpleado = p.IdEmpleadoRegistrador
            ORDER BY p.FechaOperacion DESC, p.IdPago DESC;
            """, cancellationToken);
    }

    public async Task<IReadOnlyList<ArrendamientosFilaDto>> ListarPagosDshResumenAnualAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync(
            _sqlCommandFactory.Create(SpArrendamientoResumenAnual, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken));

        return rows
            .Select(MapResumenAnualRow)
            .ToList();
    }

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

    public async Task<IReadOnlyList<ArrendamientosFilaDto>> ListarGarantiasAsync(CancellationToken cancellationToken = default)
    {
        var monedaGarantiaSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_contrato",
            "MonedaGarantia",
            "c.MonedaGarantia",
            "c.Moneda",
            cancellationToken);

        return await QueryListAsync($"""
            SELECT TOP (300)
                g.IdGarantia AS Id,
                CONCAT('GAR-', g.IdGarantia) AS Codigo,
                c.CodigoContrato AS Nombre,
                CONCAT('Pactada: ', FORMAT(g.GarantiaPactada, 'N2')) AS Detalle,
                g.Estado,
                {monedaGarantiaSelect},
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
    }

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
        var parametros = new DynamicParameters();
        parametros.Add("IdContrato", request.IdContrato);
        parametros.Add("CodigoContrato", request.CodigoContrato);
        parametros.Add("IdArrendador", request.IdArrendador);
        parametros.Add("IdInquilino", request.IdInquilino);
        parametros.Add("IdInmueble", request.IdInmueble);
        parametros.Add("IdUnidadPrincipal", request.IdUnidadPrincipal);
        parametros.Add("FechaFirma", request.FechaFirma?.ToDateTime(TimeOnly.MinValue));
        parametros.Add("FechaInicio", request.FechaInicio.ToDateTime(TimeOnly.MinValue));
        parametros.Add("FechaFin", request.FechaFin.ToDateTime(TimeOnly.MinValue));
        parametros.Add("Moneda", request.Moneda);
        parametros.Add("MonedaAlquiler", request.MonedaAlquiler);
        parametros.Add("MonedaMantenimiento", request.MonedaMantenimiento);
        parametros.Add("ImporteAlquiler", request.ImporteAlquiler);
        parametros.Add("PeriodicidadAlquiler", request.PeriodicidadAlquiler);
        parametros.Add("DiaLimitePago", request.DiaLimitePago);
        parametros.Add("DiasGracia", request.DiasGracia);
        parametros.Add("ImporteMantenimiento", request.ImporteMantenimiento);
        parametros.Add("PeriodicidadMantenimiento", request.PeriodicidadMantenimiento);
        parametros.Add("DiaLimiteMantenimiento", request.DiaLimiteMantenimiento);
        parametros.Add("GarantiaPactada", request.GarantiaPactada);
        parametros.Add("GarantiaPagada", request.GarantiaPagada);
        parametros.Add("GarantiaPendiente", request.GarantiaPendiente);
        parametros.Add("TipoReajuste", request.TipoReajuste);
        parametros.Add("PorcentajeReajuste", request.PorcentajeReajuste);
        parametros.Add("FormulaReajuste", request.FormulaReajuste);
        parametros.Add("FrecuenciaReajuste", request.FrecuenciaReajuste);
        parametros.Add("PenalidadMora", request.PenalidadMora);
        parametros.Add("InteresMoratorio", request.InteresMoratorio);
        parametros.Add("EstadoContrato", request.EstadoContrato);
        parametros.Add("Observaciones", request.Observaciones);
        parametros.Add("DocumentoFirmadoNombre", request.DocumentoFirmadoNombre);
        parametros.Add("DocumentoFirmadoUrl", request.DocumentoFirmadoUrl);
        parametros.Add("DocumentoFirmadoTamanoKB", request.DocumentoFirmadoTamanoKB);
        parametros.Add("IdEmpleadoResponsable", request.IdEmpleadoResponsable);
        parametros.Add("FechaSuspension", request.FechaSuspension?.ToDateTime(TimeOnly.MinValue));
        parametros.Add("FechaCancelacion", request.FechaCancelacion?.ToDateTime(TimeOnly.MinValue));
        parametros.Add("MotivoCancelacion", request.MotivoCancelacion);
        parametros.Add("Activo", request.Activo);
        parametros.Add("UsuarioAccion", usuarioAccion);

        if (await ExisteParametroProcedimientoAsync(SpContratoGuardar, "MonedaCochera", cancellationToken))
        {
            parametros.Add("MonedaCochera", request.MonedaCochera);
        }

        if (await ExisteParametroProcedimientoAsync(SpContratoGuardar, "MonedaGarantia", cancellationToken))
        {
            parametros.Add("MonedaGarantia", request.MonedaGarantia);
        }

        if (await ExisteParametroProcedimientoAsync(SpContratoGuardar, "ImporteCochera", cancellationToken))
        {
            parametros.Add("ImporteCochera", request.ImporteCochera);
        }

        if (await ExisteParametroProcedimientoAsync(SpContratoGuardar, "PeriodicidadCochera", cancellationToken))
        {
            parametros.Add("PeriodicidadCochera", request.PeriodicidadCochera);
        }

        if (await ExisteParametroProcedimientoAsync(SpContratoGuardar, "DiaLimiteCochera", cancellationToken))
        {
            parametros.Add("DiaLimiteCochera", request.DiaLimiteCochera);
        }

        var result = await ExecuteSaveAsync(SpContratoGuardar, parametros, cancellationToken);

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
        var contratoIds = request.Obligaciones
            .Select(item => item.IdContrato)
            .Where(id => id > 0)
            .Distinct()
            .ToArray();

        var conceptoIds = request.Obligaciones
            .Select(item => item.IdConcepto)
            .Where(id => id > 0)
            .Distinct()
            .ToArray();

        var monedasContrato = await ObtenerMonedasContratoAsync(contratoIds, cancellationToken);
        var codigosConcepto = await ObtenerCodigosConceptoAsync(conceptoIds, cancellationToken);

        var payload = request.Obligaciones.Select(item =>
        {
            var contrato = monedasContrato.TryGetValue(item.IdContrato, out var monedaContrato) ? monedaContrato : null;
            var codigoConcepto = codigosConcepto.TryGetValue(item.IdConcepto, out var codigo) ? codigo : null;
            var moneda = ResolverMonedaObligacion(item.Moneda, codigoConcepto, contrato);

            return new
            {
                item.IdContrato,
                item.IdContratoVersion,
                item.IdUnidad,
                item.IdConcepto,
                PeriodoDesde = item.PeriodoDesde.ToDateTime(TimeOnly.MinValue),
                PeriodoHasta = item.PeriodoHasta.ToDateTime(TimeOnly.MinValue),
                FechaEmision = item.FechaEmision.ToDateTime(TimeOnly.MinValue),
                FechaVencimiento = item.FechaVencimiento.ToDateTime(TimeOnly.MinValue),
                Moneda = moneda,
                item.TipoCambio,
                item.ImporteOriginal,
                item.ImporteConvertido,
                item.Interes,
                item.Penalidad,
                item.Descuento,
                item.Ajuste,
                item.Observacion,
                item.EsGeneradaAutomaticamente
            };
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
        request.TipoPago = NormalizarTipoPago(request.TipoPago);
        request.ConceptoPago = NormalizarConceptoPago(request.ConceptoPago);
        await ValidarPagoCompletoDuplicadoAsync(request, cancellationToken);
        ArrendamientosCommandResultDto result;

        if (request.IdPago.GetValueOrDefault() > 0 && !await ExisteParametroProcedimientoAsync(SpPagoRegistrar, "IdPago", cancellationToken))
        {
            result = await ActualizarPagoDirectoAsync(request, usuarioAccion, cancellationToken);
        }
        else
        {
            result = await ExecuteSaveAsync(SpPagoRegistrar, new
            {
                request.IdPago,
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
                request.TipoPago,
                request.ConceptoPago,
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
        }

        var accionAuditoria = request.IdPago.GetValueOrDefault() > 0 ? "MODIFICAR" : "CREAR";
        await RegistrarAuditoriaAsync("Arrendamientos", "a_pago", result.Id ?? 0, accionAuditoria, request.NumeroOperacion, request.MonedaOperacion, usuarioAccion, request.Observacion, cancellationToken);
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
        var compatibleParameters = await BuildCompatibleParametersAsync(connection, storedProcedure, parameters, cancellationToken);
        var row = await connection.QueryFirstOrDefaultAsync<StoredProcedureResultRow>(
            _sqlCommandFactory.Create(storedProcedure, compatibleParameters, CommandType.StoredProcedure, cancellationToken));

        return new ArrendamientosCommandResultDto
        {
            Success = row?.Exito is null || row.Exito == true,
            Message = row?.Mensaje ?? "Operacion ejecutada correctamente.",
            Id = row?.Id,
            IdSecundario = row?.IdSecundario,
            IdVersion = row?.IdVersion
        };
    }

    private async Task<DynamicParameters> BuildCompatibleParametersAsync(
        Microsoft.Data.SqlClient.SqlConnection connection,
        string storedProcedure,
        object parameters,
        CancellationToken cancellationToken)
    {
        var allowedParameters = await connection.QueryAsync<string>(
            _sqlCommandFactory.Create(
                """
                SELECT p.name
                FROM sys.parameters p
                INNER JOIN sys.objects o ON o.object_id = p.object_id
                WHERE o.object_id = OBJECT_ID(@StoredProcedure)
                """,
                new { StoredProcedure = storedProcedure },
                cancellationToken: cancellationToken));

        var allowed = new HashSet<string>(
            allowedParameters.Select(name => name.TrimStart('@')),
            StringComparer.OrdinalIgnoreCase);

        var dynamicParameters = new DynamicParameters();
        foreach (var property in parameters.GetType().GetProperties())
        {
            if (!allowed.Contains(property.Name))
            {
                continue;
            }

            dynamicParameters.Add(property.Name, property.GetValue(parameters));
        }

        return dynamicParameters;
    }

    private async Task<bool> ExisteColumnaAsync(string tabla, string columna, CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var result = await connection.ExecuteScalarAsync<int>(
            _sqlCommandFactory.Create(
                $"SELECT CASE WHEN COL_LENGTH('{tabla}', '{columna}') IS NULL THEN 0 ELSE 1 END;",
                cancellationToken: cancellationToken));
        return result == 1;
    }

    private async Task<bool> ExisteParametroProcedimientoAsync(string procedimiento, string parametro, CancellationToken cancellationToken)
    {
        var nombreProcedimiento = procedimiento.Contains('.') ? procedimiento[(procedimiento.LastIndexOf('.') + 1)..] : procedimiento;

        await using var connection = _sqlCommandFactory.CreateConnection();
        var result = await connection.ExecuteScalarAsync<int>(
            _sqlCommandFactory.Create(
                $"""
                SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM sys.parameters p
                    INNER JOIN sys.objects o ON o.object_id = p.object_id
                    WHERE o.name = '{nombreProcedimiento}'
                      AND p.name = '@{parametro}'
                ) THEN 1 ELSE 0 END;
                """,
                cancellationToken: cancellationToken));
        return result == 1;
    }

    private async Task<string> ObtenerSelectColumnaAsync(
        string tabla,
        string columna,
        string selectExiste,
        string selectNoExiste,
        CancellationToken cancellationToken)
        => await ExisteColumnaAsync(tabla, columna, cancellationToken) ? selectExiste : selectNoExiste;

    private static bool EsActivo(string? estado)
        => string.IsNullOrWhiteSpace(estado) || estado.Trim().Equals("ACTIVO", StringComparison.OrdinalIgnoreCase);

    private static ArrendamientosFilaDto MapResumenAnualRow(object row)
    {
        var values = ToCaseInsensitiveDictionary(row);

        var contrato = GetDecimal(values,
            "ImporteContrato",
            "MontoContrato",
            "Contrato",
            "MontoDebe",
            "Debe",
            "Importe",
            "Monto");

        var pagado = GetDecimal(values,
            "ImportePagado",
            "MontoPagado",
            "Pagado",
            "MontoHaber",
            "Haber",
            "Pago");

        var saldo = GetDecimal(values,
            "Saldo",
            "Pendiente",
            "Diferencia",
            "MontoPendiente");

        if (!pagado.HasValue && contrato.HasValue && saldo.HasValue)
        {
            pagado = contrato.Value - saldo.Value;
        }

        if (!saldo.HasValue && contrato.HasValue && pagado.HasValue)
        {
            saldo = contrato.Value - pagado.Value;
        }

        var periodo = GetString(values,
            "Periodo",
            "PeriodoAnual",
            "Anio",
            "Año",
            "Ejercicio",
            "Year");

        if (string.IsNullOrWhiteSpace(periodo))
        {
            var anio = GetInt(values, "Anio", "Año", "Ejercicio", "Year");
            if (anio.HasValue)
            {
                periodo = anio.Value.ToString();
            }
        }

        return new ArrendamientosFilaDto
        {
            Id = GetInt(values, "Id", "IdRegistro", "IdDetalle"),
            Codigo = GetString(values, "Codigo", "CodigoContrato", "Contrato"),
            Nombre = GetString(values, "Nombre", "Contrato", "Descripcion"),
            Detalle = GetString(values, "Detalle", "Descripcion", "Glosa"),
            Estado = GetString(values, "Estado"),
            Moneda = GetString(values, "Moneda", "MonedaOperacion", "Currency"),
            Importe = contrato,
            ImporteTransferido = pagado,
            Saldo = pagado,
            Fecha = GetString(values, "Fecha", "FechaPago", "FechaOperacion", "FechaContabilizacion"),
            Arrendador = GetString(values, "Arrendador", "Propietario"),
            Inquilino = GetString(values, "Inquilino", "Cliente", "RazonSocial", "RazonSocialInquilino", "NombreInquilino", "NomInquilino")
                ?? GetStringByContains(values, "inquilin"),
            Inmueble = GetString(values, "Inmueble", "NombreInmueble", "Local", "Predio"),
            Unidad = GetString(values, "Unidad"),
            Concepto = GetString(values, "Concepto", "Servicio", "TipoConcepto", "ConceptoPago", "TipoPago"),
            Periodo = periodo,
            Observacion = GetString(values, "Observacion", "Comentario"),
            Tipo = "PAGOS_DSH_RESUMEN_ANUAL"
        };
    }

    private static Dictionary<string, object?> ToCaseInsensitiveDictionary(object row)
    {
        if (row is IDictionary<string, object> dictionary)
        {
            return dictionary.ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);
        }

        if (row is IDictionary<string, object?> nullableDictionary)
        {
            return nullableDictionary.ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);
        }

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
    }

    private static object? GetValue(Dictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value))
            {
                continue;
            }

            if (value is null || value is DBNull)
            {
                continue;
            }

            return value;
        }

        return null;
    }

    private static string? GetString(Dictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        var text = value?.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static string? GetStringByContains(Dictionary<string, object?> values, string fragment)
    {
        if (string.IsNullOrWhiteSpace(fragment))
        {
            return null;
        }

        foreach (var kvp in values)
        {
            if (!kvp.Key.Contains(fragment, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var text = kvp.Value?.ToString()?.Trim();
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text;
            }
        }

        return null;
    }

    private static decimal? GetDecimal(Dictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return value switch
        {
            decimal d => d,
            double d when !double.IsNaN(d) && !double.IsInfinity(d) => Convert.ToDecimal(d),
            float f when !float.IsNaN(f) && !float.IsInfinity(f) => Convert.ToDecimal(f),
            int i => i,
            long l => l,
            short s => s,
            byte b => b,
            string text when decimal.TryParse(text, out var parsed) => parsed,
            _ => decimal.TryParse(Convert.ToString(value), out var parsed) ? parsed : null
        };
    }

    private static int? GetInt(Dictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return value switch
        {
            int i => i,
            long l when l >= int.MinValue && l <= int.MaxValue => (int)l,
            short s => s,
            byte b => b,
            decimal d when d >= int.MinValue && d <= int.MaxValue => (int)d,
            string text when int.TryParse(text, out var parsed) => parsed,
            _ => int.TryParse(Convert.ToString(value), out var parsed) ? parsed : null
        };
    }

    private static void ValidarPagoRequest(ArrendamientosPagoRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.NumeroOperacion))
        {
            throw new InvalidOperationException("Debe indicar el numero de operacion.");
        }

        if (request.FechaOperacion == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha de operacion.");
        }

        if (request.FechaContabilizacion is null)
        {
            throw new InvalidOperationException("Debe indicar la fecha de contabilizacion.");
        }

        if (request.IdArrendador <= 0)
        {
            throw new InvalidOperationException("Debe indicar el arrendador.");
        }

        if (request.IdInquilino <= 0)
        {
            throw new InvalidOperationException("Debe indicar el inquilino.");
        }

        if (string.IsNullOrWhiteSpace(request.MonedaOperacion))
        {
            throw new InvalidOperationException("Debe indicar la moneda de operacion.");
        }

        if (string.IsNullOrWhiteSpace(request.TipoPago))
        {
            throw new InvalidOperationException("Debe indicar el tipo de pago.");
        }

        if (string.IsNullOrWhiteSpace(request.ConceptoPago))
        {
            throw new InvalidOperationException("Debe indicar el concepto del pago.");
        }
    }

    private async Task ValidarPagoCompletoDuplicadoAsync(ArrendamientosPagoRequestDto request, CancellationToken cancellationToken)
    {
        if (!string.Equals(request.TipoPago?.Trim(), "COMPLETO", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (request.FechaContabilizacion is null)
        {
            throw new InvalidOperationException("Debe indicar la fecha de contabilizacion.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        var existe = await connection.ExecuteScalarAsync<int>(
            """
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.a_pago
                WHERE IdInquilino = @IdInquilino
                  AND UPPER(LTRIM(RTRIM(ConceptoPago))) = @ConceptoPago
                  AND UPPER(LTRIM(RTRIM(TipoPago))) = 'COMPLETO'
                  AND YEAR(FechaContabilizacion) = @AnioContabilizacion
                  AND MONTH(FechaContabilizacion) = @MesContabilizacion
                  AND (@IdPago IS NULL OR IdPago <> @IdPago)
            ) THEN 1 ELSE 0 END;
            """,
            new
            {
                request.IdInquilino,
                request.ConceptoPago,
                AnioContabilizacion = request.FechaContabilizacion.Value.Year,
                MesContabilizacion = request.FechaContabilizacion.Value.Month,
                request.IdPago
            });

        if (existe == 1)
        {
            throw new InvalidOperationException("Ya existe un pago COMPLETO para el mismo inquilino, concepto y periodo de contabilizacion.");
        }
    }

    private async Task<ArrendamientosCommandResultDto> ActualizarPagoDirectoAsync(
        ArrendamientosPagoRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var estadoActual = await connection.ExecuteScalarAsync<string?>(
                """
                SELECT EstadoValidacion
                FROM dbo.a_pago
                WHERE IdPago = @IdPago;
                """,
                new { request.IdPago },
                transaction: transaction);

            if (estadoActual is null)
            {
                throw new InvalidOperationException("No existe el pago indicado para actualizar.");
            }

            if (!estadoActual.Equals("PENDIENTE", StringComparison.OrdinalIgnoreCase)
                && !estadoActual.Equals("RECHAZADO", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Solo se pueden editar pagos pendientes o rechazados.");
            }

            var duplicado = await connection.ExecuteScalarAsync<int>(
                """
                SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.a_pago
                    WHERE NumeroOperacion = @NumeroOperacion
                      AND FechaOperacion = @FechaOperacion
                      AND IdInquilino = @IdInquilino
                      AND IdArrendador = @IdArrendador
                      AND IdPago <> @IdPago
                ) THEN 1 ELSE 0 END;
                """,
                new
                {
                    request.NumeroOperacion,
                    FechaOperacion = request.FechaOperacion.ToDateTime(TimeOnly.MinValue),
                    request.IdInquilino,
                    request.IdArrendador,
                    request.IdPago
                },
                transaction: transaction);

            if (duplicado == 1)
            {
                throw new InvalidOperationException("Ya existe un pago con el mismo numero de operacion.");
            }

            var duplicadoPeriodoCompleto = await connection.ExecuteScalarAsync<int>(
                """
                SELECT CASE WHEN EXISTS (
                    SELECT 1
                    FROM dbo.a_pago
                    WHERE IdInquilino = @IdInquilino
                      AND UPPER(LTRIM(RTRIM(ConceptoPago))) = @ConceptoPago
                      AND UPPER(LTRIM(RTRIM(TipoPago))) = 'COMPLETO'
                      AND YEAR(FechaContabilizacion) = @AnioContabilizacion
                      AND MONTH(FechaContabilizacion) = @MesContabilizacion
                      AND IdPago <> @IdPago
                ) THEN 1 ELSE 0 END;
                """,
                new
                {
                    request.IdInquilino,
                    request.ConceptoPago,
                    AnioContabilizacion = request.FechaContabilizacion?.Year,
                    MesContabilizacion = request.FechaContabilizacion?.Month,
                    request.IdPago
                },
                transaction: transaction);

            if (duplicadoPeriodoCompleto == 1)
            {
                throw new InvalidOperationException("Ya existe un pago COMPLETO para el mismo inquilino, concepto y periodo de contabilizacion.");
            }

            var tieneTipoPago = await ExisteColumnaAsync("dbo.a_pago", "TipoPago", cancellationToken);
            var tieneConceptoPago = await ExisteColumnaAsync("dbo.a_pago", "ConceptoPago", cancellationToken);

            var sqlUpdate = """
                UPDATE dbo.a_pago
                SET NumeroOperacion = @NumeroOperacion,
                    FechaOperacion = @FechaOperacion,
                    FechaContabilizacion = @FechaContabilizacion,
                    IdInquilino = @IdInquilino,
                    IdArrendador = @IdArrendador,
                    IdEmpleadoRegistrador = @IdEmpleadoRegistrador,
                    CuentaOrigen = @CuentaOrigen,
                    CuentaDestino = @CuentaDestino,
                    Banco = @Banco,
                    MonedaOperacion = @MonedaOperacion,
                """;

            if (tieneTipoPago)
            {
                sqlUpdate += """
                    TipoPago = @TipoPago,
                    """;
            }

            if (tieneConceptoPago)
            {
                sqlUpdate += """
                    ConceptoPago = @ConceptoPago,
                    """;
            }

            sqlUpdate += """
                    TipoCambio = @TipoCambio,
                    ImporteTransferido = @ImporteTransferido,
                    ComisionBancaria = @ComisionBancaria,
                    Itf = @Itf,
                    ImporteTotalCargado = @ImporteTotalCargado,
                    ImporteOriginal = @ImporteOriginal,
                    ImporteConvertido = @ImporteConvertido,
                    DiferenciaCambio = @DiferenciaCambio,
                    TipoTransferencia = @TipoTransferencia,
                    ConceptoBanco = @ConceptoBanco,
                    Observacion = @Observacion,
                    VoucherNombre = @VoucherNombre,
                    VoucherExtension = @VoucherExtension,
                    VoucherTamanoBytes = @VoucherTamanoBytes,
                    VoucherRuta = @VoucherRuta,
                    VoucherUrl = @VoucherUrl,
                    EstadoValidacion = 'PENDIENTE',
                    UsuarioModificacion = @UsuarioAccion,
                    FechaModificacion = SYSDATETIME()
                WHERE IdPago = @IdPago;
                """;

            await connection.ExecuteAsync(
                sqlUpdate,
                new
                {
                    request.IdPago,
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
                    request.TipoPago,
                    request.ConceptoPago,
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
                },
                transaction: transaction);

            await transaction.CommitAsync(cancellationToken);

            return new ArrendamientosCommandResultDto
            {
                Success = true,
                Message = "Pago actualizado correctamente.",
                Id = request.IdPago
            };
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static string ResolverMonedaObligacion(string? monedaItem, string? codigoConcepto, ArrendamientosContratoMonedaDto? contrato)
    {
        var monedaNormalizada = NormalizarMoneda(monedaItem);
        if (monedaNormalizada is not null)
        {
            return monedaNormalizada;
        }

        var concepto = (codigoConcepto ?? string.Empty).Trim().ToUpperInvariant();
        return concepto switch
        {
            "ALQUILER" => NormalizarMoneda(contrato?.MonedaAlquiler) ?? NormalizarMoneda(contrato?.Moneda) ?? "PEN",
            "MANTENIMIENTO" => NormalizarMoneda(contrato?.MonedaMantenimiento) ?? NormalizarMoneda(contrato?.Moneda) ?? "PEN",
            "COCHERA" => NormalizarMoneda(contrato?.MonedaCochera) ?? NormalizarMoneda(contrato?.Moneda) ?? "PEN",
            _ => NormalizarMoneda(contrato?.Moneda) ?? "PEN"
        };
    }

    private static string? NormalizarMoneda(string? moneda)
    {
        var value = moneda?.Trim().ToUpperInvariant();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string NormalizarTipoPago(string? tipoPago)
        => string.IsNullOrWhiteSpace(tipoPago) ? "COMPLETO" : tipoPago.Trim().ToUpperInvariant();

    private static string NormalizarConceptoPago(string? conceptoPago)
        => string.IsNullOrWhiteSpace(conceptoPago) ? "ALQUILER" : conceptoPago.Trim().ToUpperInvariant();

    private async Task<Dictionary<int, ArrendamientosContratoMonedaDto>> ObtenerMonedasContratoAsync(
        IReadOnlyCollection<int> idsContrato,
        CancellationToken cancellationToken)
    {
        if (idsContrato.Count == 0)
        {
            return new Dictionary<int, ArrendamientosContratoMonedaDto>();
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        var monedaCocheraSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_contrato",
            "MonedaCochera",
            "MonedaCochera",
            "NULL AS MonedaCochera",
            cancellationToken);
        var monedaGarantiaSelect = await ObtenerSelectColumnaAsync(
            "dbo.a_contrato",
            "MonedaGarantia",
            "MonedaGarantia",
            "NULL AS MonedaGarantia",
            cancellationToken);

        var rows = await connection.QueryAsync<ArrendamientosContratoMonedaDto>(
            _sqlCommandFactory.Create($$"""
                SELECT
                    IdContrato,
                    Moneda,
                    MonedaAlquiler,
                    MonedaMantenimiento,
                    {{monedaCocheraSelect}},
                    {{monedaGarantiaSelect}}
                FROM dbo.a_contrato
                WHERE IdContrato IN @IdsContrato;
                """,
                new { IdsContrato = idsContrato },
                cancellationToken: cancellationToken));

        return rows.ToDictionary(x => x.IdContrato, x => x);
    }

    private async Task<Dictionary<int, string>> ObtenerCodigosConceptoAsync(
        IReadOnlyCollection<int> idsConcepto,
        CancellationToken cancellationToken)
    {
        if (idsConcepto.Count == 0)
        {
            return new Dictionary<int, string>();
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync<ConceptoCodigoRow>(
            _sqlCommandFactory.Create("""
                SELECT
                    IdConcepto,
                    CodigoConcepto
                FROM dbo.a_concepto
                WHERE IdConcepto IN @IdsConcepto;
                """,
                new { IdsConcepto = idsConcepto },
                cancellationToken: cancellationToken));

        return rows.ToDictionary(x => x.IdConcepto, x => x.CodigoConcepto ?? string.Empty);
    }

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

    private sealed class ArrendamientosContratoMonedaDto
    {
        public int IdContrato { get; set; }
        public string? Moneda { get; set; }
        public string? MonedaAlquiler { get; set; }
        public string? MonedaMantenimiento { get; set; }
        public string? MonedaCochera { get; set; }
        public string? MonedaGarantia { get; set; }
    }

    private sealed class ConceptoCodigoRow
    {
        public int IdConcepto { get; set; }
        public string? CodigoConcepto { get; set; }
    }

    private sealed class ArrendamientosDshPagosSeleccionDto
    {
        public int? IdInmuebleSeleccionado { get; set; }
        public int? IdInquilinoSeleccionado { get; set; }
    }
}

// ROLLBACK-MARKER: ARRRENDAMIENTOS SERVICE END
