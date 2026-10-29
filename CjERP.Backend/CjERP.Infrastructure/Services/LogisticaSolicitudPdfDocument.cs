using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Solicitud de equipos (pedido de despacho). Reemplaza el reporte XReportSc de DXAsignacion; la distribucion es nueva
/// (PV: validar con Logistica si requieren el formato exacto del reporte antiguo).
/// </summary>
internal sealed class LogisticaSolicitudPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");

    private readonly LogisticaSolicitudCorreoCabDto _cab;
    private readonly IReadOnlyList<LogisticaSolicitudDetalleDto> _detalle;

    public LogisticaSolicitudPdfDocument(LogisticaSolicitudCorreoCabDto cab, IReadOnlyList<LogisticaSolicitudDetalleDto> detalle)
    {
        _cab = cab;
        _detalle = detalle;
    }

    public DocumentMetadata GetMetadata() => new() { Title = $"Solicitud {_cab.NroSolicitud}" };

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(30);
            page.DefaultTextStyle(t => t.FontSize(9));

            page.Header().Column(col =>
            {
                col.Item().Text($"SOLICITUD DE EQUIPOS N° {_cab.NroSolicitud}").Bold().FontSize(14);
                col.Item().Text($"Fecha: {_cab.FechaCreacion?.ToString("dd/MM/yyyy", EsPe) ?? "-"}   Registrado por: {_cab.Usuario ?? "-"}").FontColor(Colors.Grey.Darken2);
                col.Item().PaddingBottom(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
            });

            page.Content().Column(col =>
            {
                col.Spacing(2);
                Fila(col, "Cliente", _cab.NombreCliente);
                Fila(col, "Proyecto", _cab.NombreProyecto);
                Fila(col, "Site", $"{_cab.IdSite} - {_cab.NombreSite}");
                Fila(col, "Tipo de trabajo", _cab.TipoTrabajo);
                Fila(col, "Solicitante", _cab.Solicitante);
                Fila(col, "Medio de envío", _cab.FormaEnvio);
                Fila(col, "Razón social", _cab.RazonSocial);
                Fila(col, "Ubigeo", _cab.Ubigeo);
                Fila(col, "Dirección", _cab.Direccion);
                Fila(col, "Referencia", _cab.Referencia);
                Fila(col, "Contactos de entrega", string.Join(" / ", new[] { _cab.Entrega1, _cab.Entrega2 }.Where(x => !string.IsNullOrWhiteSpace(x))));
                Fila(col, "Observación", _cab.Observacion);

                col.Item().PaddingTop(10).Table(tabla =>
                {
                    tabla.ColumnsDefinition(c =>
                    {
                        c.ConstantColumn(24);
                        c.ConstantColumn(70);
                        c.RelativeColumn(3);
                        c.ConstantColumn(40);
                        c.RelativeColumn(1.4f);
                        c.RelativeColumn(1.6f);
                    });

                    tabla.Header(h =>
                    {
                        foreach (var titulo in new[] { "#", "Código", "Material", "Cant.", "Serie", "Origen" })
                            h.Cell().Background(Colors.Grey.Lighten3).Padding(3).Text(titulo).Bold();
                    });

                    var n = 0;
                    foreach (var d in _detalle)
                    {
                        n++;
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3).Text(n.ToString());
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3).Text(d.CodPap ?? "");
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3).Text(d.NombreMaterial ?? "");
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3).AlignRight().Text(d.CantSap.ToString("0.##", EsPe));
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3).Text(d.Serie ?? "");
                        tabla.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(3)
                            .Text(string.IsNullOrWhiteSpace(d.NombreSiteOrigen) ? (d.IdSiteOrigen ?? "") : d.NombreSiteOrigen);
                    }
                });
            });

            page.Footer().AlignRight().Text(t =>
            {
                t.Span("Página ");
                t.CurrentPageNumber();
                t.Span(" de ");
                t.TotalPages();
            });
        });
    }

    private static void Fila(ColumnDescriptor col, string etiqueta, string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return;
        col.Item().Row(r =>
        {
            r.ConstantItem(110).Text(etiqueta + ":").Bold();
            r.RelativeItem().Text(valor);
        });
    }
}
