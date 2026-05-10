using System.Globalization;
using System.Text;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

public sealed class ReportePdfService : IReportePdfService
{
    public Task<byte[]> GenerarReportePdfAsync(
        ReporteWhatsappEmpleadoDto empleado,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var resumen = BuildSummary(detalle);
        var fechaEnvio = DateTime.Now;
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(24);
                page.Size(PageSizes.A4);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor(Colors.BlueGrey.Darken4));

                page.Header().Element(header =>
                {
                    header.Column(column =>
                    {
                        column.Item().Row(row =>
                        {
                            row.RelativeItem().Column(info =>
                            {
                                info.Item().Text("Reporte de Asistencia").Bold().FontSize(22).FontColor(Colors.Blue.Darken2);
                                info.Item().Text($"Periodo: {periodo.FechaInicio} - {periodo.FechaFin}").FontColor(Colors.Grey.Darken2);
                            });

                            row.ConstantItem(140).AlignRight().Column(meta =>
                            {
                                meta.Item().Text($"Emitido: {DateTime.Now:dd/MM/yyyy HH:mm}");
                                meta.Item().Text($"Empleado ID: {empleado.IdEmpleado}");
                            });
                        });

                        column.Item().PaddingTop(12).Background(Colors.Grey.Lighten4).Padding(12).Row(row =>
                        {
                            row.RelativeItem().Column(info =>
                            {
                                info.Item().Text($"Empleado: {empleado.NombreEmpleado}").SemiBold();
                                info.Item().Text($"Correo: {EmptyIfMissing(empleado.Correo)}");
                                info.Item().Text($"Ubicacion: {EmptyIfMissing(detalle.FirstOrDefault()?.Ubicacion)}");
                            });

                            row.RelativeItem().Column(info =>
                            {
                                //info.Item().Text($"Usuario: {EmptyIfMissing(empleado.Usuario)}");
                                info.Item().Text($"Telefono: {EmptyIfMissing(empleado.Telefono)}");
                            });
                        });
                    });
                });

                page.Content().Column(column =>
                {
                    column.Spacing(16);

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                        {
                            card.Item().Text("Resumen").Bold().FontSize(12);
                            card.Item().PaddingTop(8).Table(table =>
                            {
                                table.ColumnsDefinition(columns =>
                                {
                                    columns.RelativeColumn(2);
                                    columns.RelativeColumn();
                                    columns.RelativeColumn();
                                });

                                table.Header(header =>
                                {
                                    header.Cell().Element(CellHeader).Text("Estado");
                                    header.Cell().Element(CellHeader).AlignRight().Text("Cantidad");
                                    header.Cell().Element(CellHeader).AlignRight().Text("%");
                                });

                                foreach (var item in resumen.Resumen)
                                {
                                    table.Cell().Element(CellBody).Text(item.EstadoMarcacionTexto);
                                    table.Cell().Element(CellBody).AlignRight().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture));
                                    table.Cell().Element(CellBody).AlignRight().Text($"{item.Porcentaje:0.00}%");
                                }
                            });
                        });

                        row.ConstantItem(190).Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                        {
                            card.Item().Text("Distribucion").Bold().FontSize(12);
                            card.Item().PaddingTop(10).AlignCenter().Width(150).Height(150).Svg(BuildPieChartSvg(resumen));
                            card.Item().PaddingTop(10).Column(legend =>
                            {
                                legend.Spacing(4);

                                foreach (var item in resumen.Resumen.Select((value, index) => new { value, index }))
                                {
                                    legend.Item().Row(row =>
                                    {
                                        row.ConstantItem(10).Height(10).Background(GetPaletteColor(item.index));
                                        row.ConstantItem(6);
                                        row.RelativeItem().Text(item.value.EstadoMarcacionTexto).FontSize(8);
                                        row.ConstantItem(26).AlignRight().Text(item.value.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(8);
                                    });
                                }
                            });
                        });
                    });

                    column.Item().Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Item().Text("Detalle de asistencia").Bold().FontSize(12);
                        card.Item().PaddingTop(10).Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.RelativeColumn(1.1f);
                                columns.RelativeColumn(1.4f);
                                // Las siguientes columnas están ocultas temporalmente:
                                //columns.RelativeColumn(1f); // Entrada
                                //columns.RelativeColumn(1f); // Salida
                                //columns.RelativeColumn(1f); // Tiempo
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(CellHeader).Text("Fecha");
                                header.Cell().Element(CellHeader).Text("Estado");
                                // Las siguientes columnas están ocultas temporalmente:
                                //header.Cell().Element(CellHeader).AlignCenter().Text("Entrada");
                                //header.Cell().Element(CellHeader).AlignCenter().Text("Salida");
                                //header.Cell().Element(CellHeader).AlignCenter().Text("Tiempo");
                            });

                            foreach (var item in detalle)
                            {
                                table.Cell().Element(CellBody).Text(item.Fecha);
                                table.Cell().Element(CellBody).Text(item.EstadoMarcacionTexto);
                                // Las siguientes columnas están ocultas temporalmente:
                                //table.Cell().Element(CellBody).AlignCenter().Text(EmptyIfMissing(item.HoraEntrada));
                                //table.Cell().Element(CellBody).AlignCenter().Text(EmptyIfMissing(item.HoraSalida));
                                //table.Cell().Element(CellBody).AlignCenter().Text(EmptyIfMissing(item.TiempoHoras));
                            }
                        });
                    });
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    //text.Span($"Fecha de envio: {fechaEnvio:dd/MM/yyyy HH:mm:ss} | ");
                    text.Span("Cj Telecom - Reporte Automatico | ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });
        });

        return Task.FromResult(document.GeneratePdf());
    }

    private static string EmptyIfMissing(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value.Trim();

    private static IContainer CellHeader(IContainer container) =>
        container.Background(Colors.Blue.Lighten4).BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(6);

    private static IContainer CellBody(IContainer container) =>
        container.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).PaddingVertical(5).PaddingHorizontal(6);

    private static ReporteWhatsappPdfResumenDto BuildSummary(IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var total = detalle.Count;
        var resumen = detalle
            .GroupBy(x => string.IsNullOrWhiteSpace(x.EstadoMarcacionTexto) ? "SIN CLASIFICAR" : x.EstadoMarcacionTexto.Trim().ToUpperInvariant())
            .Select(group => new ReporteWhatsappResumenEstadoDto
            {
                EstadoMarcacionTexto = group.Key,
                Cantidad = group.Count(),
                Porcentaje = total == 0 ? 0 : Math.Round(group.Count() * 100m / total, 2)
            })
            .OrderByDescending(x => x.Cantidad)
            .ThenBy(x => x.EstadoMarcacionTexto)
            .ToList();

        return new ReporteWhatsappPdfResumenDto
        {
            Resumen = resumen,
            TotalRegistros = total
        };
    }

    private static string BuildPieChartSvg(ReporteWhatsappPdfResumenDto resumen)
    {
        if (resumen.TotalRegistros <= 0 || resumen.Resumen.Count == 0)
        {
            return """
            <svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">
              <circle cx="75" cy="75" r="48" fill="#E2E8F0" />
              <circle cx="75" cy="75" r="24" fill="#FFFFFF" />
              <text x="75" y="80" text-anchor="middle" font-size="11" fill="#475569">Sin datos</text>
            </svg>
            """;
        }

        var builder = new StringBuilder();
        builder.Append("""<svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">""");

        var centerX = 75d;
        var centerY = 75d;
        var radius = 48d;
        var startAngle = -90d;

        for (var index = 0; index < resumen.Resumen.Count; index++)
        {
            var item = resumen.Resumen[index];
            var sweepAngle = 360d * item.Cantidad / Math.Max(resumen.TotalRegistros, 1);
            var endAngle = startAngle + sweepAngle;
            builder.Append(BuildSlice(centerX, centerY, radius, startAngle, endAngle, GetPaletteColor(index)));
            startAngle = endAngle;
        }

        builder.Append("""<circle cx="75" cy="75" r="24" fill="#FFFFFF" />""");
        builder.Append($"""<text x="75" y="71" text-anchor="middle" font-size="14" font-weight="700" fill="#0F172A">{resumen.TotalRegistros}</text>""");
        builder.Append("""<text x="75" y="86" text-anchor="middle" font-size="9" fill="#64748B">registros</text>""");
        builder.Append("</svg>");
        return builder.ToString();
    }

    private static string GetPaletteColor(int index)
    {
        var palette = new[]
        {
            "#2563EB", "#059669", "#F59E0B", "#DC2626", "#7C3AED", "#0EA5E9", "#475569", "#F97316"
        };

        return palette[index % palette.Length];
    }

    private static string BuildSlice(double centerX, double centerY, double radius, double startAngle, double endAngle, string color)
    {
        var start = GetPoint(centerX, centerY, radius, startAngle);
        var end = GetPoint(centerX, centerY, radius, endAngle);
        var largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

        return string.Create(CultureInfo.InvariantCulture, $"""
        <path d="M {centerX:0.##} {centerY:0.##} L {start.X:0.##} {start.Y:0.##} A {radius:0.##} {radius:0.##} 0 {largeArcFlag} 1 {end.X:0.##} {end.Y:0.##} Z" fill="{color}" />
        """);
    }

    private static (double X, double Y) GetPoint(double centerX, double centerY, double radius, double angleDegrees)
    {
        var radians = Math.PI * angleDegrees / 180d;
        return (centerX + radius * Math.Cos(radians), centerY + radius * Math.Sin(radians));
    }
}
