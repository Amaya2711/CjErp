using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

internal sealed class OrdenCompraPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");

    private readonly OrdenCompraCabeceraDto _cabecera;
    private readonly IReadOnlyList<OrdenCompraDetalleDto> _detalle;
    private readonly OrdenCompraPdfMetadataDto _metadata;
    private readonly string? _logoPath;
    private readonly IReadOnlyList<string> _footerImagePaths;

    public OrdenCompraPdfDocument(
        OrdenCompraCabeceraDto cabecera,
        IReadOnlyList<OrdenCompraDetalleDto> detalle,
        OrdenCompraPdfMetadataDto metadata,
        string? logoPath,
        IReadOnlyList<string>? footerImagePaths = null)
    {
        _cabecera = cabecera;
        _detalle = detalle;
        _metadata = metadata;
        _logoPath = logoPath;
        _footerImagePaths = footerImagePaths ?? Array.Empty<string>();
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.MarginHorizontal(28, Unit.Millimetre);
            page.MarginVertical(20, Unit.Millimetre);
            page.DefaultTextStyle(style => style.FontFamily("Arial").FontSize(8).FontColor(Colors.Black));

            page.Header().Element(ComposeHeader);
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }

    private void ComposeHeader(IContainer container)
    {
        container.PaddingBottom(16).Row(row =>
        {
            row.RelativeItem().AlignLeft().Element(ComposeLogo);
            row.ConstantItem(165).AlignRight().Column(column =>
            {
                column.Spacing(1);
                column.Item().AlignRight().Text("CJ Telecom SAC").FontSize(8).FontColor(Colors.Grey.Darken2);
                column.Item().AlignRight().Text("Calle Santa Justina 620, Lima, Perú").FontSize(7).FontColor(Colors.Grey.Darken1);
                column.Item().AlignRight().Text("T +511 6526868").FontSize(7).FontColor(Colors.Grey.Darken1);
                column.Item().AlignRight().Text("www.cj-telecom.com").FontSize(7).FontColor(Colors.Grey.Darken1);
            });
        });
    }

    private void ComposeLogo(IContainer container)
    {
        if (!string.IsNullOrWhiteSpace(_logoPath) && File.Exists(_logoPath))
        {
            container.Width(112).Height(36).Svg(File.ReadAllText(_logoPath)).FitArea();
            return;
        }

        container.Width(112).Height(36).AlignMiddle().Text("CJ telecom").FontSize(16).SemiBold();
    }

    private void ComposeContent(IContainer container)
    {
        container.Column(column =>
        {
            column.Spacing(10);
            column.Item().Element(ComposeTitle);
            column.Item().Element(ComposeSupplier);
            column.Item().Element(ComposeGeneralInformation);
            column.Item().Element(ComposeItems);
            column.Item().Element(ComposeApprovalAndTotals);
            column.Item().Element(ComposeTaxAndPayment);
        });
    }

    private void ComposeTitle(IContainer container)
    {
        var year = (_metadata.FechaOrden ?? _cabecera.Fecha ?? DateTime.Today).Year;
        container.AlignCenter()
            .PaddingBottom(2)
            .Text($"ORDEN DE COMPRA CJT / {_cabecera.IdOc} - {year}")
            .FontSize(11)
            .SemiBold();
    }

    private void ComposeSupplier(IContainer container)
    {
        container.PaddingTop(6).Column(column =>
        {
            column.Spacing(2);
            column.Item().Text(text =>
            {
                text.Span("SEÑOR(ES): ").SemiBold();
                text.Span(Clean(_cabecera.Responsable));
            });
            column.Item().Text(text =>
            {
                text.Span("RUC: ").SemiBold();
                text.Span(Clean(_cabecera.NroDocumento));
            });
        });
    }

    private void ComposeGeneralInformation(IContainer container)
    {
        container
            .Border(0.6f)
            .BorderColor(Colors.Black)
            .MinHeight(42)
            .Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(0.9f);
                    columns.RelativeColumn(0.9f);
                    columns.RelativeColumn(0.9f);
                    columns.RelativeColumn(2.3f);
                });

                GeneralHeaderCell(table, "FECHA");
                GeneralHeaderCell(table, "TIPO");
                GeneralHeaderCell(table, "MONEDA");
                GeneralHeaderCell(table, "CENTRO DE COSTEO / PROYECTO");

                GeneralValueCell(table, FormatDate(_metadata.FechaOrden ?? _cabecera.Fecha));
                GeneralValueCell(table, Clean(_cabecera.Comprobante));
                GeneralValueCell(table, Clean(_cabecera.Moneda));
                GeneralValueCell(table, Clean(_cabecera.NombreProyecto, FirstDetail()?.NombreProyecto));
            });
    }

    private static void GeneralHeaderCell(TableDescriptor table, string value)
    {
        table.Cell().PaddingTop(7).PaddingBottom(3).AlignCenter().Text(value).FontSize(7.5f).SemiBold();
    }

    private static void GeneralValueCell(TableDescriptor table, string value)
    {
        table.Cell().PaddingBottom(8).AlignCenter().Text(value).FontSize(8);
    }

    private void ComposeItems(IContainer container)
    {
        container.PaddingTop(6).Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(28);
                columns.RelativeColumn(4.2f);
                columns.ConstantColumn(54);
                columns.ConstantColumn(68);
                columns.ConstantColumn(74);
            });

            table.Header(header =>
            {
                DetailHeaderCell(header, "Item", true);
                DetailHeaderCell(header, "Descripción de producto", false);
                DetailHeaderCell(header, "Cantidad", true);
                DetailHeaderCell(header, "PU", true);
                DetailHeaderCell(header, "Sub Total", true);
            });

            if (_detalle.Count == 0)
            {
                table.Cell().ColumnSpan(5).PaddingVertical(12).Text("Sin posiciones para mostrar.").FontSize(8);
                return;
            }

            var index = 1;
            foreach (var item in _detalle)
            {
                DetailTextCell(table, index.ToString(EsPe), alignCenter: true);
                table.Cell().Element(DetailCellStyle).Column(column =>
                {
                    column.Spacing(2);
                    column.Item().Text(Clean(item.Tarea, item.TipoTrabajo, item.Detalle)).FontSize(8);

                    var siteInfo = string.Join("    ", new[] { Clean(item.IdSite), Clean(item.NombreSite) }
                        .Where(value => !string.IsNullOrWhiteSpace(value)));
                    if (!string.IsNullOrWhiteSpace(siteInfo))
                    {
                        column.Item().Text(siteInfo).FontSize(7).FontColor(Colors.Grey.Darken2);
                    }

                    if (!string.IsNullOrWhiteSpace(item.Detalle))
                    {
                        column.Item().Text(item.Detalle.Trim()).FontSize(7.5f);
                    }
                });
                DetailTextCell(table, FormatQuantity(item.Cantidad), alignCenter: true);
                DetailTextCell(table, FormatMoney(item.PrecioUnitario), alignRight: true);
                DetailTextCell(table, FormatMoney(item.SubtotalD), alignRight: true);
                index++;
            }
        });
    }

    private static void DetailHeaderCell(TableCellDescriptor header, string value, bool center)
    {
        var cell = header.Cell().Element(DetailHeaderStyle);
        if (center)
        {
            cell.AlignCenter().Text(value).FontSize(7.5f).SemiBold();
        }
        else
        {
            cell.Text(value).FontSize(7.5f).SemiBold();
        }
    }

    private static IContainer DetailHeaderStyle(IContainer container)
    {
        return container
            .BorderBottom(0.6f)
            .BorderColor(Colors.Black)
            .PaddingVertical(4)
            .PaddingHorizontal(3);
    }

    private static void DetailTextCell(TableDescriptor table, string value, bool alignCenter = false, bool alignRight = false)
    {
        var cell = table.Cell().Element(DetailCellStyle);
        if (alignCenter)
        {
            cell.AlignCenter().Text(value).FontSize(8);
        }
        else if (alignRight)
        {
            cell.AlignRight().Text(value).FontSize(8);
        }
        else
        {
            cell.Text(value).FontSize(8);
        }
    }

    private static IContainer DetailCellStyle(IContainer container)
    {
        return container
            .BorderBottom(0.25f)
            .BorderColor(Colors.Grey.Lighten2)
            .PaddingVertical(5)
            .PaddingHorizontal(3);
    }

    private void ComposeApprovalAndTotals(IContainer container)
    {
        container.PaddingTop(6).Row(row =>
        {
            row.RelativeItem(1.35f).Column(column =>
            {
                column.Spacing(4);
                column.Item().Text(text =>
                {
                    text.Span("Documento solicitado por: ").SemiBold();
                    text.Span(Clean(_cabecera.Solicitante));
                });
                column.Item().Text(text =>
                {
                    text.Span("Primer validador: ").SemiBold();
                    text.Span(Clean(_cabecera.Validador));
                });
                column.Item().Text(text =>
                {
                    text.Span("Segundo validador: ").SemiBold();
                    text.Span(Clean(_cabecera.Validador2));
                });
                column.Item().Text(text =>
                {
                    text.Span("Tercer validador: ").SemiBold();
                    text.Span(Clean(_cabecera.Validador3));
                });
            });

            row.ConstantItem(190).AlignRight().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn();
                    columns.RelativeColumn();
                });

                TotalRow(table, "SUB TOTAL", FormatMoney(ResolveSubtotal()));
                TotalRow(table, "IGV (18%)", FormatMoney(ResolveIgv()));
                TotalRow(table, "TOTAL", FormatMoney(ResolveTotal()), emphasize: true);
                TotalRow(table, "MONEDA", Clean(_cabecera.Moneda));
            });
        });
    }

    private static void TotalRow(TableDescriptor table, string label, string value, bool emphasize = false)
    {
        table.Cell().PaddingVertical(1).Text(label).FontSize(emphasize ? 9 : 8).SemiBold();
        var text = table.Cell().PaddingVertical(1).AlignRight().Text(value).FontSize(emphasize ? 9 : 8);
        if (emphasize)
        {
            text.SemiBold();
        }
    }

    private void ComposeTaxAndPayment(IContainer container)
    {
        container.PaddingTop(10).Row(row =>
        {
            row.RelativeItem().Border(0.5f).BorderColor(Colors.Black).MinHeight(38).AlignMiddle().AlignCenter().Padding(6).Text(
                "Empresa incorporada al Régimen de Agentes de Retención\nde IGV (R.S. 186-2023) a partir del 01.01.2023")
                .FontSize(7.5f)
                .AlignCenter();

            row.ConstantItem(18);

            row.RelativeItem().MinHeight(38).Column(column =>
            {
                column.Spacing(5);
                column.Item().Text(text =>
                {
                    text.Span("FACTURAR A NOMBRE DE: ").SemiBold();
                    text.Span("CJ TELECOM SAC");
                });
                column.Item().Text(text =>
                {
                    text.Span("FORMA DE PAGO: ").SemiBold();
                    text.Span(Clean(_metadata.FormaPago));
                    if (_metadata.DiasPago is not null)
                    {
                        text.Span($"     {_metadata.DiasPago.Value}");
                    }
                });
            });
        });
    }

    private void ComposeFooter(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().AlignLeft().AlignBottom().Text(text =>
            {
            text.DefaultTextStyle(style => style.FontSize(6.5f).FontColor(Colors.Grey.Darken1));
            text.Span("Página ");
            text.CurrentPageNumber();
            text.Span(" de ");
            text.TotalPages();
            });

            foreach (var footerImagePath in _footerImagePaths.Where(File.Exists))
            {
                row.ConstantItem(90).Height(50).AlignRight().Image(footerImagePath).FitArea();
            }
        });
    }

    private OrdenCompraDetalleDto? FirstDetail() => _detalle.FirstOrDefault();

    private decimal ResolveSubtotal()
    {
        return _cabecera.Subtotal != 0 ? _cabecera.Subtotal : _detalle.Sum(item => item.SubtotalD);
    }

    private decimal ResolveIgv()
    {
        return _cabecera.Igv != 0 ? _cabecera.Igv : _detalle.Sum(item => item.IgvD);
    }

    private decimal ResolveTotal()
    {
        return _cabecera.Total != 0 ? _cabecera.Total : _detalle.Sum(item => item.TotalD);
    }

    private static string Clean(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;
    }

    private static string FormatDate(DateTime? value)
    {
        return value?.ToString("dd/MM/yyyy", EsPe) ?? string.Empty;
    }

    private static string FormatQuantity(decimal value)
    {
        return value == decimal.Truncate(value)
            ? value.ToString("N0", EsPe)
            : value.ToString("N2", EsPe);
    }

    private static string FormatMoney(decimal value)
    {
        return value == 0 ? ".00" : value.ToString("N2", EsPe);
    }
}
