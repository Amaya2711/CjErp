using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Carta de comunicación de descanso médico con las aprobaciones registradas en el sistema.
/// Mismo diseño (membrete y pie) que la carta de vacaciones.
/// </summary>
internal sealed class DescansoPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private static readonly string Gris = Colors.Grey.Darken2;

    private readonly DescansoCartaDto _carta;
    private readonly DateTime _fechaEmision;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    public DescansoPdfDocument(DescansoCartaDto carta, DateTime fechaEmision)
    {
        _carta = carta;
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
        var nombre = Valor(_carta.NombreEmpleado);
        var inicio = _carta.FechaInicio.ToString("dd/MM/yyyy", EsPe);
        var fin = _carta.FechaFin.ToString("dd/MM/yyyy", EsPe);
        var dias = _carta.Dias > 0 ? _carta.Dias : Math.Max(1, (_carta.FechaFin.Date - _carta.FechaInicio.Date).Days + 1);

        container.PaddingTop(10).Column(column =>
        {
            column.Spacing(9);

            column.Item().AlignCenter().Text("COMUNICACIÓN DE DESCANSO MÉDICO").FontSize(13).Bold();

            if (!string.IsNullOrWhiteSpace(_carta.NombreCliente))
            {
                column.Item().Text(_carta.NombreCliente!.Trim()).FontSize(11).Bold();
            }

            column.Item().Text($"Lima, {_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe)}");

            column.Item().PaddingTop(4).Text(text =>
            {
                text.Span("Asunto : ").Bold();
                text.Span("Descanso médico");
            });

            column.Item().Text(text =>
            {
                text.Justify();
                text.Span("Por medio de la presente se deja constancia de que ");
                text.Span(nombre).Bold();
                text.Span($", identificado(a) con Nro. {Valor(_carta.NroDocumento)}, cuenta con descanso médico desde el ");
                text.Span(inicio).Bold();
                text.Span(" hasta el ");
                text.Span(fin).Bold();
                text.Span($" ({dias} día{(dias == 1 ? string.Empty : "s")} calendario), sustentado con el documento adjunto registrado en el sistema.");
            });

            // Solo se muestran las aprobaciones que existen; sin ninguna, se omite toda la sección.
            var pasos = new[]
            {
                ("1era Aprobación: (x Sistema)", _carta.PreAprobador),
                ("2da Aprobación: (x Sistema)", _carta.PrimAprobador),
                ("Autorización final: (x Sistema)", _carta.Autorizado),
            }.Where(p => !string.IsNullOrWhiteSpace(p.Item2)).ToList();

            if (pasos.Count == 0)
            {
                return;
            }

            column.Item().Text("Cumple con el procedimiento de validación interno, el cual quedó aprobado según el detalle siguiente.").Justify();

            column.Item().PaddingTop(10).Column(aprobaciones =>
            {
                aprobaciones.Spacing(3);
                aprobaciones.Item().Text("Aprobaciones registradas en el sistema").Bold().FontColor(Gris);
                foreach (var (etiqueta, aprobador) in pasos)
                {
                    aprobaciones.Item().Element(c => FilaAprobacion(c, etiqueta, aprobador));
                }
            });
        });
    }

    private static void FilaAprobacion(IContainer container, string etiqueta, string? aprobador)
    {
        container.Row(row =>
        {
            row.ConstantItem(190).Text(etiqueta).FontColor(Gris);
            row.RelativeItem().Text(Valor(aprobador)).Bold();
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
}
