using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Carta de solicitud de adelanto de sueldo / préstamo. Basada en los reportes RptAdelanto y RptPrestamo de DXAsignacion.
/// Tipo 1 = préstamo (con cronograma de cuotas), tipo 2 = adelanto de sueldo.
/// </summary>
internal sealed class BeneficioPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private static readonly string Gris = Colors.Grey.Darken2;

    private readonly BeneficioListItemDto _beneficio;
    private readonly IReadOnlyList<BeneficioCuotaDto> _cuotas;
    private readonly DateTime _fechaEmision;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    public BeneficioPdfDocument(BeneficioListItemDto beneficio, IReadOnlyList<BeneficioCuotaDto> cuotas, DateTime fechaEmision)
    {
        _beneficio = beneficio;
        _cuotas = cuotas;
        _fechaEmision = fechaEmision;
        _membrete = VacacionesPdfDocument.LeerImagen("membrete.png");
        _pie1 = VacacionesPdfDocument.LeerImagen("pie_1.png");
        _pie2 = VacacionesPdfDocument.LeerImagen("pie_2.png");
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.MarginTop(12, Unit.Millimetre);
            page.MarginBottom(14, Unit.Millimetre);
            page.MarginHorizontal(22, Unit.Millimetre);
            page.DefaultTextStyle(style => style.FontFamily("Arial").FontSize(10).FontColor(Colors.Black));

            page.Header().PaddingBottom(6).Element(c =>
            {
                if (_membrete is not null)
                {
                    c.Image(_membrete).FitWidth();
                }
                else
                {
                    c.Text("CJ Telecom SAC").FontSize(14).Bold();
                }
            });
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }

    private void ComposeContent(IContainer container)
    {
        var esAdelanto = _beneficio.IdTipoBeneficio == 2;
        var titulo = esAdelanto ? "SOLICITUD DE ADELANTO DE SUELDO" : "SOLICITUD DE PRÉSTAMO";
        var monto = Monto(_beneficio.Monto);
        var empleado = Valor(_beneficio.NombreEmpleado);

        container.PaddingTop(10).Column(column =>
        {
            column.Spacing(9);

            column.Item().AlignCenter().Text(titulo).FontSize(13).Bold();
            column.Item().Text($"Lima, {_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe)}");

            column.Item().PaddingTop(4).Column(destino =>
            {
                destino.Spacing(2);
                destino.Item().Text("SEÑORES:").Bold();
                destino.Item().Text(Valor(_beneficio.NombreCliente)).Bold();
                destino.Item().Text("Presente. -");
            });

            column.Item().Text("De mi mayor consideración:");

            if (esAdelanto && _cuotas.Count <= 1)
            {
                var mesPago = _cuotas.Count > 0 ? Valor(_cuotas[0].MesPago) : _beneficio.MesInicio?.ToString("MM/yyyy", EsPe) ?? "—";
                column.Item().Text(text =>
                {
                    text.Justify();
                    text.Span("Me es grato dirigirme a ustedes a fin de solicitarles autorizar el adelanto a cuenta de mi remuneración mensual por el monto de ");
                    text.Span(monto).Bold();
                    text.Span(" a ser descontados en la remuneración del mes ");
                    text.Span(mesPago).Bold();
                    text.Span(".");
                });
            }
            else
            {
                column.Item().Text(text =>
                {
                    text.Justify();
                    text.Span(esAdelanto
                        ? "Me es grato dirigirme a ustedes a fin de solicitarles autorizar el adelanto a cuenta de mi remuneración mensual por el monto de "
                        : "Me es grato dirigirme a ustedes a fin de solicitarles autorizar un préstamo a cuenta de mi sueldo por el monto de ");
                    text.Span(monto).Bold();
                    text.Span(" a ser descontados en la remuneración mensual de la siguiente manera:");
                });

                column.Item().PaddingHorizontal(40).Element(ComposeCuotas);
            }

            column.Item().Text("Agradeciendo de antemano su atención, quedo a la espera de su aceptación.").Justify();

            column.Item().PaddingTop(8).Column(firma =>
            {
                firma.Spacing(2);
                firma.Item().Text("Atentamente,");
                firma.Item().PaddingTop(22).Text(empleado).Bold();
            });

            // El aprobador solo se imprime cuando la solicitud ya fue aprobada; antes se informa su estado.
            var rechazada = _beneficio.IdAprobado == 2 || _beneficio.IdEstado == 0;
            var aprobada = !rechazada && _beneficio.IdAprobado == 1 && !string.IsNullOrWhiteSpace(_beneficio.Aprobador);

            column.Item().PaddingTop(10).Column(aprobacion =>
            {
                aprobacion.Spacing(2);
                if (aprobada)
                {
                    aprobacion.Item().Text("Aprobador: ( x Sistema)").Bold().FontColor(Gris);
                    aprobacion.Item().Text(Valor(_beneficio.Aprobador)).Bold();
                }
                else
                {
                    aprobacion.Item().Text(rechazada ? "Solicitud rechazada" : "Pendiente de aprobación").Bold().FontColor(Gris);
                }
            });
        });
    }

    private void ComposeCuotas(IContainer container)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn();
                columns.RelativeColumn();
            });

            table.Header(header =>
            {
                header.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Mes").Bold();
                header.Cell().Background(Colors.Grey.Lighten3).Padding(4).AlignRight().Text("Cuota").Bold();
            });

            foreach (var cuota in _cuotas)
            {
                table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten1).Padding(4).Text(Valor(cuota.MesPago));
                table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten1).Padding(4).AlignRight().Text(Monto(cuota.Monto));
            }
        });
    }

    private void ComposeFooter(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().AlignBottom().Text("Documento generado automáticamente por el sistema ERP de CJ Telecom.")
                .FontSize(7).FontColor(Gris);

            if (_pie2 is not null)
            {
                row.ConstantItem(42).AlignBottom().Image(_pie2).FitWidth();
            }

            if (_pie1 is not null)
            {
                row.ConstantItem(32).PaddingLeft(6).AlignBottom().Image(_pie1).FitWidth();
            }
        });
    }

    private static string Monto(decimal valor) => "S/. " + valor.ToString("#,##0.00", CultureInfo.InvariantCulture);

    private static string Valor(string? valor) => string.IsNullOrWhiteSpace(valor) ? "—" : valor.Trim();
}
