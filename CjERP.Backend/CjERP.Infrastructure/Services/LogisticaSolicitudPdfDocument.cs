using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Solicitud de equipos (pedido de despacho). Distribucion tomada del formato de referencia de Logistica (reporte XReportSc):
/// membrete CJ, Nro. de solicitud, Datos de Origen / Destino, Contacto de entrega, Direccion y Material a trasladar.
/// </summary>
internal sealed class LogisticaSolicitudPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private static readonly string GrisOscuro = "#808080";
    private static readonly string GrisMedio = "#BFBFBF";
    private static readonly string GrisClaro = "#E0E0E0";

    private readonly LogisticaSolicitudCorreoCabDto _cab;
    private readonly IReadOnlyList<LogisticaSolicitudDetalleDto> _detalle;
    private readonly string? _marcaAgua;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    /// <param name="marcaAgua">Texto diagonal sobre cada página (vista previa: "SIN VALIDEZ"); null = documento oficial.</param>
    public LogisticaSolicitudPdfDocument(
        LogisticaSolicitudCorreoCabDto cab,
        IReadOnlyList<LogisticaSolicitudDetalleDto> detalle,
        string? marcaAgua = null)
    {
        _cab = cab;
        _detalle = detalle;
        _marcaAgua = marcaAgua;
        _membrete = VacacionesPdfDocument.LeerImagen("membrete.png");
        _pie1 = VacacionesPdfDocument.LeerImagen("pie_1.png");
        _pie2 = VacacionesPdfDocument.LeerImagen("pie_2.png");
    }

    public DocumentMetadata GetMetadata() => new() { Title = $"Solicitud {_cab.NroSolicitud}" };

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.MarginTop(8, Unit.Millimetre);
            page.MarginBottom(8, Unit.Millimetre);
            page.MarginHorizontal(20, Unit.Millimetre);
            page.DefaultTextStyle(t => t.FontFamily("Arial").FontSize(8.5f).FontColor(Colors.Black));

            if (!string.IsNullOrWhiteSpace(_marcaAgua))
            {
                // Por encima del contenido y translúcida: se lee el documento pero no puede pasar por oficial.
                page.Foreground().AlignCenter().AlignMiddle().Rotate(-40)
                    .Text(_marcaAgua).FontSize(90).Bold().FontColor(Color.FromARGB(70, 220, 38, 38));
            }

            page.Header().Column(col =>
            {
                if (_membrete is not null) col.Item().Image(_membrete).FitWidth();
                else col.Item().Text("CJ Telecom SAC").FontSize(14).Bold();

                col.Item().PaddingBottom(4).AlignRight().Text(t =>
                {
                    t.Span("Nro. Solicitud:   ").FontSize(9);
                    t.Span(_cab.NroSolicitud).FontSize(15).Bold();
                });
            });

            page.Content().Column(col =>
            {
                col.Spacing(0);

                col.Item().Element(c => Banda(c, "Datos de Origen", GrisOscuro, 10, Colors.Black));
                col.Item().PaddingLeft(10).PaddingTop(2).Column(o =>
                {
                    o.Spacing(2);
                    o.Item().Row(r =>
                    {
                        r.ConstantItem(55).Text("Cliente:");
                        r.RelativeItem().Text(_cab.NombreCliente ?? "");
                        r.ConstantItem(32).Text("Fecha:");
                        r.ConstantItem(110).Text(_cab.FechaCreacion?.ToString("d/M/yyyy HH:mm:ss", EsPe) ?? "");
                    });
                    o.Item().Row(r =>
                    {
                        r.ConstantItem(55).Text("Proyecto:");
                        r.RelativeItem().Text(_cab.NombreProyecto ?? "");
                    });
                    o.Item().Row(r =>
                    {
                        r.ConstantItem(55).Text("Site:");
                        r.ConstantItem(55).Text(_cab.IdSite ?? "");
                        r.RelativeItem().Text(_cab.NombreSite ?? "");
                    });
                });
                col.Item().PaddingTop(6).PaddingRight(6).AlignRight().Text(t =>
                {
                    t.Span("Solicitante:        ");
                    t.Span(_cab.Solicitante ?? "");
                });

                col.Item().PaddingTop(2).Element(c => Banda(c, "Datos de Destino", GrisClaro, 10, Colors.Black));

                col.Item().PaddingTop(10).Element(c => Banda(c, "Contacto de entrega", GrisOscuro, 10, Colors.Black));
                col.Item().PaddingTop(2).Column(ct =>
                {
                    ct.Spacing(6);
                    Contacto(ct, "Nombre:", _cab.Entrega1, _cab.Entrega1Documento, _cab.Entrega1Telefono);
                    if (!string.IsNullOrWhiteSpace(_cab.Entrega2))
                        Contacto(ct, "", _cab.Entrega2, _cab.Entrega2Documento, _cab.Entrega2Telefono);
                });

                col.Item().PaddingTop(4).Element(c => Banda(c, "Direccion:", GrisMedio, 10, Colors.Black));
                col.Item().PaddingLeft(2).PaddingTop(1).Column(d =>
                {
                    var ubicacion = new[] { _cab.Ubigeo, _cab.Direccion }.Where(x => !string.IsNullOrWhiteSpace(x));
                    d.Item().Text(string.Join(" - ", ubicacion));
                    if (!string.IsNullOrWhiteSpace(_cab.Referencia)) d.Item().PaddingTop(8).Text(_cab.Referencia);
                    if (!string.IsNullOrWhiteSpace(_cab.Observacion)) d.Item().PaddingTop(4).Text(_cab.Observacion);
                });

                col.Item().PaddingTop(10).Element(c => Banda(c, "Material a trasladar", GrisOscuro, 10, Colors.Black));
                col.Item().Table(tabla =>
                {
                    tabla.ColumnsDefinition(c =>
                    {
                        c.ConstantColumn(62);
                        c.ConstantColumn(62);
                        c.ConstantColumn(36);
                        c.ConstantColumn(28);
                        c.RelativeColumn(3);
                        c.RelativeColumn(1.3f);
                        c.RelativeColumn(1.1f);
                    });

                    tabla.Header(h =>
                    {
                        foreach (var titulo in new[] { "Pedido SAP", "Codigo", "Cant.", "UM", "Material:", "Serie", "Ubicacion" })
                            h.Cell().Background(GrisMedio).PaddingVertical(2).PaddingHorizontal(2).Text(titulo).FontSize(6.5f);
                    });

                    foreach (var d in _detalle)
                    {
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.PedidoSap ?? "");
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.CodPap ?? "");
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).AlignRight().Text(d.CantSap.ToString("0.00", EsPe));
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.UnidadMedida ?? "");
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.NombreMaterial ?? "");
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.Serie ?? "");
                        tabla.Cell().PaddingVertical(4).PaddingHorizontal(2).Text(d.NombreSiteOrigen ?? "");
                    }
                });
            });

            page.Footer().Row(row =>
            {
                row.RelativeItem();
                if (_pie2 is not null) row.ConstantItem(48).AlignBottom().Image(_pie2).FitWidth();
                if (_pie1 is not null) row.ConstantItem(40).PaddingLeft(6).AlignBottom().Image(_pie1).FitWidth();
            });
        });
    }

    private static void Banda(IContainer c, string texto, string fondo, float tamano, string color) =>
        c.Background(fondo).PaddingHorizontal(2).PaddingVertical(1).Text(texto).FontSize(tamano).FontColor(color);

    private static void Contacto(ColumnDescriptor col, string etiqueta, string? nombre, string? dni, string? telefono)
    {
        col.Item().Row(r =>
        {
            r.ConstantItem(45).PaddingLeft(2).Text(etiqueta);
            r.RelativeItem(3).Text(nombre ?? "");
            r.ConstantItem(30).Text(string.IsNullOrEmpty(etiqueta) ? "" : "DNI:");
            r.RelativeItem(1.2f).Text(dni ?? "");
            r.RelativeItem(1.3f).Text(string.IsNullOrEmpty(etiqueta) ? (telefono ?? "") : $"Telefono: {telefono}");
        });
    }
}
