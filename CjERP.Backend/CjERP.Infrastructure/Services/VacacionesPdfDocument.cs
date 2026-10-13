using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Carta "Solicitud de Vacaciones" con las tres aprobaciones del sistema.
/// Basada en el reporte XtraReport1 de DXAsignacion (membrete, asunto, cuerpo, aprobaciones, pie).
/// </summary>
internal sealed class VacacionesPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private const string Direccion = "Calle Santa Justina 620, Cercado de Lima";
    // Destinataria fija de la carta, igual que en el reporte de referencia.
    private const string Atencion = "Angela Ortiz Quispe";
    private static readonly string Gris = Colors.Grey.Darken2;

    private readonly VacacionesCartaDto _carta;
    private readonly DateTime _fechaEmision;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    public VacacionesPdfDocument(VacacionesCartaDto carta, DateTime fechaEmision)
    {
        _carta = carta;
        _fechaEmision = fechaEmision;
        _membrete = LeerImagen("membrete.png");
        _pie1 = LeerImagen("pie_1.png");
        _pie2 = LeerImagen("pie_2.png");
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

            page.Header().Element(ComposeHeader);
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }

    private void ComposeHeader(IContainer container)
    {
        container.PaddingBottom(6).Column(column =>
        {
            if (_membrete is not null)
            {
                column.Item().Image(_membrete).FitWidth();
            }
            else
            {
                column.Item().Text("CJ Telecom SAC").FontSize(14).Bold();
            }
        });
    }

    private void ComposeContent(IContainer container)
    {
        var inicio = _carta.FechaInicio.ToString("dd/MM/yyyy", EsPe);
        var fin = _carta.FechaFin.ToString("dd/MM/yyyy", EsPe);
        var nombre = Valor(_carta.NombreEmpleado);

        container.PaddingTop(10).Column(column =>
        {
            column.Spacing(8);

            column.Item().AlignCenter().Text("SOLICITUD DE VACACIONES").FontSize(13).Bold();

            if (!string.IsNullOrWhiteSpace(_carta.NombreCliente))
            {
                column.Item().Text(_carta.NombreCliente!.Trim()).FontSize(11).Bold();
            }

            column.Item().Column(datos =>
            {
                datos.Spacing(2);
                datos.Item().Text(Direccion);
                datos.Item().Text($"Lima, {_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe)}");
            });

            column.Item().PaddingTop(4).Column(destino =>
            {
                destino.Spacing(3);
                destino.Item().Text(text =>
                {
                    text.Span("Atención : ").Bold();
                    text.Span(Atencion);
                });
                destino.Item().Text(text =>
                {
                    text.Span("Asunto : ").Bold();
                    text.Span("Solicitud de Vacaciones");
                });
            });

            column.Item().PaddingTop(6).Text(
                $"Por medio de la presente, yo {nombre}, identificado(a) con Nro. {Valor(_carta.NroDocumento)}, " +
                "me dirijo a usted para solicitar la autorización de mis vacaciones.")
                .Justify();

            column.Item().Text(
                $"Solicito tomar mis días de descanso desde el {inicio} hasta el {fin}, " +
                "en cumplimiento con la normativa laboral y el reglamento interno de la empresa.")
                .Justify();

            column.Item().Text(
                "Agradezco su confirmación y la coordinación necesaria para garantizar la continuidad " +
                "de mis funciones durante mi ausencia. Quedo a la espera de su pronta respuesta.")
                .Justify();

            column.Item().PaddingTop(8).Column(firma =>
            {
                firma.Spacing(2);
                firma.Item().Text("Atentamente,");
                firma.Item().PaddingTop(22).Text(nombre).Bold();
            });

            column.Item().PaddingTop(10).Element(ComposeAprobaciones);
        });
    }

    private void ComposeAprobaciones(IContainer container)
    {
        container.Column(column =>
        {
            column.Spacing(3);
            column.Item().Text("Aprobaciones registradas en el sistema").Bold().FontColor(Gris);
            column.Item().Element(c => FilaAprobacion(c, "1era Aprobación: (x Sistema)", _carta.PreAprobador));
            column.Item().Element(c => FilaAprobacion(c, "2da Aprobación: (x Sistema)", _carta.PrimAprobador));
            column.Item().Element(c => FilaAprobacion(c, "3ra Aprobación: (x Sistema)", _carta.Autorizado));
        });
    }

    private static void FilaAprobacion(IContainer container, string etiqueta, string? aprobador)
    {
        container.Row(row =>
        {
            row.ConstantItem(170).Text(etiqueta).FontSize(9);
            row.RelativeItem().Text(Valor(aprobador)).FontSize(9).Bold();
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

    private static string Valor(string? valor) => string.IsNullOrWhiteSpace(valor) ? "—" : valor.Trim();

    internal static byte[]? LeerImagen(string nombre)
    {
        var assembly = typeof(VacacionesPdfDocument).Assembly;
        var recurso = $"CjERP.Infrastructure.Assets.Vacaciones.{nombre}";
        using var stream = assembly.GetManifestResourceStream(recurso);
        if (stream is null)
        {
            return null;
        }

        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }
}
