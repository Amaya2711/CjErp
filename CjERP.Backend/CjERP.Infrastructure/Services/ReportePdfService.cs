using System.Globalization;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

public sealed class ReportePdfService : IReportePdfService
{
    private const decimal MissingOrIncompleteHours = 9.6m;
    private const bool UseLegacyOperativoAsistenciaPdf = false;
    private static readonly HashSet<string> PresentStates = new(StringComparer.OrdinalIgnoreCase)
    {
        "PRESENTE", "ASISTIO", "OK", "ASISTENCIA"
    };

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
            : UseLegacyOperativoAsistenciaPdf
                ? BuildOperativoDocument(empleadoDestino, periodo, detalle)
                : BuildOperativoValidationDocument(BuildValidationRequestFromReporte(empleadoDestino, periodo, detalle));

        return Task.FromResult(document.GeneratePdf());
    }

    public Task<byte[]> GenerarReporteEmpleadoValidacionPdfAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var document = BuildOperativoValidationDocument(request);
        return Task.FromResult(document.GeneratePdf());
    }

    public Task<byte[]> GenerarReporteEmpleadoLlamadaAtencionPdfAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var document = BuildOperativoLlamadaAtencionDocument(request);
        return Task.FromResult(document.GeneratePdf());
    }

    public Task<byte[]> GenerarReporteGerencialEjecutivoPdfAsync(
        AsistenciaGerencialPdfDto reporte,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var document = BuildExecutiveGerencialDocument(reporte);
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
                                columns.RelativeColumn(2.2f);
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(CellHeader).Text("Fecha");
                                header.Cell().Element(CellHeader).Text("Estado");
                                header.Cell().Element(CellHeader).Text("Observacion");
                            });

                            foreach (var item in detalle)
                            {
                                table.Cell().Element(CellBody).Text(item.Fecha);
                                table.Cell().Element(CellBody).Text(item.EstadoMarcacionTexto);
                                table.Cell().Element(CellBody).Text(EmptyIfMissing(item.Observacion));
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

    private static Document BuildOperativoValidationDocument(AsistenciaReportePdfRequestDto request)
    {
        var items = FilterValidationItemsByPeriodo(request)
            .Where(item => item is not null)
            .ToList();
        var primaryItem = items.FirstOrDefault();
        var resumen = BuildSummary(items.Select(MapValidationItemToReporte).ToList());
        var resumenPresentes = BuildPresentStateSummary(items.Select(MapValidationItemToReporte).ToList());
        var diferenciaHoras = primaryItem?.DiferenciaHoras ?? 0m;
        var estadoValidacionHoras = primaryItem?.EstadoValidacionHoras ?? string.Empty;
        var warning = diferenciaHoras < 0;
        var validationTitle = warning
            ? "ADVERTENCIA: Presenta observaciones en la marcacion. Consultar con el encargado"
            : "Horas laborales cumplidas";
        var validationAccent = warning ? "#B42318" : "#027A48";
        var validationBackground = warning ? "#FEF3F2" : "#ECFDF3";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(24);
                page.Size(PageSizes.A4);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor(Colors.BlueGrey.Darken4));

                page.Header().Column(header =>
                {
                    header.Spacing(12);

                    header.Item().Row(row =>
                    {
                        row.RelativeItem().Column(info =>
                        {
                            info.Item().Text("Reporte de Asistencia").Bold().FontSize(22).FontColor(Colors.Blue.Darken2);
                            info.Item().Text("Formato de validacion").SemiBold().FontColor("#475467");
                            info.Item().Text($"Periodo: {request.FechaInicio} - {request.FechaFin}").FontColor(Colors.Grey.Darken2);
                        });

                        row.ConstantItem(170).AlignRight().Column(meta =>
                        {
                            meta.Item().Text($"Emitido: {DateTime.Now:dd/MM/yyyy HH:mm}");
                            meta.Item().Text($"Empleado ID: {primaryItem?.IdEmpleado?.ToString(CultureInfo.InvariantCulture) ?? "-"}");
                        });
                    });

                    header.Item().Background(Colors.Grey.Lighten4).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Row(row =>
                    {
                        row.RelativeItem().Column(info =>
                        {
                            info.Item().Text($"Empleado: {EmptyIfMissing(primaryItem?.NombreEmpleado)}").SemiBold();
                            info.Item().Text($"Responsable: {EmptyIfMissing(primaryItem?.Responsable)}");
                            info.Item().Text($"Ubicacion: {EmptyIfMissing(primaryItem?.Ubicacion)}");
                        });
                    });
                });

                page.Content().Column(column =>
                {
                    column.Spacing(14);

                    column.Item().Background(validationBackground).Border(1).BorderColor(validationAccent).Padding(12).Column(card =>
                    {
                        card.Spacing(4);
                        card.Item().Text(validationTitle).SemiBold().FontColor(validationAccent);
                    });

                    column.Item().Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Spacing(10);
                        card.Item().Text("KPIs por estado").Bold().FontSize(12);
                        card.Item().Element(c => RenderEstadoKpiCards(c, resumen));
                    });

                    column.Item().Section(BuildPresentStateSectionId()).Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Spacing(10);
                        card.Item().Text("Detalle estado PRESENTE").Bold().FontSize(12).FontColor("#123B5D");
                        card.Item().Text($"Los porcentajes se calculan sobre {resumenPresentes.TotalRegistros} registros presentes.")
                            .FontSize(8)
                            .FontColor("#667085");
                        card.Item().Element(c => RenderEstadoKpiCards(
                            c,
                            resumenPresentes,
                            BuildPresentStateSectionId(),
                            "Cada porcentaje refleja la participación dentro del conjunto PRESENTE.",
                            customOrder: new[] { "PRESENTE", "TOLERANCIA", "TARDANZA", "FUERA DE HORARIO" },
                            customTitleMap: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                            {
                                ["PRESENTE"] = "EN HORARIO"
                            },
                            customDescriptionMap: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                            {
                                ["PRESENTE"] = "Hasta las 8:35am",
                                ["TOLERANCIA"] = "Hasta las 8:45 am",
                                ["TARDANZA"] = "Hasta las 9am",
                                ["FUERA DE HORARIO"] = "Despues de las 9am"
                            }));
                    });

                });

                page.Footer().PaddingTop(6).Column(footer =>
                {
                    footer.Item()
                        .Border(1)
                        .BorderColor("#CBD5E1")
                        .Background("#F8FAFC")
                        .PaddingVertical(8)
                        .PaddingHorizontal(10)
                        .Column(box =>
                        {
                            box.Spacing(4);

                            box.Item().AlignCenter().Text(text =>
                            {
                                text.DefaultTextStyle(TextStyle.Default.FontSize(9).FontColor("#334155").SemiBold());
                                text.Span("Cj Telecom - Reporte de validacion de asistencia | ");
                                text.CurrentPageNumber();
                                text.Span(" / ");
                                text.TotalPages();
                            });

                            box.Item().AlignCenter().Text(text =>
                            {
                                text.DefaultTextStyle(TextStyle.Default.FontSize(8).FontColor("#667085"));
                                text.Span("Si existen estados FALTA APROBAR, se consideran como FALTA y no suma horas laboradas. ");
                                text.Span("Validarlo con su responsable de aprobacion de asistencia");
                            });

                            box.Item().AlignCenter().Text(text =>
                            {
                                text.DefaultTextStyle(TextStyle.Default.FontSize(8).FontColor("#667085"));
                                text.Span("Las horas laboradas son 48 semanales y consideran la suma de todos los estados: ");
                                text.Span("PRESENTE, FALTA, DESCANSO MEDICO y otros.");
                            });
                        });
                });
            });
        });
    }

    private static Document BuildOperativoLlamadaAtencionDocument(AsistenciaReportePdfRequestDto request)
    {
        var items = request.Items
            .Where(item => item is not null)
            .OrderBy(item => ParseDisplayDate(item.Fecha) ?? DateTime.MaxValue)
            .ThenBy(item => item.Hora)
            .ToList();
        var primaryItem = items.FirstOrDefault();
        var resumen = BuildSummary(items.Select(MapValidationItemToReporte).ToList());
        var resumenPresentes = BuildPresentStateSummary(items.Select(MapValidationItemToReporte).ToList());
        var diferenciaHoras = primaryItem?.DiferenciaHoras ?? 0m;
        var horasLaborales = primaryItem?.TotalHorasLaborales ?? 0m;
        var horasRegistradas = items.Sum(item => item.TotalHoras);
        var cumplimiento = horasLaborales <= 0m
            ? 0m
            : Math.Round((horasRegistradas * 100m) / horasLaborales, 2);
        var empleadoNombre = EmptyIfMissing(primaryItem?.NombreEmpleado);
        var responsable = EmptyIfMissing(primaryItem?.Responsable);
        var empresa = EmptyIfMissing(primaryItem?.Empresa);
        var cliente = EmptyIfMissing(primaryItem?.Cliente);
        var area = EmptyIfMissing(primaryItem?.Area);
        var ubicacion = EmptyIfMissing(primaryItem?.Ubicacion);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(24);
                page.Size(PageSizes.A4);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor(Colors.BlueGrey.Darken4));

                page.Header().Column(header =>
                {
                    header.Spacing(10);

                    header.Item().Row(row =>
                    {
                        row.RelativeItem().Column(info =>
                        {
                            info.Item().Text("NOTIFICACION").Bold().FontSize(22).FontColor("#111827");
                            info.Item().Text("Incumplimiento de Horario de Trabajo").SemiBold().FontSize(11).FontColor("#7A271A");
                        });

                        row.ConstantItem(180).AlignRight().Column(meta =>
                        {
                            meta.Item().Text(text =>
                            {
                                text.Span("Emitido: ").FontSize(9).FontColor("#667085");
                                text.Span(DateTime.Now.ToString("dd/MM/yyyy HH:mm")).Bold().FontSize(10).FontColor("#111827");
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Empleado ID: ").FontSize(9).FontColor("#667085");
                                text.Span(primaryItem?.IdEmpleado?.ToString(CultureInfo.InvariantCulture) ?? "-").Bold().FontSize(10).FontColor("#111827");
                            });
                            meta.Item().Text(text =>
                            {
                                text.Span("Período: ").FontSize(9).FontColor("#667085");
                                text.Span($"{request.FechaInicio} - {request.FechaFin}").Bold().FontSize(10).FontColor("#111827");
                            });
                        });
                    });

                });

                page.Content().Column(column =>
                {
                    column.Spacing(12);

                    column.Item().Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Spacing(8);
                        card.Item().Text("Datos generales").Bold().FontSize(12).FontColor("#123B5D");

                        card.Item().Row(row =>
                        {
                            row.RelativeItem().Column(left =>
                            {
                                left.Spacing(3);
                                left.Item().Text(text =>
                                {
                                    text.Span("Empleado: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(empleadoNombre).FontSize(10).FontColor("#111827");
                                });
                                left.Item().Text(text =>
                                {
                                    text.Span("Responsable: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(responsable).FontSize(10).FontColor("#111827");
                                });
                                left.Item().Text(text =>
                                {
                                    text.Span("Empresa: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(empresa).FontSize(10).FontColor("#111827");
                                });
                            });

                            row.RelativeItem().Column(right =>
                            {
                                right.Spacing(3);
                                right.Item().Text(text =>
                                {
                                    text.Span("Cliente: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(cliente).FontSize(10).FontColor("#111827");
                                });
                                right.Item().Text(text =>
                                {
                                    text.Span("Área: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(area).FontSize(10).FontColor("#111827");
                                });
                                right.Item().Text(text =>
                                {
                                    text.Span("Ubicación: ").FontSize(9).Bold().FontColor("#344054");
                                    text.Span(ubicacion).FontSize(10).FontColor("#111827");
                                });
                            });
                        });
                    });

                    column.Item().Background("#FEF3F2").Border(1).BorderColor("#F04438").Padding(12).Column(card =>
                    {
                        card.Spacing(5);
                        card.Item().Text("Como resultado de la revisión efectuada a los registros de asistencia correspondientes al período en referencia, se han identificado diferencias entre la jornada laboral programada y las horas efectivamente registradas en el sistema de control de asistencia de la empresa. Se informa la presente comunicacion preventiva para su consideracion")
                            .FontColor("#7A271A")
                            .SemiBold();
                    });

                    column.Item().Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Spacing(10);
                        card.Item().Text("KPIs por estado").Bold().FontSize(12).FontColor("#123B5D");
                        card.Item().Element(c => RenderEstadoKpiCards(c, resumen));
                    });

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        row.RelativeItem().Element(c => RenderCallAttentionMetricCard(c, "HORAS REQUERIDAS", $"{horasLaborales:0.00} h", "#2563EB", "#FFFFFF", centerValue: true));
                        row.RelativeItem().Element(c => RenderCallAttentionMetricCard(c, "HORAS REGISTRADAS", $"{horasRegistradas:0.00} h", "#027A48", "#FFFFFF", centerValue: true));
                        row.RelativeItem().Element(c => RenderCallAttentionMetricCard(c, "DIFERENCIA", $"{diferenciaHoras:0.00} h", "#B42318", "#FFFFFF", centerValue: true));
                        row.RelativeItem().Element(c => RenderCallAttentionMetricCard(c, "CUMPLIMIENTO", $"{cumplimiento:0.00} %", "#B42318", "#FFFFFF", centerValue: true));
                    });

                    column.Item().Element(c => RenderDetalleDiarioObservadoSemanal(c, request, items));

                    column.Item().Section(BuildPresentStateSectionId()).Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
                    {
                        card.Spacing(10);
                        card.Item().Text("Detalle estado PRESENTE").Bold().FontSize(12).FontColor("#123B5D");
                        card.Item().Text($"Los porcentajes se calculan sobre {resumenPresentes.TotalRegistros} registros presentes.")
                            .FontSize(8)
                            .FontColor("#667085");
                        card.Item().Element(c => RenderEstadoKpiCards(
                            c,
                            resumenPresentes,
                            BuildPresentStateSectionId(),
                            "Cada porcentaje refleja la participación dentro del conjunto PRESENTE.",
                            customOrder: new[] { "PRESENTE", "TOLERANCIA", "TARDANZA", "FUERA DE HORARIO" },
                            customTitleMap: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                            {
                                ["PRESENTE"] = "EN HORARIO"
                            },
                            customDescriptionMap: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                            {
                                ["PRESENTE"] = "Hasta las 8:35am",
                                ["TOLERANCIA"] = "Hasta las 8:45 am",
                                ["TARDANZA"] = "Hasta las 9am",
                                ["FUERA DE HORARIO"] = "Despues de las 9am"
                            }));
                    });

                    column.Item().Background("#F8FAFC").Border(1).BorderColor("#D0D5DD").Padding(12).Column(card =>
                    {
                        card.Spacing(4);
                        card.Item().Text(text =>
                        {
                            text.Span("Observacion: ").SemiBold();
                            text.Span("Se otorga un plazo de seis (6) días naturales, contados desde el día siguiente de recibida la presente notificación, para presentar las aclaraciones y/o documentación que considere pertinente.");
                        });
                    });
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Cj Telecom - Llamada de atencion por asistencia | ");
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            });
        });
    }

    private static void RenderCallAttentionMetricCard(IContainer container, string title, string value, string accentColor, string backgroundColor, bool centerValue = false)
    {
        container.Background(backgroundColor).Border(1).BorderColor("#D9E2EC").Padding(10).Column(card =>
        {
            card.Spacing(4);
            card.Item().AlignCenter().Text(title).SemiBold().FontSize(9).FontColor("#475467");
            card.Item().AlignCenter().Text(value).Bold().FontSize(18).FontColor(accentColor);
        });
    }

    private static void RenderDetalleDiarioObservadoSemanal(
        IContainer container,
        AsistenciaReportePdfRequestDto request,
        IReadOnlyList<AsistenciaReportePdfItemDto> items)
    {
        var cultureEsPe = new CultureInfo("es-PE");

        container.Background(Colors.White).Border(1).BorderColor(Colors.Grey.Lighten2).Padding(12).Column(card =>
        {
            card.Spacing(10);
            card.Item().Text("DETALLE DIARIO OBSERVADO").Bold().FontSize(12).FontColor("#0F172A");

            if (items.Count == 0)
            {
                card.Item().Background("#F8FAFC").Border(1).BorderColor("#CBD5E1").Padding(10).Text("No existen registros diarios para mostrar.");
                return;
            }

            var groups = BuildDetalleSemanalGroups(request, items);
            foreach (var group in groups)
            {
                card.Item().Background("#F8FAFC").Border(1).BorderColor("#D0D5DD").Column(weekCard =>
                {
                    weekCard.Item().Background("#EEF2FF").PaddingVertical(6).PaddingHorizontal(10).Row(weekHeader =>
                    {
                        weekHeader.RelativeItem().Text(group.Label).Bold().FontSize(9).FontColor("#1E293B");
                        weekHeader.ConstantItem(120).AlignRight().Text($"Subtotal semana: {group.SubtotalHoras:0.00} h").Bold().FontSize(9).FontColor("#1E293B");
                    });

                    weekCard.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.15f);
                            columns.RelativeColumn(1.0f);
                            columns.RelativeColumn(1.45f);
                            columns.RelativeColumn(2.15f);
                            columns.RelativeColumn(1.05f);
                            columns.RelativeColumn(1.05f);
                            columns.RelativeColumn(0.95f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(CallAttentionTableHeader).Text("FECHA");
                            header.Cell().Element(CallAttentionTableHeader).Text("DÍA");
                            header.Cell().Element(CallAttentionTableHeader).Text("EST.PRINC");
                            header.Cell().Element(CallAttentionTableHeader).Text("ESTADO");
                            header.Cell().Element(CallAttentionTableHeader).AlignCenter().Text("ENTRADA");
                            header.Cell().Element(CallAttentionTableHeader).AlignCenter().Text("SALIDA");
                            header.Cell().Element(CallAttentionTableHeader).AlignRight().Text("HORAS");
                        });

                        foreach (var item in group.Items)
                        {
                            var fecha = ParseDisplayDate(item.Fecha);
                            var fechaTexto = fecha.HasValue ? fecha.Value.ToString("dd/MM/yyyy") : EmptyIfMissing(item.Fecha);
                            var diaTexto = fecha.HasValue
                                ? cultureEsPe.TextInfo.ToTitleCase(fecha.Value.ToString("dddd", cultureEsPe))
                                : BuildDayNameLabel(item.Fecha);
                            var estadoTexto = ResolveNotificationEstado(item.Estado);
                            var estadoMarcacionTexto = ResolveNotificationEstado(item.EstadoMarcacionTexto);
                            var (estadoColor, estadoBackground) = GetCallAttentionStateStyle(estadoTexto);
                            var estadoCellBackground = estadoBackground;

                            table.Cell().Element(CallAttentionTableBody).Text(fechaTexto);
                            table.Cell().Element(CallAttentionTableBody).Text(diaTexto);
                            table.Cell().Element(CallAttentionTableBody).Text(estadoMarcacionTexto);
                            table.Cell().Element(c => CallAttentionStateCell(c, estadoColor, estadoCellBackground)).Text(estadoTexto).SemiBold();
                            table.Cell().Element(CallAttentionTableBody).AlignCenter().Text(EmptyIfMissing(item.Hora));
                            table.Cell().Element(CallAttentionTableBody).AlignCenter().Text(EmptyIfMissing(item.Salida));
                            table.Cell().Element(CallAttentionTableBody).AlignRight().Text($"{item.TotalHoras:0.00} h").SemiBold();
                        }
                    });
                });
            }
        });
    }

    private static IReadOnlyList<WeeklyCallAttentionGroup> BuildDetalleSemanalGroups(
        AsistenciaReportePdfRequestDto request,
        IReadOnlyList<AsistenciaReportePdfItemDto> items)
    {
        var culture = new CultureInfo("es-PE");
        var firstParsedDate = items
            .Select(x => ParseDisplayDate(x.Fecha))
            .FirstOrDefault(x => x.HasValue);
        var startDate = ParseDisplayDate(request.FechaInicio)
            ?? firstParsedDate.GetValueOrDefault(DateTime.Today);
        var endParsedDate = items
            .Select(x => ParseDisplayDate(x.Fecha))
            .Where(x => x.HasValue)
            .Select(x => x.GetValueOrDefault())
            .DefaultIfEmpty(startDate)
            .Max();
        var endDate = ParseDisplayDate(request.FechaFin) ?? endParsedDate;

        return items
            .Select(item =>
            {
                var parsedDate = ParseDisplayDate(item.Fecha) ?? startDate;
                var weekIndex = Math.Max(0, (int)Math.Floor((parsedDate.Date - startDate.Date).TotalDays / 7d));
                var weekStart = startDate.Date.AddDays(weekIndex * 7);
                var weekEnd = weekStart.AddDays(6);
                if (weekEnd > endDate.Date)
                {
                    weekEnd = endDate.Date;
                }

                return new
                {
                    Item = item,
                    WeekIndex = weekIndex,
                    ParsedDate = parsedDate,
                    WeekStart = weekStart,
                    WeekEnd = weekEnd
                };
            })
            .OrderBy(x => x.ParsedDate)
            .ThenBy(x => x.Item.Hora)
            .GroupBy(x => x.WeekIndex)
            .Select(group =>
            {
                var first = group.First();
                return new WeeklyCallAttentionGroup(
                    WeekNumber: group.Key + 1,
                    Label: BuildWeekLabel(group.Key + 1, first.WeekStart, first.WeekEnd, culture),
                    SubtotalHoras: group.Sum(x => x.Item.TotalHoras),
                    Items: group.Select(x => x.Item)
                        .OrderBy(x => ParseDisplayDate(x.Fecha) ?? DateTime.MaxValue)
                        .ThenBy(x => x.Hora)
                        .ToList());
            })
            .ToList();
    }

    private static string BuildWeekLabel(int weekNumber, DateTime weekStart, DateTime weekEnd, CultureInfo culture)
    {
        var startMonth = culture.DateTimeFormat.GetAbbreviatedMonthName(weekStart.Month).Replace(".", string.Empty).ToLowerInvariant();
        var endMonth = culture.DateTimeFormat.GetAbbreviatedMonthName(weekEnd.Month).Replace(".", string.Empty).ToLowerInvariant();
        var range = weekStart.Month == weekEnd.Month
            ? $"{weekStart:dd}–{weekEnd:dd} {startMonth}"
            : $"{weekStart:dd} {startMonth}–{weekEnd:dd} {endMonth}";

        return $"Semana {weekNumber} | {range}";
    }

    private static string BuildDayNameLabel(string? value)
    {
        var parsed = ParseDisplayDate(value);
        if (!parsed.HasValue)
        {
            return "-";
        }

        var culture = new CultureInfo("es-PE");
        return culture.TextInfo.ToTitleCase(parsed.Value.ToString("dddd", culture));
    }

    private static (string Color, string Background) GetCallAttentionStateStyle(string? state) =>
        GetStateTone(state);

    private static string NormalizeCallAttentionState(string? state)
    {
        var text = EmptyIfMissing(state).ToUpperInvariant();
        text = text.Replace('Á', 'A').Replace('É', 'E').Replace('Í', 'I').Replace('Ó', 'O').Replace('Ú', 'U');
        text = text.Replace("  ", " ").Trim();
        return text;
    }

    private static string ResolveNotificationEstado(string? estado)
    {
        return NormalizeCallAttentionState(estado);
    }

    private static IContainer CallAttentionTableHeader(IContainer container) =>
        container.Background("#1F2A44").BorderBottom(1).BorderColor("#D0D5DD").PaddingVertical(7).PaddingHorizontal(6)
            .DefaultTextStyle(x => x.FontColor(Colors.White).Bold().FontSize(8));

    private static IContainer CallAttentionTableBody(IContainer container) =>
        container.BorderBottom(1).BorderColor("#E5E7EB").PaddingVertical(6).PaddingHorizontal(6)
            .DefaultTextStyle(x => x.FontSize(8).FontColor("#111827"));

    private static IContainer CallAttentionStateCell(IContainer container, string color, string background) =>
        container.Background(background).BorderBottom(1).BorderColor("#E5E7EB").PaddingVertical(6).PaddingHorizontal(6)
            .DefaultTextStyle(x => x.FontSize(8).FontColor(color));

    private sealed record WeeklyCallAttentionGroup(
        int WeekNumber,
        string Label,
        decimal SubtotalHoras,
        IReadOnlyList<AsistenciaReportePdfItemDto> Items);

    private static Document BuildGerencialDocument(
        ReporteWhatsappEmpleadoDto empleadoDestino,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var resumenEstados = BuildGerencialSummary(detalle);
        var resumenEmpleados = BuildGerencialResumen(detalle);
        var pieCharts = BuildGerencialPieCharts(resumenEmpleados);
        var generalChart = pieCharts.FirstOrDefault(x => x.Titulo == "GENERAL");
        var locationCharts = pieCharts.Where(x => x.Titulo != "GENERAL").ToList();
        var sectionHeroId = "resumen-estados";
        var sectionSummaryId = "resumen-principal";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(20);
                page.Size(PageSizes.A4.Landscape());
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.BlueGrey.Darken4));

                page.Content().Section(sectionHeroId).Column(column =>
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

                    column.Item().Column(summaryColumn =>
                    {
                        summaryColumn.Spacing(6);
                        summaryColumn.Item().Text("Resumen ejecutivo").Bold().FontSize(12).FontColor("#123B5D");
                        summaryColumn.Item().Element(c => RenderGerencialStatusCards(c, resumenEstados));

                        if (generalChart is not null)
                        {
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
                            columns.RelativeColumn(2f);
                            columns.RelativeColumn(1.8f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1.1f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(CellHeader).Text("Empleado / Fecha");
                            header.Cell().Element(CellHeader).Text("Responsable");
                            header.Cell().Element(CellHeader).AlignRight().Text("Total Horas");
                            header.Cell().Element(CellHeader).AlignRight().Text("Hrs Otros");
                            header.Cell().Element(CellHeader).AlignRight().Text("Falta aprobar");
                            header.Cell().Element(CellHeader).AlignRight().Text("Hrs. lab.");
                            header.Cell().Element(CellHeader).AlignRight().Text("Diferencia");
                            header.Cell().Element(CellHeader).AlignCenter().Text("Estado valid.");
                        });

                        // Agrupar por Ubicacion y ordenar por Diferencia dentro de cada grupo
                        var empleadosPorUbicacion = resumenEmpleados
                            .GroupBy(e => NormalizeGerencialUbicacion(e.Ubicacion))
                            .OrderBy(g => GetGerencialUbicacionSortOrder(g.Key))
                            .ThenBy(g => g.Key);

                        foreach (var grupo in empleadosPorUbicacion)
                        {
                            // Fila de título de ubicación
                            table.Cell().ColumnSpan(8).Element(CellHeader).Text($"UBICACION: {grupo.Key}").FontColor("#0F3D6E").Bold();

                            foreach (var empleado in grupo
                                .OrderBy(x => x.NombreEmpleado)
                                .ThenBy(x => string.IsNullOrWhiteSpace(x.Responsable) ? "SIN RESPONSABLE" : x.Responsable.Trim().ToUpperInvariant()))
                            {
                                var isRevisar = IsObservacionState(empleado.Estado);
                                table.Cell().Element(c => SummaryCell(c, isRevisar).SectionLink(BuildEmpleadoSectionId(empleado.IdEmpleado))).Text(empleado.NombreEmpleado);
                                table.Cell().Element(c => SummaryCell(c, isRevisar)).Text(EmptyIfMissing(empleado.Responsable));
                                table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.TotalHoras.ToString("0.00", CultureInfo.InvariantCulture));
                                table.Cell().Element(c => SummaryCell(c, empleado.HorasOtros > 0m)).AlignRight().Text(empleado.HorasOtros.ToString("0.00", CultureInfo.InvariantCulture));
                                table.Cell().Element(c => SummaryCell(c, empleado.FaltaAprobar > 0m)).AlignRight().Text(empleado.FaltaAprobar.ToString("0.00", CultureInfo.InvariantCulture));
                                table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.HorasLaboradas.ToString("0.00", CultureInfo.InvariantCulture));
                                table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignRight().Text(empleado.DiferenciaHoras.ToString("0.00", CultureInfo.InvariantCulture));
                                table.Cell().Element(c => SummaryCell(c, isRevisar)).AlignCenter().Text(empleado.Estado);
                            }
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
                    var isRevisar = IsObservacionState(empleado.Estado);

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
                                info.Item().Text($"Responsable: {EmptyIfMissing(empleado.Responsable)}");
                                info.Item().Text($"Ubicacion: {EmptyIfMissing(empleado.Ubicacion)}");
                                info.Item().Text($"Total Horas: {empleado.TotalHoras:0.00}");
                                info.Item().Text($"Hrs Otros: {empleado.HorasOtros:0.00}");
                                info.Item().Text($"Falta aprobar: {empleado.FaltaAprobar:0.00}");
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

            foreach (var estado in resumenEstados.Resumen)
            {
                container.Page(page =>
                {
                    var estadoActual = estado.EstadoMarcacionTexto;
                    var itemsEstado = detalle
                        .Where(x => string.Equals(
                            ResolveGerencialEstadoMarcacion(x),
                            estadoActual,
                            StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    page.Margin(20);
                    page.Size(PageSizes.A4.Landscape());
                    page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.BlueGrey.Darken4));

                    page.Content().Section(BuildEstadoSectionId(estadoActual)).Background(Colors.White).Border(1).BorderColor("#D9E2EC").Padding(12).Column(card =>
                    {
                        card.Spacing(8);
                        card.Item().Row(row =>
                        {
                            row.RelativeItem().Column(info =>
                            {
                                info.Item().Text($"Calendario por estado: {estadoActual}").Bold().FontSize(13).FontColor("#123B5D");
                                info.Item().Text($"Total registros: {estado.Cantidad} | Participacion: {estado.Porcentaje:0.00}%")
                                    .FontSize(8)
                                    .FontColor(Colors.Grey.Darken2);
                            });

                            row.ConstantItem(140).AlignRight().Column(actions =>
                            {
                                actions.Item().SectionLink(sectionHeroId).Text("Volver al resumen").FontColor("#2563EB").Underline();
                            });
                        });
                        card.Item().Element(c => RenderStateCalendar(c, periodo, estadoActual, itemsEstado));
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

    private static ReporteWhatsappAsistenciaItemDto MapValidationItemToReporte(AsistenciaReportePdfItemDto item) =>
        new()
        {
            IdEmpleado = item.IdEmpleado ?? 0,
            Fecha = item.Fecha,
            NombreEmpleado = item.NombreEmpleado,
            Responsable = item.Responsable,
            Ubicacion = item.Ubicacion,
            HoraEntrada = item.Hora,
            HoraSalida = item.Salida,
            Estado = item.Estado,
            EstadoMarcacionTexto = item.EstadoMarcacionTexto,
            TotalHoras = item.TotalHoras,
            TotalHorasFaltaIncompleto = item.TotalHorasFaltaIncompleto,
            TotalHorasEmpleado = item.TotalHorasEmpleado,
            TotalHorasLaborales = item.TotalHorasLaborales,
            TotalHorasFaltaAprobar = item.TotalHorasFaltaAprobar,
            DiferenciaHoras = item.DiferenciaHoras,
            EstadoValidacionHoras = item.EstadoValidacionHoras,
            Comentario = item.Comentario,
            Observacion = item.Observacion
        };

    private static AsistenciaReportePdfRequestDto BuildValidationRequestFromReporte(
        ReporteWhatsappEmpleadoDto empleadoDestino,
        ReporteWhatsappPeriodoDto periodo,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var startDate = ParseDisplayDate(periodo.FechaInicio);
        var endDate = ParseDisplayDate(periodo.FechaFin);
        var filteredDetalle = detalle
            .Where(item => IsDateWithinPeriod(ParseDisplayDate(item.Fecha), startDate, endDate))
            .ToList();

        return new AsistenciaReportePdfRequestDto
        {
            FechaInicio = periodo.FechaInicio,
            FechaFin = periodo.FechaFin,
            Destinatario = string.IsNullOrWhiteSpace(empleadoDestino.NombreEmpleado)
                ? "Reporte x Empleado"
                : empleadoDestino.NombreEmpleado,
            Items = filteredDetalle.Select(MapReporteWhatsappItemToValidationItem).ToList()
        };
    }

    private static IReadOnlyList<AsistenciaReportePdfItemDto> FilterValidationItemsByPeriodo(AsistenciaReportePdfRequestDto request)
    {
        var startDate = ParseDisplayDate(request.FechaInicio);
        var endDate = ParseDisplayDate(request.FechaFin);

        return request.Items
            .Where(item => item is not null)
            .Where(item => IsDateWithinPeriod(ParseDisplayDate(item.Fecha), startDate, endDate))
            .ToList();
    }

    private static AsistenciaReportePdfItemDto MapReporteWhatsappItemToValidationItem(ReporteWhatsappAsistenciaItemDto item) =>
        new()
        {
            Fecha = item.Fecha,
            Hora = item.HoraEntrada,
            NombreEmpleado = item.NombreEmpleado,
            Telefono = item.Telefono,
            Responsable = item.Responsable,
            Cliente = item.Cliente,
            Area = item.Area,
            Ubicacion = item.Ubicacion,
            IdEmpleado = item.IdEmpleado,
            Salida = item.HoraSalida,
            Estado = item.Estado,
            EstadoMarcacionTexto = item.EstadoMarcacionTexto,
            TotalHoras = item.TotalHoras,
            TotalHorasFaltaIncompleto = item.TotalHorasFaltaIncompleto,
            TotalHorasEmpleado = item.TotalHorasEmpleado,
            TotalHorasLaborales = item.TotalHorasLaborales,
            TotalHorasFaltaAprobar = item.TotalHorasFaltaAprobar,
            DiferenciaHoras = item.DiferenciaHoras,
            EstadoValidacionHoras = item.EstadoValidacionHoras,
            Comentario = item.Comentario,
            Observacion = item.Observacion
        };

    private static DateTime? ParseDisplayDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        var formats = new[]
        {
            "dd/MM/yyyy",
            "d/M/yyyy",
            "dd-MM-yyyy",
            "d-M-yyyy",
            "yyyy-MM-dd",
            "yyyy/MM/dd",
            "dd/MM/yyyy HH:mm:ss",
            "d/M/yyyy HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss.fff",
            "yyyy-MM-ddTHH:mm:ss.FFFFFFF"
        };

        if (DateTime.TryParseExact(trimmed, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed.Date;
        }

        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
        {
            return parsed.Date;
        }

        return null;
    }

    private static bool IsDateWithinPeriod(DateTime? value, DateTime? startDate, DateTime? endDate)
    {
        if (!value.HasValue)
        {
            return !startDate.HasValue && !endDate.HasValue;
        }

        if (startDate.HasValue && value.Value.Date < startDate.Value.Date)
        {
            return false;
        }

        if (endDate.HasValue && value.Value.Date > endDate.Value.Date)
        {
            return false;
        }

        return true;
    }

    private static string BuildFechaConDiaLabel(string? value)
    {
        var parsed = ParseDisplayDate(value);
        if (!parsed.HasValue)
        {
            return value?.Trim() ?? string.Empty;
        }

        var culture = new CultureInfo("es-PE");
        var dayName = culture.TextInfo.ToTitleCase(parsed.Value.ToString("dddd", culture));
        return $"{parsed.Value:dd/MM/yyyy} - {dayName}";
    }

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

    private static void RenderGerencialStatusCards(
        IContainer container,
        ReporteWhatsappPdfResumenDto resumen)
    {
        var totalCard = (
            Label: "Total registros",
            Value: resumen.TotalRegistros.ToString(CultureInfo.InvariantCulture),
            Accent: "#123B5D",
            Background: "#EFF6FF",
            SectionId: (string?)null
        );

        var stateCards = resumen.Resumen.Select(item =>
        {
            var (accent, background) = GetDynamicEstadoMarcacionCardColors(item.EstadoMarcacionTexto);
            return (
                Label: item.EstadoMarcacionTexto,
                Value: item.Cantidad.ToString(CultureInfo.InvariantCulture),
                Accent: accent,
                Background: background,
                SectionId: (string?)BuildEstadoSectionId(item.EstadoMarcacionTexto)
            );
        }).ToList();

        container.Column(column =>
        {
            column.Spacing(8);

            column.Item().Row(row =>
            {
                row.RelativeItem().Element(c => RenderSummaryMetricCard(c, totalCard.Label, totalCard.Value, totalCard.Accent, totalCard.Background, totalCard.SectionId));
                for (var i = 0; i < 5; i++)
                {
                    row.RelativeItem();
                }
            });

            foreach (var chunk in stateCards.Chunk(6))
            {
                column.Item().Row(row =>
                {
                    row.Spacing(8);
                    foreach (var card in chunk)
                    {
                        row.RelativeItem().Element(c => RenderSummaryMetricCard(c, card.Label, card.Value, card.Accent, card.Background, card.SectionId));
                    }

                    for (var i = chunk.Length; i < 6; i++)
                    {
                        row.RelativeItem();
                    }
                });
            }
        });
    }

    private static void RenderSummaryMetricCard(IContainer container, string title, string value, string accentColor, string backgroundColor, string? sectionId = null)
    {
        var cardContainer = container
            .Background(backgroundColor)
            .Border(1)
            .BorderColor("#D9E2EC")
            .Padding(10);

        if (!string.IsNullOrWhiteSpace(sectionId))
        {
            cardContainer = cardContainer.SectionLink(sectionId);
        }

        cardContainer.Column(card =>
        {
            card.Spacing(4);
            card.Item().Text(title).SemiBold().FontSize(9).FontColor(accentColor);
            card.Item().Text(value).Bold().FontSize(18).FontColor("#0F172A");
        });
    }

    private static void RenderEstadoKpiCards(
        IContainer container,
        ReporteWhatsappPdfResumenDto resumen,
        string? sectionLinkId = null,
        string? subtitle = null,
        IReadOnlyList<string>? customOrder = null,
        IReadOnlyDictionary<string, string>? customTitleMap = null,
        IReadOnlyDictionary<string, string>? customDescriptionMap = null)
    {
        var items = resumen.Resumen.ToList();

        if (customOrder is not null && customOrder.Count > 0)
        {
            var orderIndex = customOrder
                .Select((state, index) => new { state, index })
                .ToDictionary(item => item.state, item => item.index, StringComparer.OrdinalIgnoreCase);

            items = items
                .OrderBy(item => orderIndex.TryGetValue(item.EstadoMarcacionTexto, out var index) ? index : int.MaxValue)
                .ThenByDescending(item => item.Cantidad)
                .ThenBy(item => item.EstadoMarcacionTexto, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        else
        {
            items = items
                .OrderByDescending(item => item.Cantidad)
                .ThenBy(item => item.EstadoMarcacionTexto, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        if (items.Count == 0)
        {
            container.Background("#F8FAFC").Border(1).BorderColor(Colors.Grey.Lighten2).Padding(10).Text("No hay estados para mostrar.");
            return;
        }

        var max = Math.Max(1, items.First().Cantidad);

        container.Border(1).BorderColor(Colors.Grey.Lighten2).Padding(14).Column(column =>
        {
            column.Spacing(8);

            if (!string.IsNullOrWhiteSpace(subtitle))
            {
                column.Item().Text(subtitle).FontSize(8).FontColor("#667085");
            }

            foreach (var item in items)
            {
                var (accent, background) = GetDynamicEstadoMarcacionCardColors(item.EstadoMarcacionTexto);
                var sectionId = sectionLinkId is not null && string.Equals(item.EstadoMarcacionTexto, "PRESENTE", StringComparison.OrdinalIgnoreCase)
                    ? sectionLinkId
                    : null;
                var fillPercent = (float)item.Cantidad / max;
                var fillUnits = Math.Max(1, (int)Math.Round(fillPercent * 100));
                var emptyUnits = Math.Max(1, 100 - fillUnits);

                column.Item().Background(background).Border(1).BorderColor("#D9E2EC").PaddingVertical(10).PaddingHorizontal(10).Column(card =>
                {
                    card.Spacing(6);

                    card.Item().Row(row =>
                    {
                        row.Spacing(10);
                        row.ConstantItem(6).Height(28).Background(accent);
                        row.ConstantItem(150).Column(label =>
                        {
                            label.Spacing(1);
                            var stateText = label.Item();
                            if (!string.IsNullOrWhiteSpace(sectionId))
                            {
                                stateText = stateText.SectionLink(sectionId);
                            }

                            var stateTitle = customTitleMap is not null && customTitleMap.TryGetValue(item.EstadoMarcacionTexto, out var mappedTitle)
                                ? mappedTitle
                                : item.EstadoMarcacionTexto;
                            var stateDescription = customDescriptionMap is not null && customDescriptionMap.TryGetValue(item.EstadoMarcacionTexto, out var mappedDescription)
                                ? mappedDescription
                                : "Estado";

                            stateText.Text(stateTitle).SemiBold().FontSize(10).FontColor("#0F172A");
                            label.Item().Text(stateDescription).FontSize(7).FontColor("#64748B");
                        });

                        row.RelativeItem().Column(barColumn =>
                        {
                            barColumn.Spacing(4);
                            barColumn.Item().Height(16).Element(bar =>
                            {
                                bar.Border(1).BorderColor(background).Background("#E5E7EB").Padding(1).Row(inner =>
                                {
                                    inner.RelativeItem(fillUnits).Background(accent);
                                    inner.RelativeItem(emptyUnits).Background("#E5E7EB");
                                });
                            });

                            barColumn.Item().Text($"{item.Porcentaje:0.00}% del total").FontSize(7.5f).FontColor("#667085");
                        });

                        row.ConstantItem(68).AlignRight().Column(metric =>
                        {
                            metric.Spacing(1);
                            metric.Item().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture)).Bold().FontSize(13).FontColor(accent);
                            metric.Item().Text("registros").FontSize(7).FontColor("#667085");
                        });
                    });
                });
            }
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
        var estados = detalle
            .SelectMany(x => SplitEstadoMarcacion(x.EstadoMarcacionTexto))
            .ToList();
        var total = estados.Count;
        var resumen = estados
            .GroupBy(x => x)
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

    private static ReporteWhatsappPdfResumenDto BuildGerencialSummary(IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var estados = detalle
            .Select(item => ResolveNotificationEstado(item.Estado))
            .ToList();
        var total = estados.Count;
        var resumen = estados
            .GroupBy(x => x)
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

    private static ReporteWhatsappPdfResumenDto BuildPresentStateSummary(IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle)
    {
        var presentes = detalle
            .Where(item => IsOnlyPresentState(item.EstadoMarcacionTexto) || string.Equals(ResolveNotificationEstado(item.EstadoMarcacionTexto), "PRESENTE", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var estados = presentes
            .Select(item => ResolveNotificationEstado(item.Estado))
            .Where(estado => !string.IsNullOrWhiteSpace(estado))
            .ToList();
        var total = estados.Count;
        var resumen = estados
            .GroupBy(x => x)
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
            .Where(x => x.IdEmpleado > 0 && !string.IsNullOrWhiteSpace(x.NombreEmpleado))
            .GroupBy(x => x.IdEmpleado)
            .Select(group =>
            {
                // El resumen gerencial debe respetar los acumulados que devuelve el store.
                // No usamos la primera fila cronologica porque puede contener un valor diario/parcial.
                var summaryRow = group
                    .OrderByDescending(GetGerencialSummaryScore)
                    .ThenByDescending(x => x.TotalHorasEmpleado)
                    .ThenByDescending(x => x.TotalHoras)
                    .ThenBy(x => ParseDate(x.Fecha))
                    .First();
                var estado = group
                    .Select(x => x.EstadoValidacionHoras?.Trim())
                    .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
                    ?? "SIN ESTADO";

                return new ReporteGerencialEmpleadoResumenDto
                {
                    IdEmpleado = group.Key,
                    NombreEmpleado = summaryRow.NombreEmpleado,
                    Responsable = summaryRow.Responsable,
                    Ubicacion = summaryRow.Ubicacion,
                    TotalHoras = summaryRow.TotalHorasEmpleado,
                    HorasOtros = summaryRow.TotalHorasFaltaIncompleto,
                    FaltaAprobar = summaryRow.TotalHorasFaltaAprobar,
                    HorasLaboradas = summaryRow.TotalHorasLaborales,
                    DiferenciaHoras = summaryRow.DiferenciaHoras,
                    Estado = estado,
                    Calendario = group
                        .OrderBy(x => ParseDate(x.Fecha))
                        .ToList()
                };
            })
            .OrderBy(x => GetGerencialUbicacionSortOrder(NormalizeGerencialUbicacion(x.Ubicacion)))
            .ThenBy(x => NormalizeGerencialUbicacion(x.Ubicacion))
            .ThenBy(x => x.NombreEmpleado)
            .ToList();
    }

    private static decimal GetGerencialSummaryScore(ReporteWhatsappAsistenciaItemDto item)
    {
        return Math.Abs(item.TotalHorasEmpleado)
            + Math.Abs(item.TotalHoras)
            + Math.Abs(item.TotalHorasFaltaIncompleto)
            + Math.Abs(item.TotalHorasFaltaAprobar)
            + Math.Abs(item.TotalHorasLaborales)
            + Math.Abs(item.DiferenciaHoras);
    }

    private static IReadOnlyList<ReporteGerencialPieChartDto> BuildGerencialPieCharts(IReadOnlyList<ReporteGerencialEmpleadoResumenDto> resumen)
    {
        var result = new List<ReporteGerencialPieChartDto>
        {
            BuildPieChart("GENERAL", string.Empty, resumen)
        };

        foreach (var group in resumen
            .GroupBy(x => NormalizeGerencialUbicacion(x.Ubicacion))
            .OrderBy(x => GetGerencialUbicacionSortOrder(x.Key))
            .ThenBy(x => x.Key))
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
                    var status = item is null ? "-" : ResolveGerencialEstadoMarcacion(item);
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

    private static void RenderStateCalendar(
        IContainer container,
        ReporteWhatsappPeriodoDto periodo,
        string estado,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> items)
    {
        var parsedInicio = ParseDate(periodo.FechaInicio);
        var parsedFin = ParseDate(periodo.FechaFin);
        var reference = parsedInicio
            ?? items.Select(x => ParseDate(x.Fecha)).FirstOrDefault(x => x.HasValue)
            ?? DateTime.Today;
        var firstDay = new DateTime(reference.Year, reference.Month, 1);
        var lastDay = new DateTime(reference.Year, reference.Month, DateTime.DaysInMonth(reference.Year, reference.Month));
        var countsByDate = items
            .Select(item => ParseDate(item.Fecha))
            .Where(date => date.HasValue)
            .GroupBy(date => date!.Value.Date)
            .ToDictionary(group => group.Key, group => group.Count());

        container.Column(column =>
        {
            column.Spacing(6);
            column.Item().Text($"Calendario {firstDay:MMMM yyyy}".ToUpperInvariant()).Bold().FontSize(11).FontColor("#123B5D");
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
                    table.Cell().Element(CellHeader).AlignCenter().Text(dayName).FontSize(9);
                }

                var firstColumn = ((int)firstDay.DayOfWeek + 6) % 7;
                for (var i = 0; i < firstColumn; i++)
                {
                    table.Cell().Element(c => EmptyCalendarCell(c, compact: false)).Text(string.Empty);
                }

                for (var day = 1; day <= lastDay.Day; day++)
                {
                    var date = new DateTime(firstDay.Year, firstDay.Month, day);
                    countsByDate.TryGetValue(date.Date, out var count);
                    var withinPeriodo = (!parsedInicio.HasValue || date.Date >= parsedInicio.Value.Date)
                        && (!parsedFin.HasValue || date.Date <= parsedFin.Value.Date);

                    table.Cell().Element(c => StateCalendarCell(c, estado, count, withinPeriodo)).Column(cell =>
                    {
                        cell.Item().AlignRight().Text(day.ToString(CultureInfo.InvariantCulture)).FontSize(8).SemiBold();
                        cell.Item().PaddingTop(4).Text(withinPeriodo ? estado : "Fuera de rango").FontSize(7);
                        cell.Item().Text(withinPeriodo ? $"Cantidad: {count}" : "-").FontSize(6).SemiBold();
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

    private static IContainer StateCalendarCell(IContainer container, string estado, int count, bool withinPeriodo) =>
        container
            .Border(1)
            .BorderColor("#E2E8F0")
            .MinHeight(72)
            .Background(withinPeriodo ? GetStateCountBackground(estado, count) : "#F8FAFC")
            .Padding(4);

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

    private static string GetStateCountBackground(string estado, int count)
    {
        if (count <= 0)
        {
            return "#F8FAFC";
        }

        var (_, background) = GetDynamicEstadoMarcacionCardColors(estado);
        return background;
    }

    private static string NormalizeGerencialUbicacion(string? ubicacion)
    {
        var normalized = string.IsNullOrWhiteSpace(ubicacion) ? "SIN UBICACION" : ubicacion.Trim().ToUpperInvariant();

        return normalized switch
        {
            "CAMPO" => "CAMPO",
            "CIENEGUILLA" => "CIENEGUILLA",
            "OFICINA" => "OFICINA",
            _ => normalized
        };
    }

    private static int GetGerencialUbicacionSortOrder(string ubicacion)
    {
        return ubicacion switch
        {
            "CAMPO" => 0,
            "CIENEGUILLA" => 1,
            "OFICINA" => 2,
            _ => 99
        };
    }

    private static string BuildEmpleadoSectionId(int idEmpleado) => $"empleado-{idEmpleado}";

    private static string BuildEstadoSectionId(string estado) =>
        $"estado-{NormalizeAnchorValue(estado)}";

    private static string BuildPresentStateSectionId() => "kpi-presente-principal";

    private static string NormalizeAnchorValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "sin-clasificar";
        }

        var normalized = value.Trim().ToLowerInvariant();
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized.Normalize(NormalizationForm.FormD))
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(char.IsLetterOrDigit(character) ? character : '-');
        }

        return builder
            .ToString()
            .Trim('-');
    }

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

    private static (string Accent, string Background) GetDynamicEstadoMarcacionCardColors(string? estado) =>
        GetStateTone(estado);

    private static (string Accent, string Background) GetStateTone(string? state)
    {
        var normalized = NormalizeCallAttentionState(state);

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return ("#64748B", "#F1F5F9");
        }

        if (normalized.StartsWith("PRESENTE", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("ASISTIO", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("ASISTENCIA", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("OK", StringComparison.OrdinalIgnoreCase))
        {
            return ("#166534", "#EAF7EE");
        }

        if (normalized.Contains("FALTA APROBAR", StringComparison.OrdinalIgnoreCase))
        {
            return ("#9A3412", "#FFF7ED");
        }

        if (normalized.Contains("FUERA DE HORARIO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#B91C1C", "#FEE2E2");
        }

        if (normalized.Contains("TOLERANCIA", StringComparison.OrdinalIgnoreCase))
        {
            return ("#A16207", "#FEF9C3");
        }

        if (normalized.Contains("FALTA", StringComparison.OrdinalIgnoreCase))
        {
            return ("#991B1B", "#FEF2F2");
        }

        if (normalized.Contains("VACACIONES", StringComparison.OrdinalIgnoreCase))
        {
            return ("#0F766E", "#CCFBF1");
        }

        if (normalized.Contains("COMPENSACION", StringComparison.OrdinalIgnoreCase))
        {
            return ("#6D28D9", "#EDE9FE");
        }

        if (normalized.Contains("DOMINGO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#15803D", "#DCFCE7");
        }

        if (normalized.Contains("SABADO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#CA8A04", "#FFFBEB");
        }

        if (normalized.Contains("FERIADO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#0369A1", "#E0F2FE");
        }

        if (normalized.Contains("SIN MARCAR", StringComparison.OrdinalIgnoreCase))
        {
            return ("#BE123C", "#FFE4E6");
        }

        if (normalized.Contains("SIN SALIDA", StringComparison.OrdinalIgnoreCase))
        {
            return ("#C2410C", "#FFEDD5");
        }

        if (normalized.Contains("SIN ENTRADA", StringComparison.OrdinalIgnoreCase))
        {
            return ("#D97706", "#FEF3C7");
        }

        if (normalized.Contains("INCOMPLETO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#0E7490", "#CFFAFE");
        }

        if (normalized.Contains("RECHAZADO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#4B5563", "#E5E7EB");
        }

        if (normalized.Contains("DESCANSO", StringComparison.OrdinalIgnoreCase) || normalized.Contains("MEDICO", StringComparison.OrdinalIgnoreCase))
        {
            return ("#1D4ED8", "#DBEAFE");
        }

        if (normalized.Contains("CLASIFIC", StringComparison.OrdinalIgnoreCase))
        {
            return ("#475467", "#F2F4F7");
        }

        return ("#4F46E5", "#E0E7FF");
    }

    private static IReadOnlyList<string> SplitEstadoMarcacion(string? estadoMarcacionTexto)
    {
        if (string.IsNullOrWhiteSpace(estadoMarcacionTexto))
        {
            return ["SIN CLASIFICAR"];
        }

        var estados = estadoMarcacionTexto
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => string.IsNullOrWhiteSpace(item) ? "SIN CLASIFICAR" : item.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return estados.Length == 0 ? ["SIN CLASIFICAR"] : estados;
    }

    private static bool IsOnlyPresentState(string? estadoMarcacionTexto)
    {
        var estados = SplitEstadoMarcacion(estadoMarcacionTexto);
        return estados.Count > 0 && estados.All(state => PresentStates.Contains(state));
    }

    private static bool IsWeekendState(string? estadoMarcacionTexto)
    {
        var estados = SplitEstadoMarcacion(estadoMarcacionTexto);
        return estados.Count > 0 && estados.All(state => state is "SABADO" or "SÁBADO" or "DOMINGO");
    }

    private static bool IsHolidayState(string? estadoMarcacionTexto)
    {
        var estados = SplitEstadoMarcacion(estadoMarcacionTexto);
        return estados.Count > 0 && estados.All(state => state == "FERIADO");
    }

    private static string ResolveGerencialEstadoMarcacion(ReporteWhatsappAsistenciaItemDto item)
    {
        var estado = ResolveGerencialEstadoMarcacionRaw(item);
        return string.IsNullOrWhiteSpace(estado)
            ? "SIN CLASIFICAR"
            : estado.Trim().ToUpperInvariant();
    }

    private static string ResolveGerencialEstadoMarcacionRaw(ReporteWhatsappAsistenciaItemDto item)
    {
        if (!string.IsNullOrWhiteSpace(item.EstadoMarcacionTexto))
        {
            return item.EstadoMarcacionTexto;
        }

        if (!string.IsNullOrWhiteSpace(item.Estado))
        {
            return item.Estado;
        }

        return "SIN CLASIFICAR";
    }

    private static string GetGerencialStateColor(string status) =>
        IsObservacionState(status) ? "#F04438" : "#12B76A";

    private static bool IsObservacionState(string? status)
    {
        return !string.Equals(status?.Trim(), "CORRECTO", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status?.Trim(), "COMPLETO", StringComparison.OrdinalIgnoreCase);
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

    private static Document BuildExecutiveGerencialDocument(AsistenciaGerencialPdfDto reporte)
    {
        QuestPDF.Settings.EnableDebugging = true;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                ConfigureExecutivePage(page, reporte, "1");

                page.Content().Column(column =>
                {
                    column.Spacing(10);
                    column.Item().Element(c => RenderExecutiveHero(c, reporte));
                    column.Item().Element(c => RenderExecutiveKpis(c, reporte));
                    column.Item().Element(c => RenderStateCompositionBars(c, reporte.Graficos.DistribucionPorEstado));
                });
            });

            container.Page(page =>
            {
                ConfigureExecutivePage(page, reporte, "2");

                page.Content().Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Text("Analisis de gestion").Bold().FontSize(16).FontColor("#0F3D6E");
                    column.Item().Element(c => RenderExecutiveBubbleCard(c, "Responsables criticos", reporte.Graficos.TopResponsables));
                    column.Item().Element(c => RenderExecutiveLollipopCard(c, "Empleados con mayor brecha", reporte.Graficos.TopEmpleados));
                });
            });

            container.Page(page =>
            {
                ConfigureExecutivePage(page, reporte, "3");

                page.Content().Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Text("Segmentacion y plan de accion").Bold().FontSize(16).FontColor("#0F3D6E");
                    column.Item().Element(c => RenderExecutiveDonutCard(c, "Incidencias por cliente", reporte.Incidencias.IncidenciasPorCliente));
                    column.Item().Row(row =>
                    {
                        row.Spacing(10);
                        row.RelativeItem().Element(c => RenderExecutiveTreemapCard(c, "Incidencias por area", reporte.Incidencias.IncidenciasPorArea));
                        row.RelativeItem().Element(c => RenderExecutiveRiskPanel(c, reporte));
                    });
                });
            });
        });
    }

    private static void ConfigureExecutivePage(PageDescriptor page, AsistenciaGerencialPdfDto reporte, string pageMarker)
    {
        page.Size(PageSizes.A4);
        page.Margin(22);
        page.DefaultTextStyle(x => x.FontSize(9).FontColor("#334155"));

        page.Header().Element(header =>
        {
            header.BorderBottom(1).BorderColor("#D9E2EC").PaddingBottom(8).Row(row =>
            {
                row.RelativeItem().Column(left =>
                {
                    left.Item().Text("CJ TELECOM").Bold().FontSize(18).FontColor("#0F3D6E");
                    left.Item().Text("Reporte de Asistencia").FontSize(12).SemiBold().FontColor("#1E3A5F");
                });

                row.ConstantItem(210).AlignRight().Column(right =>
                {
                    right.Item().Text($"Periodo: {reporte.PeriodoConsultado}").FontSize(9);
                    right.Item().Text($"Generado: {reporte.FechaGeneracion:dd/MM/yyyy HH:mm}").FontSize(9);
                    right.Item().Text($"Pagina ejecutiva {pageMarker}/3").FontSize(9).FontColor("#64748B");
                });
            });
        });

        page.Footer().AlignCenter().Text(text =>
        {
            text.Span("Cj Telecom - Reporte Gerencial de Asistencia | ");
            text.CurrentPageNumber();
            text.Span(" / ");
            text.TotalPages();
        });
    }

    private static void RenderExecutiveHero(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var status = reporte.Kpis.PorcentajeAsistencia >= 95m ? "SATISFACTORIO" : "ALERTA";
        var statusColor = reporte.Kpis.PorcentajeAsistencia >= 95m ? "#027A48" : "#B42318";
        var statusBg = reporte.Kpis.PorcentajeAsistencia >= 95m ? "#D1FADF" : "#FEE4E2";

        container.Background("#F8FAFC").Border(1).BorderColor("#16A34A").Padding(14).Row(row =>
        {
            row.RelativeItem().Column(left =>
            {
                left.Spacing(2);
                left.Item().Text("Dashboard de asistencia").Bold().FontSize(17).FontColor("#0F3D6E");
                //left.Item().Text($"Periodo consultado: {reporte.PeriodoConsultado}").FontSize(10);
                //left.Item().Text($"Destinatario: {reporte.Destinatario}").FontSize(10);
            });

            row.ConstantItem(160).AlignMiddle().Element(card =>
            {
                card.Background(statusBg).Border(1).BorderColor(statusColor).Padding(10).Column(info =>
                {
                    info.Spacing(2);
                    info.Item().Text("Estado general").FontSize(10).FontColor("#475467");
                    info.Item().Text(status).Bold().FontSize(18).FontColor(statusColor);
                });
            });
        });
    }

    private static void RenderExecutiveKpis(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var metrics = new[]
        {
            ("Asistencia efectiva", $"{reporte.Kpis.PorcentajeAsistencia:0.00}%", "Meta 95%", "#027A48", "#D1FADF"),
            ("Incidencias criticas", GetCriticalCount(reporte).ToString(CultureInfo.InvariantCulture), "Faltas / rechazados / sin marcar", "#B42318", "#FEE4E2"),
            ("Empleados en riesgo", reporte.Kpis.EmpleadosConDiferenciaNegativa.ToString(CultureInfo.InvariantCulture), "Con brecha negativa", "#B42318", "#FEE4E2"),
            ("Total registros", reporte.Kpis.TotalRegistros.ToString(CultureInfo.InvariantCulture), "Marcaciones procesadas", "#0F3D6E", "#ECFDF3")
        };

        container.Row(row =>
        {
            row.Spacing(10);
            foreach (var metric in metrics)
            {
                row.RelativeItem().Element(c => RenderMetricCard(c, metric.Item1, metric.Item2, metric.Item3, metric.Item4, metric.Item5));
            }
        });
    }

    private static void RenderMetricCard(IContainer container, string title, string value, string caption, string accent, string background)
    {
        container.Background(background).Border(1).BorderColor(accent).Padding(12).Column(column =>
        {
            column.Spacing(4);
            column.Item().Text(title).SemiBold().FontSize(10).FontColor("#475467");
            column.Item().Text(value).Bold().FontSize(18).FontColor(accent);
            column.Item().Text(caption).FontSize(9).FontColor("#667085");
        });
    }

    private static void RenderStateCompositionBars(IContainer container, IReadOnlyList<AsistenciaGerencialEstadoChartItemDto> items)
    {
        var ordered = items
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Estado, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var max = Math.Max(1, ordered.FirstOrDefault()?.Cantidad ?? 1);

        container.Border(1).BorderColor("#D9E2EC").Padding(14).Column(column =>
        {
            column.Spacing(8);
            column.Item().Text("Composicion de estados").Bold().FontSize(12).FontColor("#0F3D6E");

            foreach (var item in ordered)
            {
                var fillPercent = (float)item.Cantidad / max;
                var tone = GetToneColors(item.Semaforo);

                column.Item().Row(row =>
                {
                    row.Spacing(8);
                    row.ConstantItem(140).Text(item.Estado).FontSize(10).FontColor("#1F2937");
                    row.RelativeItem().Height(14).Element(bar =>
                    {
                        var fillUnits = Math.Max(1, (int)Math.Round(fillPercent * 100));
                        var emptyUnits = Math.Max(1, 100 - fillUnits);

                        bar.Row(inner =>
                        {
                            inner.RelativeItem(fillUnits).Background(tone.Accent);
                            inner.RelativeItem(emptyUnits).Background("#E5E7EB");
                        });
                    });
                    row.ConstantItem(42).AlignRight().Text($"{item.Porcentaje:0.#}%").FontSize(10);
                    row.ConstantItem(40).AlignRight().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(10);
                });
            }
        });
    }

    private static void RenderExecutiveBubbleCard(IContainer container, string title, IReadOnlyList<AsistenciaGerencialRankingItemDto> items)
    {
        var topItems = items.Take(7).ToList();
        container.Border(1).BorderColor("#D9E2EC").Padding(12).Column(column =>
        {
            column.Spacing(6);
            column.Item().Text(title).Bold().FontSize(12).FontColor("#0F3D6E");
            column.Item().Text("Estados considerados (EstadoMarcacionTexto): FALTA, FALTA APROBAR, INCOMPLETO y RECHAZADO.")
                .FontSize(8)
                .FontColor("#667085");
            column.Item().AlignCenter().Height(220).Svg(BuildSimpleBubbleSvg(topItems));
            column.Item().Column(legend =>
            {
                legend.Spacing(2);
                foreach (var item in topItems.Take(3))
                {
                    legend.Item().Text($"{item.Nombre}: {item.Cantidad} inc. / {item.Horas:0.##} h").FontSize(8).FontColor("#334155");
                }
            });
        });
    }

    private static void RenderExecutiveLollipopCard(IContainer container, string title, IReadOnlyList<AsistenciaGerencialRankingItemDto> items)
    {
        var topItems = items.Take(7).ToList();
        container.Border(1).BorderColor("#D9E2EC").Padding(12).Column(column =>
        {
            column.Spacing(6);
            column.Item().Text(title).Bold().FontSize(12).FontColor("#0F3D6E");
            column.Item().AlignCenter().Height(220).Svg(BuildSimpleLollipopSvg(topItems));
            column.Item().Column(summary =>
            {
                summary.Spacing(2);
                foreach (var item in topItems.Take(3))
                {
                    summary.Item().Text($"{item.Nombre}: {item.Horas:0.##} h / {item.Cantidad} inc.").FontSize(8).FontColor("#334155");
                }
            });
        });
    }

    private static void RenderExecutiveDonutCard(IContainer container, string title, IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> items)
    {
        var topItems = items.Take(6).ToList();
        container.Border(1).BorderColor("#D9E2EC").Padding(12).Column(column =>
        {
            column.Spacing(8);
            column.Item().Text(title).Bold().FontSize(12).FontColor("#0F3D6E");
            column.Item().Text("Calculo: total de incidencias agrupadas por cliente sobre los estados criticos del periodo. La leyenda muestra cliente, porcentaje de participacion y cantidad de registros.")
                .FontSize(8)
                .FontColor("#667085");
            column.Item().AlignCenter().Height(220).Svg(BuildSimpleDonutSvg(topItems));
            column.Item().Column(summary =>
            {
                summary.Spacing(2);
                foreach (var item in topItems.Take(3))
                {
                    summary.Item().Text($"{item.Nombre}: {item.Porcentaje:0.##}% | {item.Cantidad} registros").FontSize(8).FontColor("#334155");
                }
            });
        });
    }

    private static void RenderExecutiveTreemapCard(IContainer container, string title, IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> items)
    {
        var topItems = items.Take(6).ToList();
        container.Border(1).BorderColor("#D9E2EC").Padding(12).Column(column =>
        {
            column.Spacing(8);
            column.Item().Text(title).Bold().FontSize(12).FontColor("#0F3D6E");
            column.Item().Column(summary =>
            {
                summary.Spacing(6);
                foreach (var indexed in topItems.Select((value, index) => new { value, index }))
                {
                    summary.Item().Column(block =>
                    {
                        block.Spacing(2);
                        block.Item().Row(row =>
                        {
                            row.RelativeItem().Text(indexed.value.Nombre).FontSize(9).SemiBold().FontColor("#1F2937");
                            row.ConstantItem(36).AlignRight().Text(indexed.value.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(9);
                            row.ConstantItem(52).AlignRight().Text($"{indexed.value.Porcentaje:0.##}%").FontSize(9);
                        });
                        block.Item().Height(16).Background("#E5E7EB").Row(row =>
                        {
                            var fillUnits = Math.Max(1, (int)Math.Round(indexed.value.Porcentaje));
                            var emptyUnits = Math.Max(1, 100 - fillUnits);
                            row.RelativeItem(fillUnits).Background(GetPaletteColor(indexed.index));
                            row.RelativeItem(emptyUnits).Background("#E5E7EB");
                        });
                    });
                }
            });
        });
    }

    private static void RenderExecutiveRiskPanel(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var conclusions = BuildExecutiveReadingRows(reporte);
        var recommendations = MergeRecommendations(conclusions, reporte.Incidencias.RecomendacionesEjecutivas).Take(8).ToList();

        container.Border(1).BorderColor("#D9E2EC").Padding(12).Column(column =>
        {
            column.Spacing(8);
            column.Item().Text("Riesgo y plan de accion").Bold().FontSize(12).FontColor("#0F3D6E");
            foreach (var item in recommendations)
            {
                column.Item().Row(row =>
                {
                    row.ConstantItem(10).Text("•").FontColor("#1D4ED8");
                    row.RelativeItem().Text(item).FontSize(9).FontColor("#334155");
                });
            }
        });
    }

    private static IReadOnlyList<string> BuildExecutiveReadingRows(AsistenciaGerencialPdfDto reporte)
    {
        var rows = new List<string>
        {
            $"La asistencia efectiva del periodo es {reporte.Kpis.PorcentajeAsistencia:0.00}%, frente a una meta sugerida de 95%."
        };

        var alertStates = reporte.Graficos.DistribucionPorEstado
            .Where(item => string.Equals(item.Semaforo, "ROJO", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Cantidad)
            .Take(3)
            .ToList();

        if (alertStates.Count > 0)
        {
            rows.Add($"Se identifican {string.Join(", ", alertStates.Select(item => $"{item.Cantidad} registros en {item.Estado.ToLowerInvariant()}"))}.");
        }

        return rows;
    }

    private static IReadOnlyList<string> MergeRecommendations(IReadOnlyList<string> executiveRows, IReadOnlyList<string> recommendations)
    {
        return executiveRows
            .Concat(recommendations)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static (string Accent, string Background) GetToneColors(string tone)
    {
        return tone?.Trim().ToUpperInvariant() switch
        {
            "ROJO" => ("#F04438", "#FEE4E2"),
            "AMARILLO" => ("#F79009", "#FEF3C7"),
            _ => ("#12B76A", "#D1FADF")
        };
    }

    private static int GetCriticalCount(AsistenciaGerencialPdfDto reporte) =>
        reporte.Graficos.DistribucionPorEstado
            .Where(item => string.Equals(item.Semaforo, "ROJO", StringComparison.OrdinalIgnoreCase))
            .Sum(item => item.Cantidad);

    private static string BuildSimpleBubbleSvg(IReadOnlyList<AsistenciaGerencialRankingItemDto> items)
    {
        if (items.Count == 0)
        {
            return EmptyExecutiveSvg("Sin datos para visualizar");
        }

        var positions = new (double X, double Y)[] { (90, 95), (215, 85), (330, 100), (430, 82), (145, 155), (275, 145), (385, 145) };
        var max = Math.Max(1, items.Max(item => item.Cantidad));
        var builder = new StringBuilder();
        builder.Append("""<svg width="500" height="220" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg">""");
        builder.Append("""<rect x="0" y="0" width="500" height="220" fill="#FFFFFF" />""");

        for (var i = 0; i < items.Count && i < positions.Length; i++)
        {
            var item = items[i];
            var radius = 24 + (item.Cantidad * 28d / max);
            var color = GetPaletteColor(i);
            builder.Append($"""<circle cx="{positions[i].X:0.##}" cy="{positions[i].Y:0.##}" r="{radius:0.##}" fill="{color}" fill-opacity="0.9" />""");
            builder.Append($"""<text x="{positions[i].X:0.##}" y="{positions[i].Y - 2:0.##}" text-anchor="middle" font-size="18" font-weight="700" fill="#111827">{item.Cantidad}</text>""");
            builder.Append($"""<text x="{positions[i].X:0.##}" y="{positions[i].Y + 16:0.##}" text-anchor="middle" font-size="8" fill="#111827">{EscapeXml(ShortenName(item.Nombre, 18))}</text>""");
        }

        builder.Append("</svg>");
        return builder.ToString();
    }

    private static string BuildSimpleLollipopSvg(IReadOnlyList<AsistenciaGerencialRankingItemDto> items)
    {
        if (items.Count == 0)
        {
            return EmptyExecutiveSvg("Sin datos para visualizar");
        }

        var ordered = items.OrderBy(item => item.Horas).ToList();
        var maxAbs = Math.Max(1m, ordered.Max(item => Math.Abs(item.Horas)));
        var builder = new StringBuilder();
        builder.Append("""<svg width="500" height="220" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg">""");
        builder.Append("""<rect x="0" y="0" width="500" height="220" fill="#FFFFFF" />""");

        for (var i = 0; i < ordered.Count; i++)
        {
            var item = ordered[i];
            var y = 22 + (i * 27);
            var startX = 170d;
            var endX = startX + (double)(Math.Abs(item.Horas) * 250m / maxAbs);
            builder.Append($"""<text x="0" y="{y + 4:0.##}" font-size="8" fill="#111827">{EscapeXml(ShortenName(item.Nombre, 24))}</text>""");
            builder.Append($"""<line x1="{startX:0.##}" y1="{y:0.##}" x2="{endX:0.##}" y2="{y:0.##}" stroke="#CBD5E1" stroke-width="3" />""");
            builder.Append($"""<circle cx="{endX:0.##}" cy="{y:0.##}" r="6" fill="#EF4444" />""");
            builder.Append($"""<text x="{endX + 8:0.##}" y="{y + 4:0.##}" font-size="8" fill="#111827">{item.Horas:0.##}</text>""");
        }

        builder.Append("</svg>");
        return builder.ToString();
    }

    private static string BuildSimpleDonutSvg(IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> items)
    {
        if (items.Count == 0)
        {
            return EmptyExecutiveSvg("Sin datos para visualizar");
        }

        var total = Math.Max(1, items.Sum(item => item.Cantidad));
        var centerX = 170d;
        var centerY = 110d;
        var radius = 64d;
        var innerRadius = 34d;
        var startAngle = -90d;
        var builder = new StringBuilder();
        builder.Append("""<svg width="500" height="220" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg">""");
        builder.Append("""<rect x="0" y="0" width="500" height="220" fill="#FFFFFF" />""");

        foreach (var indexed in items.Select((value, index) => new { value, index }))
        {
            var sweep = indexed.value.Cantidad * 360d / total;
            builder.Append(BuildSlice(centerX, centerY, radius, startAngle, startAngle + sweep, GetPaletteColor(indexed.index)));
            startAngle += sweep;
        }

        builder.Append($"""<circle cx="{centerX}" cy="{centerY}" r="{innerRadius}" fill="#FFFFFF" />""");
        builder.Append($"""<text x="{centerX}" y="{centerY - 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#0F3D6E">{total}</text>""");
        builder.Append($"""<text x="{centerX}" y="{centerY + 12}" text-anchor="middle" font-size="8" fill="#64748B">incidencias</text>""");

        var legendY = 42;
        foreach (var indexed in items.Select((value, index) => new { value, index }))
        {
            builder.Append($"""<rect x="290" y="{legendY}" width="10" height="10" fill="{GetPaletteColor(indexed.index)}" />""");
            builder.Append($"""<text x="306" y="{legendY + 9}" font-size="8" fill="#111827">{EscapeXml(ShortenName(indexed.value.Nombre, 16))} {indexed.value.Porcentaje:0.#}% ({indexed.value.Cantidad})</text>""");
            legendY += 22;
        }

        builder.Append("</svg>");
        return builder.ToString();
    }

    private static string EmptyExecutiveSvg(string message) =>
        $"""<svg width="500" height="220" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="500" height="220" fill="#FFFFFF" /><text x="250" y="110" text-anchor="middle" font-size="10" fill="#64748B">{EscapeXml(message)}</text></svg>""";

    private static string ShortenName(string? value, int maxLength)
    {
        var text = EmptyIfMissing(value);
        return text.Length <= maxLength ? text : text[..Math.Max(0, maxLength - 1)] + "…";
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
