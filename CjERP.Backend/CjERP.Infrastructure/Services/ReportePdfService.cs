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
        string tipoReporte,
        ReporteWhatsappEmpleadoDto empleadoDestino,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var document = ReporteWhatsappTipos.IsGerencial(normalizedType)
            ? BuildGerencialDocument(empleadoDestino, periodo, detalle)
            : BuildOperativoDocument(empleadoDestino, periodo, detalle);

        return Task.FromResult(document.GeneratePdf());
    }

    private static Document BuildOperativoDocument(
        ReporteWhatsappEmpleadoDto empleado,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var resumen = BuildSummary(detalle);

        return Document.Create(container =>
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
                            card.Item().PaddingTop(10).AlignCenter().Width(150).Height(150).Svg(BuildPieChartSvg(resumen, GetPaletteColor));
                            card.Item().PaddingTop(10).Column(legend =>
                            {
                                legend.Spacing(4);

                                foreach (var item in resumen.Resumen.Select((value, index) => new { value, index }))
                                {
                                    legend.Item().Row(r =>
                                    {
                                        r.ConstantItem(10).Height(10).Background(GetPaletteColor(item.index));
                                        r.ConstantItem(6);
                                        r.RelativeItem().Text(item.value.EstadoMarcacionTexto).FontSize(8);
                                        r.ConstantItem(26).AlignRight().Text(item.value.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(8);
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
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(CellHeader).Text("Fecha");
                                header.Cell().Element(CellHeader).Text("Estado");
                            });

                            foreach (var item in detalle)
                            {
                                table.Cell().Element(CellBody).Text(item.Fecha);
                                table.Cell().Element(CellBody).Text(item.EstadoMarcacionTexto);
                            }
                        });
                    });
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Cj Telecom - Reporte Automatico | ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });
        });
    }

    private static Document BuildGerencialDocument(
        ReporteWhatsappEmpleadoDto empleadoDestino,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var resumenEmpleados = BuildGerencialResumen(detalle);
        var pieCharts = BuildGerencialPieCharts(resumenEmpleados);
        var generalChart = pieCharts.FirstOrDefault(x => x.Titulo == "GENERAL");
        var locationCharts = pieCharts.Where(x => x.Titulo != "GENERAL").ToList();
        var sectionSummaryId = "resumen-principal";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(20);
                page.Size(PageSizes.A4.Landscape());
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.BlueGrey.Darken4));

                page.Content().Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Column(header =>
                    {
                        header.Spacing(4);
                        header.Item().Text("REPORTE DE ASISTENCIA").Bold().FontSize(18).FontColor("#0F3D6E");
                        header.Item().Text($"Periodo: {periodo.FechaInicio} al {periodo.FechaFin}").FontSize(8).FontColor(Colors.Grey.Darken2);
                        header.Item().Text($"Emitido: {DateTime.Now:dd/MM/yyyy HH:mm}").FontSize(8).FontColor(Colors.Grey.Darken2);
                        header.Item().Text($"Destinatario: {empleadoDestino.NombreEmpleado}").FontSize(8).SemiBold();
                    });

                    if (generalChart is not null)
                    {
                        column.Item().Column(summaryColumn =>
                        {
                            summaryColumn.Spacing(6);
                            summaryColumn.Item().Text("Resumen ejecutivo").Bold().FontSize(12).FontColor("#123B5D");
                            summaryColumn.Item().Element(c => RenderGeneralSummaryCards(c, generalChart));

                            if (locationCharts.Count > 0)
                            {
                                summaryColumn.Item().Row(row =>
                                {
                                    row.Spacing(8);
                                    row.ConstantItem(390).Element(c => RenderGeneralBarChartCard(c, generalChart, compact: true));
                                    row.RelativeItem().Element(c => RenderLocationChartsHorizontal(c, locationCharts));
                                });
                            }
                            else
                            {
                                summaryColumn.Item().Element(c => RenderGeneralBarChartCard(c, generalChart, compact: true));
                            }
                        });
                    }
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Cj Telecom - Reporte Gerencial WUP | ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });

            container.Page(page =>
            {
                page.Margin(20);
                page.Size(PageSizes.A4.Landscape());
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.BlueGrey.Darken4));

                page.Content().Section(sectionSummaryId).Background("#F8FAFC").Border(1).BorderColor("#D9E2EC").Padding(12).Column(card =>
                {
                    card.Spacing(8);
                    card.Item().Text("Resumen ejecutivo").Bold().FontSize(13).FontColor("#123B5D");
                    card.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2.8f);
                            columns.RelativeColumn(1.4f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(CellHeader).Text("Empleado");
                            header.Cell().Element(CellHeader).Text("Ubicacion");
                            header.Cell().Element(CellHeader).AlignRight().Text("Total Horas");
                            header.Cell().Element(CellHeader).AlignRight().Text("Horas Laboradas");
                            header.Cell().Element(CellHeader).AlignRight().Text("Diferencia");
                            header.Cell().Element(CellHeader).AlignCenter().Text("Estado");
                        });

                        foreach (var empleado in resumenEmpleados)
                        {
                            var isRevisar = empleado.Estado == "REVISAR";
                            table.Cell().Element(c => SummaryCell(c, isRevisar).SectionLink(BuildEmpleadoSectionId(empleado.IdEmpleado))).Text(empleado.NombreEmpleado);
                            table.Cell().Element(c => SummaryCell(c, isRevisar)).Text(EmptyIfMissing(empleado.Ubicacion));
                            table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.TotalHoras.ToString("0.00", CultureInfo.InvariantCulture));
                            table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.HorasLaboradas.ToString("0.00", CultureInfo.InvariantCulture));
                            table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.DiferenciaHoras.ToString("0.00", CultureInfo.InvariantCulture));
                            table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignCenter().Text(empleado.Estado);
                        }
                    });
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Cj Telecom - Reporte Gerencial WUP | ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });

            foreach (var empleado in resumenEmpleados)
            {
                container.Page(page =>
                {
                    var sectionId = BuildEmpleadoSectionId(empleado.IdEmpleado);
                    var isRevisar = empleado.Estado == "REVISAR";

                    page.Margin(20);
                    page.Size(PageSizes.A4.Landscape());
                    page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.BlueGrey.Darken4));

                    page.Content().Section(sectionId).Background(Colors.White).Border(1).BorderColor("#D9E2EC").Padding(12).Column(card =>
                    {
                        card.Spacing(8);
                        card.Item().Row(row =>
                        {
                            row.RelativeItem().Column(info =>
                            {
                                info.Item().Text(empleado.NombreEmpleado).Bold().FontSize(14).FontColor("#123B5D");
                                info.Item().Text($"Ubicacion: {EmptyIfMissing(empleado.Ubicacion)}");
                                info.Item().Text($"Total Horas: {empleado.TotalHoras:0.00}");
                                info.Item().Text($"Horas Laboradas: {empleado.HorasLaboradas:0.00}");
                                info.Item().Text($"Diferencia: {empleado.DiferenciaHoras:0.00}");
                                info.Item().Text($"Estado: {empleado.Estado}").Bold().FontColor(isRevisar ? "#B42318" : "#027A48");
                            });

                            row.ConstantItem(140).AlignRight().Column(actions =>
                            {
                                actions.Item().Text($"Empleado ID: {empleado.IdEmpleado}");
                                actions.Item().PaddingTop(8).SectionLink(sectionSummaryId).Text("Volver al resumen").FontColor("#2563EB").Underline();
                            });
                        });

                        card.Item().PaddingTop(6).Element(c => RenderCalendar(c, periodo, empleado.Calendario));
                    });

                    page.Footer().AlignCenter().Text(text =>
                    {
                        text.Span("Cj Telecom - Reporte Gerencial WUP | ");
                        text.CurrentPageNumber();
                        text.Span(" / ");
                        text.TotalPages();
                    });
                });
            }
        });
    }

    private static string EmptyIfMissing(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value.Trim();

    private static IContainer CellHeader(IContainer container) =>
        container.Background(Colors.Blue.Lighten4).BorderBottom(1).BorderColor(Colors.Grey.Lighten2).Padding(6);

    private static IContainer CellBody(IContainer container) =>
        container.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).PaddingVertical(5).PaddingHorizontal(6);

    private static IContainer SummaryCell(IContainer container, bool isRevisar)
    {
        var styled = container
            .BorderBottom(1)
            .BorderColor("#E2E8F0")
            .PaddingVertical(5)
            .PaddingHorizontal(6);

        if (isRevisar)
        {
            styled = styled.Background("#FEE4E2");
        }

        return styled.DefaultTextStyle(x => isRevisar ? x.SemiBold() : x);
    }

    private static void RenderGeneralSummaryCards(IContainer container, ReporteGerencialPieChartDto chart)
    {
        var completos = chart.Items.FirstOrDefault(x => x.Categoria == "COMPLETO")?.Cantidad ?? 0;
        var revisar = chart.Items.FirstOrDefault(x => x.Categoria == "REVISAR")?.Cantidad ?? 0;

        container.Row(row =>
        {
            row.Spacing(8);
            row.RelativeItem().Element(c => RenderSummaryMetricCard(c, "Total empleados", chart.Total.ToString(CultureInfo.InvariantCulture), "#123B5D", "#EFF6FF"));
            row.RelativeItem().Element(c => RenderSummaryMetricCard(c, "Completos", completos.ToString(CultureInfo.InvariantCulture), "#027A48", "#ECFDF3"));
            row.RelativeItem().Element(c => RenderSummaryMetricCard(c, "Revisar", revisar.ToString(CultureInfo.InvariantCulture), "#B42318", "#FEF3F2"));
        });
    }

    private static void RenderSummaryMetricCard(IContainer container, string title, string value, string accentColor, string backgroundColor)
    {
        container.Background(backgroundColor).Border(1).BorderColor("#D9E2EC").Padding(10).Column(card =>
        {
            card.Spacing(4);
            card.Item().Text(title).SemiBold().FontSize(9).FontColor(accentColor);
            card.Item().Text(value).Bold().FontSize(18).FontColor("#0F172A");
        });
    }

    private static void RenderGeneralBarChartCard(IContainer container, ReporteGerencialPieChartDto chart, bool compact = false)
    {
        container.Background(Colors.White).Border(1).BorderColor("#D9E2EC").Padding(compact ? 10 : 12).Column(card =>
        {
            card.Spacing(compact ? 6 : 8);
            card.Item().Text("GENERAL").Bold().FontSize(compact ? 10 : 11).FontColor("#123B5D");
            card.Item().Text($"Total empleados: {chart.Total}").FontSize(compact ? 7 : 8).FontColor(Colors.Grey.Darken1);
            card.Item().Height(compact ? 145 : 220).Svg(BuildGeneralBarChartSvg(chart, compact));
        });
    }

    private static void RenderLocationChartsHorizontal(IContainer container, IReadOnlyList<ReporteGerencialPieChartDto> charts)
    {
        container.Row(row =>
        {
            row.Spacing(8);
            foreach (var chart in charts.Take(3))
            {
                row.RelativeItem().Element(c => RenderChartCard(c, chart, compact: true));
            }

            for (var i = charts.Count; i < 3; i++)
            {
                row.RelativeItem();
            }
        });
    }

    private static void RenderChartCard(IContainer container, ReporteGerencialPieChartDto chart, bool compact)
    {
        container.Background(Colors.White).Border(1).BorderColor("#D9E2EC").Padding(compact ? 8 : 10).Column(card =>
        {
            card.Spacing(compact ? 4 : 6);
            card.Item().Text(chart.Titulo).Bold().FontSize(compact ? 9 : 11).FontColor("#123B5D");
            card.Item().Text($"Total empleados: {chart.Total}").FontSize(compact ? 7 : 8).FontColor(Colors.Grey.Darken1);

            if (compact)
            {
                card.Item().AlignCenter().Width(58).Height(58).Svg(BuildGerencialPieChartSvg(chart));
                card.Item().Column(legend =>
                {
                    legend.Spacing(1);
                    foreach (var item in chart.Items)
                    {
                        legend.Item().Row(r =>
                        {
                            r.ConstantItem(6).Height(6).Background(GetGerencialStateColor(item.Categoria));
                            r.ConstantItem(3);
                            r.RelativeItem().Text($"{item.Categoria}: {item.Cantidad} ({item.Porcentaje:0.0}%)").FontSize(5.2f);
                        });
                    }
                });
            }
            else
            {
                card.Item().Row(chartLayout =>
                {
                    chartLayout.ConstantItem(150).AlignCenter().Width(140).Height(140).Svg(BuildGerencialPieChartSvg(chart));
                    chartLayout.RelativeItem().PaddingLeft(8).Column(legend =>
                    {
                        legend.Spacing(4);
                        foreach (var item in chart.Items)
                        {
                            legend.Item().Row(r =>
                            {
                                r.ConstantItem(10).Height(10).Background(GetGerencialStateColor(item.Categoria));
                                r.ConstantItem(6);
                                r.RelativeItem().Text($"{item.Categoria} ({item.Porcentaje:0.0}%)").FontSize(8);
                                r.ConstantItem(30).AlignRight().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(8);
                            });
                        }
                    });
                });
            }
        });
    }

    private static string BuildGeneralBarChartSvg(ReporteGerencialPieChartDto chart, bool compact = false)
    {
        var width = compact ? 360 : 520;
        var height = compact ? 145 : 220;
        var left = compact ? 40 : 56;
        var right = compact ? 16 : 24;
        var top = compact ? 12 : 18;
        var bottom = compact ? 34 : 42;
        var plotWidth = width - left - right;
        var plotHeight = height - top - bottom;
        var maxValue = Math.Max(1, chart.Items.Select(x => x.Cantidad).DefaultIfEmpty(0).Max());
        var itemCount = Math.Max(1, chart.Items.Count);
        var slotWidth = plotWidth / itemCount;
        var barWidth = Math.Min(compact ? 70 : 88, Math.Max(compact ? 38 : 48, slotWidth - (compact ? 18 : 28)));

        var svg = new StringBuilder();
        svg.Append($"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {width} {height}'>");
        svg.Append($"<rect x='0' y='0' width='{width}' height='{height}' fill='#FFFFFF'/>");
        svg.Append($"<line x1='{left}' y1='{top + plotHeight}' x2='{width - right}' y2='{top + plotHeight}' stroke='#CBD5E1' stroke-width='1'/>");

        for (var i = 0; i <= 4; i++)
        {
            var value = Math.Round(maxValue * i / 4m, 0);
            var y = top + plotHeight - (plotHeight * i / 4);
            svg.Append($"<line x1='{left}' y1='{y:0.##}' x2='{width - right}' y2='{y:0.##}' stroke='#E2E8F0' stroke-width='1'/>");
            svg.Append($"<text x='{left - 8}' y='{y + 4:0.##}' text-anchor='end' font-size='{(compact ? 8 : 10)}' fill='#64748B'>{value}</text>");
        }

        for (var index = 0; index < chart.Items.Count; index++)
        {
            var item = chart.Items[index];
            var barHeight = plotHeight * item.Cantidad / maxValue;
            var x = left + (slotWidth * index) + ((slotWidth - barWidth) / 2m);
            var y = top + plotHeight - barHeight;

            svg.Append($"<rect x='{x:0.##}' y='{y:0.##}' width='{barWidth}' height='{barHeight:0.##}' rx='6' ry='6' fill='{GetGerencialStateColor(item.Categoria)}' />");
            svg.Append($"<text x='{x + (barWidth / 2m):0.##}' y='{y - 5:0.##}' text-anchor='middle' font-size='{(compact ? 9 : 11)}' font-weight='700' fill='#0F172A'>{item.Cantidad}</text>");
            svg.Append($"<text x='{x + (barWidth / 2m):0.##}' y='{top + plotHeight + (compact ? 16 : 18)}' text-anchor='middle' font-size='{(compact ? 8 : 10)}' font-weight='700' fill='#334155'>{EscapeXml(item.Categoria)}</text>");
            svg.Append($"<text x='{x + (barWidth / 2m):0.##}' y='{top + plotHeight + (compact ? 28 : 32)}' text-anchor='middle' font-size='{(compact ? 7 : 9)}' fill='#64748B'>{item.Porcentaje:0.0}%</text>");
        }

        svg.Append("</svg>");
        return svg.ToString();
    }

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

    private static IReadOnlyList<ReporteGerencialEmpleadoResumenDto> BuildGerencialResumen(IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        return detalle
            .GroupBy(x => x.IdEmpleado)
            .Select(group =>
            {
                var first = group.First();
                var totalHoras = group.Max(x => x.TotalHorasLaborales != 0m ? x.TotalHorasLaborales : x.TotalHoras);
                var horasLaboradas = group.Max(x => x.TotalHorasEmpleado != 0m ? x.TotalHorasEmpleado : x.TotalHoras);
                var diferencia = horasLaboradas - totalHoras;
                var estado = diferencia >= 0m ? "COMPLETO" : "REVISAR";

                return new ReporteGerencialEmpleadoResumenDto
                {
                    IdEmpleado = group.Key,
                    NombreEmpleado = first.NombreEmpleado,
                    Ubicacion = first.Ubicacion,
                    TotalHoras = totalHoras,
                    HorasLaboradas = horasLaboradas,
                    DiferenciaHoras = diferencia,
                    Estado = estado,
                    Calendario = group
                        .OrderBy(x => ParseDate(x.Fecha))
                        .ToList()
                };
            })
            .OrderBy(x => x.DiferenciaHoras)
            .ThenBy(x => x.NombreEmpleado)
            .ToList();
    }

    private static IReadOnlyList<ReporteGerencialPieChartDto> BuildGerencialPieCharts(IReadOnlyList<ReporteGerencialEmpleadoResumenDto> resumen)
    {
        var result = new List<ReporteGerencialPieChartDto>
        {
            BuildPieChart("GENERAL", string.Empty, resumen)
        };

        foreach (var group in resumen.GroupBy(x => string.IsNullOrWhiteSpace(x.Ubicacion) ? "SIN UBICACION" : x.Ubicacion.Trim().ToUpperInvariant()).OrderBy(x => x.Key))
        {
            result.Add(BuildPieChart(group.Key, group.Key, group.ToList()));
        }

        return result;
    }

    private static ReporteGerencialPieChartDto BuildPieChart(string title, string ubicacion, IReadOnlyList<ReporteGerencialEmpleadoResumenDto> items)
    {
        var total = items.Count;
        var chartItems = items
            .GroupBy(x => x.Estado)
            .Select(group => new ReporteGerencialPieChartItemDto
            {
                Categoria = group.Key,
                Cantidad = group.Count(),
                Porcentaje = total == 0 ? 0 : Math.Round(group.Count() * 100m / total, 2)
            })
            .OrderByDescending(x => x.Cantidad)
            .ToList();

        return new ReporteGerencialPieChartDto
        {
            Titulo = title,
            Ubicacion = ubicacion,
            Total = total,
            Items = chartItems
        };
    }

    private static string EscapeXml(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("'", "&apos;", StringComparison.Ordinal);
    }

    private static void RenderCalendar(
        IContainer container,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> items,
        bool compact = false)
    {
        var dates = items.Select(x => ParseDate(x.Fecha)).Where(x => x.HasValue).Select(x => x!.Value).ToList();
        var reference = dates.Count > 0 ? dates[0] : DateTime.Today;
        var firstDay = new DateTime(reference.Year, reference.Month, 1);
        var lastDay = new DateTime(reference.Year, reference.Month, DateTime.DaysInMonth(reference.Year, reference.Month));
        var itemsByDate = items
            .Select(item => new { Item = item, Date = ParseDate(item.Fecha) })
            .Where(x => x.Date.HasValue)
            .GroupBy(x => x.Date!.Value.Date)
            .ToDictionary(x => x.Key, x => x.First().Item);

        container.Column(column =>
        {
            column.Spacing(compact ? 4 : 6);
            column.Item().Text($"Calendario {firstDay:MMMM yyyy}".ToUpperInvariant()).Bold().FontSize(compact ? 10 : 11).FontColor("#123B5D");
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    for (var i = 0; i < 7; i++)
                    {
                        columns.RelativeColumn();
                    }
                });

                foreach (var dayName in new[] { "Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom" })
                {
                    table.Cell().Element(CellHeader).AlignCenter().Text(dayName).FontSize(compact ? 7 : 9);
                }

                var firstColumn = ((int)firstDay.DayOfWeek + 6) % 7;
                for (var i = 0; i < firstColumn; i++)
                {
                    table.Cell().Element(c => EmptyCalendarCell(c, compact)).Text(string.Empty);
                }

                for (var day = 1; day <= lastDay.Day; day++)
                {
                    var date = new DateTime(firstDay.Year, firstDay.Month, day);
                    itemsByDate.TryGetValue(date.Date, out var item);
                    var status = item?.EstadoMarcacionTexto?.Trim().ToUpperInvariant() ?? "-";
                    var horaEntrada = string.IsNullOrWhiteSpace(item?.HoraEntrada) ? "-" : item!.HoraEntrada.Trim();
                    var horaSalida = string.IsNullOrWhiteSpace(item?.HoraSalida) ? "-" : item!.HoraSalida.Trim();
                    var totalHoras = item is null
                        ? "-"
                        : item.TotalHoras.ToString("0.00", CultureInfo.InvariantCulture);
                    table.Cell().Element(c => CalendarCell(c, status, compact)).Column(cell =>
                    {
                        cell.Item().AlignRight().Text(day.ToString(CultureInfo.InvariantCulture)).FontSize(compact ? 7 : 8).SemiBold();
                        cell.Item().PaddingTop(compact ? 2 : 4).Text(status).FontSize(compact ? 5.5f : 7);
                        cell.Item().Text($"Entrada: {horaEntrada}").FontSize(compact ? 4.5f : 6);
                        cell.Item().Text($"Salida: {horaSalida}").FontSize(compact ? 4.5f : 6);
                        cell.Item().Text($"Total: {totalHoras}").FontSize(compact ? 4.5f : 6).SemiBold();
                    });
                }
            });
        });
    }

    private static IContainer EmptyCalendarCell(IContainer container, bool compact) =>
        container
            .Border(1)
            .BorderColor("#E2E8F0")
            .MinHeight(compact ? 34 : 70)
            .Background("#F8FAFC")
            .Padding(compact ? 3 : 4);

    private static IContainer CalendarCell(IContainer container, string status, bool compact) =>
        container
            .Border(1)
            .BorderColor("#E2E8F0")
            .MinHeight(compact ? 34 : 70)
            .Background(GetCalendarStateBackground(status))
            .Padding(compact ? 3 : 4);

    private static string GetCalendarStateBackground(string status)
    {
        return status switch
        {
            "ASISTENCIA" => "#DCFCE7",
            "FALTA" => "#FEE2E2",
            "VACACIONES" => "#DBEAFE",
            "FERIADO" => "#FEF3C7",
            "SABADO" => "#F1F5F9",
            "DOMINGO" => "#E2E8F0",
            "SIN MARCAR" => "#FFE4E6",
            "SIN ENTRADA" => "#FDE68A",
            "SIN SALIDA" => "#FCD34D",
            _ => "#F8FAFC"
        };
    }

    private static string BuildEmpleadoSectionId(int idEmpleado) => $"empleado-{idEmpleado}";

    private static string BuildPieChartSvg(ReporteWhatsappPdfResumenDto resumen, Func<int, string> colorSelector)
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
            builder.Append(BuildSlice(centerX, centerY, radius, startAngle, endAngle, colorSelector(index)));
            startAngle = endAngle;
        }

        builder.Append("""<circle cx="75" cy="75" r="24" fill="#FFFFFF" />""");
        builder.Append($"""<text x="75" y="71" text-anchor="middle" font-size="14" font-weight="700" fill="#0F172A">{resumen.TotalRegistros}</text>""");
        builder.Append("""<text x="75" y="86" text-anchor="middle" font-size="9" fill="#64748B">registros</text>""");
        builder.Append("</svg>");
        return builder.ToString();
    }

    private static string BuildGerencialPieChartSvg(ReporteGerencialPieChartDto chart)
    {
        var resumen = new ReporteWhatsappPdfResumenDto
        {
            TotalRegistros = chart.Total,
            Resumen = chart.Items.Select(x => new ReporteWhatsappResumenEstadoDto
            {
                EstadoMarcacionTexto = x.Categoria,
                Cantidad = x.Cantidad,
                Porcentaje = x.Porcentaje
            }).ToList()
        };

        return BuildPieChartSvg(resumen, index => GetGerencialStateColor(chart.Items[index].Categoria));
    }

    private static string GetPaletteColor(int index)
    {
        var palette = new[]
        {
            "#2563EB", "#059669", "#F59E0B", "#DC2626", "#7C3AED", "#0EA5E9", "#475569", "#F97316"
        };

        return palette[index % palette.Length];
    }

    private static string GetGerencialStateColor(string status) =>
        status.Equals("COMPLETO", StringComparison.OrdinalIgnoreCase) ? "#12B76A" : "#F04438";

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

    private static DateTime? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateTime.TryParseExact(value.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }

        if (DateTime.TryParse(value, out parsed))
        {
            return parsed;
        }

        return null;
    }
}
