using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

public sealed class PlanillaBoletaPdfGenerator
{
    private const string BrandPrimary = "#102A43";
    private const string BrandAccent = "#2F80ED";
    private const string Surface = "#F7FAFC";
    private const string Border = "#D9E2EC";
    private const string TextPrimary = "#1F2933";
    private const string TextMuted = "#52606D";
    private const string IncomeBg = "#E6F4EA";
    private const string IncomeText = "#137333";
    private const string DiscountBg = "#FFF4E5";
    private const string DiscountText = "#B54708";
    private const string NetBg = "#EAF2FF";
    private const string NetText = "#0B4F9C";
    private const string EmployerBg = "#F2F4F7";

    public byte[] GeneratePdf(PlanillaBoletaPdfDto model)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginVertical(14);
                page.MarginHorizontal(16);
                page.DefaultTextStyle(x => x.FontSize(7.5f).FontFamily(Fonts.Arial).FontColor(TextPrimary));
                page.Content().ScaleToFit().Element(c => RenderSlip(c, model));
            });
        });

        return document.GeneratePdf();
    }

    private void RenderSlip(IContainer container, PlanillaBoletaPdfDto model)
    {
        var cabecera = model.Cabecera;
        var firmaInfo = ResolveFirma(model.FirmaEmpresa);

        container.Column(column =>
        {
            column.Spacing(8);

            column.Item().Element(c => RenderHeader(c, model));
            column.Item().Element(c => RenderExecutiveSummary(c, model));
            column.Item().Element(c => RenderEmployeeIdentity(c, model));
            column.Item().Element(c => RenderCompensationBreakdown(c, model));
            column.Item().Element(c => RenderLaborMetrics(c, model));
            column.Item().Element(c => RenderEmployerContributions(c, model));
            column.Item().Element(c => RenderSuspensions(c, model));
            column.Item().AlignRight().Text(BuildFechaTexto(cabecera.Periodo)).FontSize(7f).FontColor(TextMuted);
            column.Item().Element(c => RenderSignatures(c, model, firmaInfo));
        });
    }

    private void RenderHeader(IContainer container, PlanillaBoletaPdfDto model)
    {
        var cabecera = model.Cabecera;

        container
            .Background(Surface)
            .Border(1)
            .BorderColor(Border)
            .Padding(10)
            .Column(column =>
            {
                column.Spacing(8);

                column.Item().Row(row =>
                {
                    row.RelativeItem().Column(left =>
                    {
                        left.Spacing(2);
                        left.Item().Text(cabecera.Empleador).FontSize(14).SemiBold().FontColor(BrandPrimary);
                        left.Item().Text($"RUC {cabecera.Ruc}").FontSize(8).FontColor(TextMuted);
                        left.Item().Text("PDT Planilla Electronica - PLAME").FontSize(7.2f).FontColor(TextMuted);
                    });

                    row.ConstantItem(150).AlignRight().Column(right =>
                    {
                        right.Spacing(3);
                        right.Item().AlignRight().Text("Boleta de Pago").FontSize(15).SemiBold().FontColor(BrandPrimary);
                        right.Item().AlignRight().Text($"Periodo {FormatPeriodoDisplay(cabecera.Periodo)}").FontSize(10).SemiBold().FontColor(BrandAccent);
                        //right.Item().AlignRight().Text($"ID Boleta #{cabecera.IdBoleta}").FontSize(7.2f).FontColor(TextMuted);
                    });
                });
            });
    }

    private void RenderExecutiveSummary(IContainer container, PlanillaBoletaPdfDto model)
    {
        var totalIngresos = model.Ingresos.Sum(x => x.Monto);
        var totalDescuentos = model.Descuentos.Sum(x => x.Monto) + model.AportesTrabajador.Sum(x => x.Monto);
        var neto = model.Cabecera.NetoPagar;

        container.Row(row =>
        {
            row.Spacing(8);
            row.RelativeItem().Element(c => RenderSummaryCard(c, "Ingresos", FormatMoney(totalIngresos), IncomeBg, IncomeText));
            row.RelativeItem().Element(c => RenderSummaryCard(c, "Descuentos", FormatMoney(totalDescuentos), DiscountBg, DiscountText));
            row.RelativeItem(1.2f).Element(c => RenderSummaryCard(c, "Neto a pagar", FormatMoney(neto), NetBg, NetText, true));
        });
    }

    private void RenderSummaryCard(IContainer container, string title, string amount, string background, string accent, bool emphasize = false)
    {
        container
            .Background(background)
            .Border(1)
            .BorderColor(Border)
            .Padding(10)
            .Column(column =>
            {
                column.Spacing(4);
                column.Item().Text(title).FontSize(8).SemiBold().FontColor(accent);
                column.Item().Text($"S/ {amount}")
                    .FontSize(emphasize ? 16 : 12)
                    .SemiBold()
                    .FontColor(accent);
            });
    }

    private void RenderEmployeeIdentity(IContainer container, PlanillaBoletaPdfDto model)
    {
        var cabecera = model.Cabecera;

        RenderSectionCard(
            container,
            "Identificacion del colaborador",
            "Datos personales y de relacion laboral requeridos para la boleta.",
            content =>
            {
                content.Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        row.RelativeItem(2.5f).Element(c => RenderInfoTile(c, "Colaborador", cabecera.NombreTrabajador));
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Documento", $"{cabecera.TipoDocumento} {cabecera.NumeroDocumento}".Trim()));
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Situacion", cabecera.Situacion));
                    });

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Fecha de ingreso", FormatDateOnly(cabecera.FechaIngreso)));
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Tipo de trabajador", cabecera.TipoTrabajador));
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Condicion", cabecera.Condicion));
                    });

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        row.RelativeItem().Element(c => RenderInfoTile(c, "Regimen pensionario", cabecera.RegimenPensionario));
                        row.RelativeItem().Element(c => RenderInfoTile(c, "CUSPP", cabecera.CUSPP));
                    });
                });
            });
    }

    private void RenderInfoTile(IContainer container, string label, string? value)
    {
        container
            .Background(Colors.White)
            .Border(1)
            .BorderColor(Border)
            .PaddingVertical(6)
            .PaddingHorizontal(8)
            .Column(column =>
            {
                column.Spacing(3);
                column.Item().Text(label).FontSize(6.6f).SemiBold().FontColor(TextMuted);
                column.Item().Text(string.IsNullOrWhiteSpace(value) ? "-" : value.Trim()).FontSize(8.2f).FontColor(TextPrimary);
            });
    }

    private void RenderCompensationBreakdown(IContainer container, PlanillaBoletaPdfDto model)
    {
        RenderSectionCard(
            container,
            "Resumen de haberes y retenciones",
            "Visualizacion priorizada para identificar ingresos, descuentos y neto.",
            content =>
            {
                content.Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Row(row =>
                    {
                        row.Spacing(8);
                        row.RelativeItem().Element(c => RenderConceptTable(c, "Ingresos", model.Ingresos, IncomeText, showAsNegative: false, emptyMessage: "Sin ingresos variables registrados."));
                        row.RelativeItem().Element(c => RenderConceptTable(c, "Descuentos y aportes del trabajador", model.Descuentos.Concat(model.AportesTrabajador).ToList(), DiscountText, showAsNegative: true, emptyMessage: "Sin descuentos registrados."));
                    });

                    column.Item().AlignRight().Width(220).Element(c =>
                    {
                        c.Background(NetBg).Border(1).BorderColor(Border).Padding(10).Column(summary =>
                        {
                            var ingresos = model.Ingresos.Sum(x => x.Monto);
                            var descuentos = model.Descuentos.Sum(x => x.Monto) + model.AportesTrabajador.Sum(x => x.Monto);

                            summary.Spacing(4);
                            summary.Item().Text("Cierre del periodo").FontSize(7).SemiBold().FontColor(TextMuted);
                            summary.Item().Row(r =>
                            {
                                r.RelativeItem().Text("Total ingresos").FontSize(7.3f);
                                r.ConstantItem(70).AlignRight().Text($"S/ {FormatMoney(ingresos)}").FontSize(7.3f);
                            });
                            summary.Item().Row(r =>
                            {
                                r.RelativeItem().Text("Total descuentos").FontSize(7.3f);
                                r.ConstantItem(70).AlignRight().Text($"S/ {FormatMoney(descuentos)}").FontSize(7.3f);
                            });
                            summary.Item().PaddingTop(3).BorderTop(1).BorderColor(Border).Row(r =>
                            {
                                r.RelativeItem().Text("Neto a pagar").FontSize(9.5f).SemiBold().FontColor(NetText);
                                r.ConstantItem(90).AlignRight().Text($"S/ {FormatMoney(model.Cabecera.NetoPagar)}").FontSize(12).SemiBold().FontColor(NetText);
                            });
                        });
                    });
                });
            });
    }

    private void RenderConceptTable(
        IContainer container,
        string title,
        IReadOnlyList<PlanillaBoletaDetallePdfDto> rows,
        string accent,
        bool showAsNegative,
        string emptyMessage)
    {
        container
            .Border(1)
            .BorderColor(Border)
            .Padding(8)
            .Column(column =>
            {
                column.Spacing(6);
                column.Item().Text(title).FontSize(8.5f).SemiBold().FontColor(accent);
                column.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(48);
                        columns.RelativeColumn();
                        columns.ConstantColumn(68);
                    });

                    table.Cell().Element(CellHeaderSoft).Text("Codigo");
                    table.Cell().Element(CellHeaderSoft).Text("Concepto");
                    table.Cell().Element(CellHeaderSoft).AlignRight().Text("Monto");

                    if (rows.Count == 0)
                    {
                        table.Cell().ColumnSpan(3).Element(CellBodySoft).Text(emptyMessage).FontColor(TextMuted);
                        return;
                    }

                    foreach (var row in rows)
                    {
                        table.Cell().Element(CellBodySoft).Text(row.CodigoConcepto);
                        table.Cell().Element(CellBodySoft).Text(row.Concepto);
                        table.Cell().Element(CellBodySoft).AlignRight().Text($"{(showAsNegative ? "-" : string.Empty)}S/ {FormatMoney(row.Monto)}");
                    }
                });
            });
    }

    private void RenderLaborMetrics(IContainer container, PlanillaBoletaPdfDto model)
    {
        var cabecera = model.Cabecera;

        RenderSectionCard(
            container,
            "Control de asistencia y jornada",
            "Datos usados para interpretar el calculo del periodo.",
            content =>
            {
                content.Row(row =>
                {
                    row.Spacing(8);
                    row.RelativeItem().Element(c => RenderMetricTile(c, "Dias laborados", FormatDecimal(cabecera.DiasLaborados)));
                    row.RelativeItem().Element(c => RenderMetricTile(c, "Dias no laborados", FormatDecimal(cabecera.DiasNoLaborados)));
                    row.RelativeItem().Element(c => RenderMetricTile(c, "Dias subsidiados", FormatDecimal(cabecera.DiasSubsidiados)));
                    row.RelativeItem().Element(c => RenderMetricTile(c, "Jornada ordinaria", $"{FormatDecimal(cabecera.JornadaHoras)} h"));
                    row.RelativeItem().Element(c => RenderMetricTile(c, "Minutos", $"{FormatDecimal(cabecera.SobretiempoHoras)} h"));
                });
            });
    }

    private void RenderMetricTile(IContainer container, string label, string value)
    {
        container
            .Background(Colors.White)
            .Border(1)
            .BorderColor(Border)
            .PaddingVertical(8)
            .PaddingHorizontal(6)
            .Column(column =>
            {
                column.Spacing(2);
                column.Item().AlignCenter().Text(label).FontSize(6.4f).SemiBold().FontColor(TextMuted);
                column.Item().AlignCenter().Text(value).FontSize(10).SemiBold().FontColor(BrandPrimary);
            });
    }

    private void RenderEmployerContributions(IContainer container, PlanillaBoletaPdfDto model)
    {
        RenderSectionCard(
            container,
            "Aportes del empleador",
            "Bloque informativo complementario para control laboral y previsional.",
            content =>
            {
                content.Background(EmployerBg).Border(1).BorderColor(Border).Padding(8).Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(56);
                        columns.RelativeColumn();
                        columns.ConstantColumn(72);
                    });

                    table.Cell().Element(CellHeaderSoft).Text("Codigo");
                    table.Cell().Element(CellHeaderSoft).Text("Concepto");
                    table.Cell().Element(CellHeaderSoft).AlignRight().Text("Monto");

                    if (model.AportesEmpleador.Count == 0)
                    {
                        table.Cell().ColumnSpan(3).Element(CellBodySoft).Text("Sin aportes del empleador registrados en el periodo.").FontColor(TextMuted);
                        return;
                    }

                    foreach (var item in model.AportesEmpleador)
                    {
                        table.Cell().Element(CellBodySoft).Text(item.CodigoConcepto);
                        table.Cell().Element(CellBodySoft).Text(item.Concepto);
                        table.Cell().Element(CellBodySoft).AlignRight().Text($"S/ {FormatMoney(item.Monto)}");
                    }
                });
            });
    }

    private void RenderSuspensions(IContainer container, PlanillaBoletaPdfDto model)
    {
        RenderSectionCard(
            container,
            "Suspensiones de labores",
            "Seccion obligatoria para registrar incidencias laborales del periodo.",
            content =>
            {
                content.Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.ConstantColumn(52);
                        columns.RelativeColumn();
                        columns.ConstantColumn(48);
                    });

                    table.Cell().Element(CellHeaderSoft).Text("Tipo");
                    table.Cell().Element(CellHeaderSoft).Text("Motivo");
                    table.Cell().Element(CellHeaderSoft).AlignCenter().Text("Dias");

                    if (model.Suspensiones.Count == 0)
                    {
                        table.Cell().ColumnSpan(3).Element(CellBodySoft).Text("Sin suspensiones registradas para este periodo.").FontColor(TextMuted);
                        return;
                    }

                    foreach (var item in model.Suspensiones)
                    {
                        table.Cell().Element(CellBodySoft).Text(item.Tipo);
                        table.Cell().Element(CellBodySoft).Text(item.Motivo);
                        table.Cell().Element(CellBodySoft).AlignCenter().Text(FormatDecimal(item.Dias));
                    }
                });
            });
    }

    private void RenderSignatures(IContainer container, PlanillaBoletaPdfDto model, SignatureInfo signatureInfo)
    {
        container.Row(row =>
        {
            row.Spacing(20);
            row.RelativeItem().Element(c => RenderEmployerSignature(c, model, signatureInfo));
            row.RelativeItem().Element(c => RenderEmployeeSignature(c, model));
        });
    }

    private void RenderEmployerSignature(IContainer container, PlanillaBoletaPdfDto model, SignatureInfo signatureInfo)
    {
        container
            .BorderTop(1)
            .BorderColor(Border)
            .PaddingTop(8)
            .Column(column =>
            {
                column.Spacing(3);
                column.Item().Height(72).AlignCenter().Element(c =>
                {
                    if (signatureInfo.ImageBytes is not null)
                    {
                        c.Image(signatureInfo.ImageBytes).FitArea();
                    }
                    else
                    {
                        c.AlignCenter().AlignMiddle().Text(signatureInfo.Message).FontSize(7).SemiBold().FontColor(TextMuted);
                    }
                });
                column.Item().AlignCenter().Text(model.FirmaEmpresa?.NombreCorto ?? model.Cabecera.Empleador).FontSize(7.2f).SemiBold();
                column.Item().AlignCenter().Text($"RUC {model.Cabecera.Ruc}").FontSize(6.8f).FontColor(TextMuted);
                column.Item().AlignCenter().Text("Empleador").FontSize(6.8f).FontColor(TextMuted);
            });
    }

    private void RenderEmployeeSignature(IContainer container, PlanillaBoletaPdfDto model)
    {
        container
            .BorderTop(1)
            .BorderColor(Border)
            .PaddingTop(8)
            .Column(column =>
            {
                column.Spacing(3);
                column.Item().Height(72);
                column.Item().AlignCenter().Text(model.Cabecera.NombreTrabajador).FontSize(7.2f).SemiBold();
                column.Item().AlignCenter().Text($"{model.Cabecera.TipoDocumento}: {model.Cabecera.NumeroDocumento}".Trim(':', ' ')).FontSize(6.8f).FontColor(TextMuted);
                column.Item().AlignCenter().Text("Colaborador").FontSize(6.8f).FontColor(TextMuted);
            });
    }

    private void RenderSectionCard(IContainer container, string title, string subtitle, Action<IContainer> contentBuilder)
    {
        container
            .Border(1)
            .BorderColor(Border)
            .Padding(10)
            .Column(column =>
            {
                column.Spacing(6);
                column.Item().Column(header =>
                {
                    header.Spacing(2);
                    header.Item().Text(title).FontSize(9.5f).SemiBold().FontColor(BrandPrimary);
                    header.Item().Text(subtitle).FontSize(6.8f).FontColor(TextMuted);
                });
                column.Item().Element(contentBuilder);
            });
    }

    private SignatureInfo ResolveFirma(PlanillaEmpresaFirmaDto? firma)
    {
        if (firma is null)
        {
            return new SignatureInfo(null, "FIRMA NO CONFIGURADA");
        }

        if (!string.IsNullOrWhiteSpace(firma.FirmaBase64))
        {
            try
            {
                var normalized = firma.FirmaBase64.Trim();
                var commaIndex = normalized.IndexOf(',');
                if (commaIndex >= 0)
                {
                    normalized = normalized[(commaIndex + 1)..];
                }

                return new SignatureInfo(Convert.FromBase64String(normalized), string.Empty);
            }
            catch
            {
                return new SignatureInfo(null, "FIRMA NO DISPONIBLE");
            }
        }

        if (!string.IsNullOrWhiteSpace(firma.RutaFirma) && File.Exists(firma.RutaFirma))
        {
            try
            {
                return new SignatureInfo(File.ReadAllBytes(firma.RutaFirma), string.Empty);
            }
            catch
            {
                return new SignatureInfo(null, "FIRMA NO DISPONIBLE");
            }
        }

        return new SignatureInfo(null, "FIRMA NO CONFIGURADA");
    }

    private static string BuildFechaTexto(string? periodo)
    {
        var period = (periodo ?? string.Empty).Trim();
        if (period.Length >= 6)
        {
            var normalized = period.Replace("-", string.Empty).Replace("/", string.Empty);
            if (normalized.Length >= 6 &&
                int.TryParse(normalized[..4], out var year) &&
                int.TryParse(normalized.Substring(4, 2), out var month) &&
                month >= 1 && month <= 12)
            {
                var day = DateTime.DaysInMonth(year, month);
                var date = new DateTime(year, month, day);
                var culture = new CultureInfo("es-PE");
                return $"Lima, {date:dd} de {culture.DateTimeFormat.GetMonthName(month)} de {year}";
            }
        }

        return $"Lima, {DateTime.Now:dd} de {DateTime.Now.ToString("MMMM", new CultureInfo("es-PE"))} de {DateTime.Now:yyyy}";
    }

    private static string FormatPeriodoDisplay(string? periodo)
    {
        var normalized = (periodo ?? string.Empty).Trim().Replace("-", string.Empty).Replace("/", string.Empty);
        if (normalized.Length >= 6 &&
            int.TryParse(normalized[..4], out var year) &&
            int.TryParse(normalized.Substring(4, 2), out var month) &&
            month >= 1 && month <= 12)
        {
            return $"{month:00}/{year}";
        }

        return periodo ?? string.Empty;
    }

    private static string FormatDateOnly(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var supportedFormats = new[]
        {
            "dd/MM/yyyy",
            "d/M/yyyy",
            "yyyy-MM-dd",
            "yyyy/MM/dd",
            "MM/dd/yyyy",
            "M/d/yyyy",
            "dd/MM/yyyy HH:mm:ss",
            "d/M/yyyy H:mm:ss",
            "MM/dd/yyyy HH:mm:ss",
            "M/d/yyyy H:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss.fff"
        };

        if (DateTime.TryParseExact(
                normalized,
                supportedFormats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var exactDate))
        {
            return exactDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        if (DateTime.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsedInvariant))
        {
            return parsedInvariant.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        if (DateTime.TryParse(normalized, new CultureInfo("es-PE"), DateTimeStyles.AllowWhiteSpaces, out var parsedLocal))
        {
            return parsedLocal.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        return normalized;
    }

    private static string FormatMoney(decimal value) => value.ToString("N2", CultureInfo.InvariantCulture);

    private static string FormatDecimal(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static IContainer CellHeaderSoft(IContainer container) =>
        container.Background("#F0F4F8").BorderBottom(1).BorderColor(Border).PaddingVertical(4).PaddingHorizontal(6);

    private static IContainer CellBodySoft(IContainer container) =>
        container.BorderBottom(1).BorderColor(Border).PaddingVertical(4).PaddingHorizontal(6);

    private sealed record SignatureInfo(byte[]? ImageBytes, string Message);
}
