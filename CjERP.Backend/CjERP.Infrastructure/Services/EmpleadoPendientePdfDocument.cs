using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Listado de pendientes agrupado por la relación empleado / responsable (una sección por cada par).
/// Mismo membrete y pie que las cartas de vacaciones, beneficios y descanso médico.
/// </summary>
internal sealed class EmpleadoPendientePdfDocument : IDocument
{
    private const int IdEstadoTerminado = 4;

    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private static readonly string Gris = Colors.Grey.Darken2;

    private readonly IReadOnlyList<EmpleadoPendienteDto> _items;
    private readonly DateTime _fechaEmision;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    public EmpleadoPendientePdfDocument(IReadOnlyList<EmpleadoPendienteDto> items, DateTime fechaEmision)
    {
        _items = items;
        _fechaEmision = fechaEmision;
        _membrete = VacacionesPdfDocument.LeerImagen("membrete.png");
        _pie1 = VacacionesPdfDocument.LeerImagen("pie_1.png");
        _pie2 = VacacionesPdfDocument.LeerImagen("pie_2.png");
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        var grupos = _items
            .GroupBy(x => new { x.IdEmpleado, x.IdResponsable })
            .Select(g => new
            {
                Empleado = Valor(g.First().NombreEmpleado),
                Responsable = Valor(g.First().Responsable),
                Filas = g.OrderBy(x => x.FechaEstimacionTermino).ThenBy(x => x.IdPendiente).ToList()
            })
            .OrderBy(g => g.Empleado, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(g => g.Responsable, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        container.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.MarginTop(10, Unit.Millimetre);
            page.MarginBottom(12, Unit.Millimetre);
            page.MarginHorizontal(14, Unit.Millimetre);
            page.DefaultTextStyle(style => style.FontFamily("Arial").FontSize(8.5f).FontColor(Colors.Black));

            page.Header().PaddingBottom(6).Element(c =>
            {
                if (_membrete is not null)
                {
                    // Página horizontal: el membrete a todo el ancho queda enorme, se limita su tamaño.
                    c.AlignRight().MaxWidth(260).MaxHeight(58).Image(_membrete).FitArea();
                }
                else
                {
                    c.Text("CJ Telecom SAC").FontSize(14).Bold();
                }
            });

            page.Content().Column(column =>
            {
                column.Spacing(10);
                column.Item().AlignCenter().Text("PENDIENTES POR EMPLEADO / RESPONSABLE").FontSize(13).Bold();
                column.Item().AlignCenter()
                    .Text($"Lima, {_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe)} · {_items.Count} pendiente{(_items.Count == 1 ? string.Empty : "s")}")
                    .FontColor(Gris);

                foreach (var grupo in grupos)
                {
                    column.Item().Element(c => ComposeGrupo(c, grupo.Empleado, grupo.Responsable, grupo.Filas));
                }
            });

            page.Footer().Element(ComposeFooter);
        });
    }

    private void ComposeGrupo(IContainer container, string empleado, string responsable, IReadOnlyList<EmpleadoPendienteDto> filas)
    {
        container.Column(column =>
        {
            column.Spacing(3);

            column.Item().Background(Colors.Grey.Lighten3).Padding(4).Text(text =>
            {
                text.Span("Empleado: ").FontColor(Gris);
                text.Span(empleado).Bold();
                text.Span("     Responsable: ").FontColor(Gris);
                text.Span(responsable).Bold();
                text.Span($"   ({filas.Count})").FontColor(Gris);
            });

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(30);   // Id
                    columns.ConstantColumn(54);   // F. inicio
                    columns.ConstantColumn(54);   // F. término
                    columns.ConstantColumn(40);   // Días demora
                    columns.ConstantColumn(62);   // Estado
                    columns.RelativeColumn(3);    // Comentario
                    columns.RelativeColumn(2);    // Observación
                });

                table.Header(header =>
                {
                    Cabecera(header.Cell(), "Id");
                    Cabecera(header.Cell(), "F. inicio");
                    Cabecera(header.Cell(), "F. término");
                    Cabecera(header.Cell(), "Días demora");
                    Cabecera(header.Cell(), "Estado");
                    Cabecera(header.Cell(), "Comentario");
                    Cabecera(header.Cell(), "Observación");
                });

                foreach (var item in filas)
                {
                    var demora = DiasDemora(item);

                    Celda(table.Cell(), item.IdPendiente.ToString(CultureInfo.InvariantCulture));
                    Celda(table.Cell(), Fecha(item.FechaInicio));
                    Celda(table.Cell(), Fecha(item.FechaEstimacionTermino));
                    Celda(
                        table.Cell(),
                        demora?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
                        demora > 0 ? Colors.Red.Darken2 : null,
                        negrita: demora > 0);
                    Celda(table.Cell(), Valor(item.Estado));
                    Celda(table.Cell(), Valor(item.Comentario));
                    Celda(table.Cell(), Valor(item.Observacion));
                }
            });
        });
    }

    private static void Cabecera(IContainer cell, string texto) =>
        cell.Background(Colors.Grey.Lighten3).Padding(3).Text(texto).Bold().FontSize(8);

    private static void Celda(IContainer cell, string texto, string? color = null, bool negrita = false)
    {
        var text = cell
            .BorderBottom(0.5f)
            .BorderColor(Colors.Grey.Lighten1)
            .Padding(3)
            .Text(texto);

        if (color is not null)
        {
            text.FontColor(color);
        }

        if (negrita)
        {
            text.Bold();
        }
    }

    /// <summary>Hoy (Lima) - fecha estimada de término; 0 si no está vencido; null si estado 4 o sin fecha.</summary>
    private int? DiasDemora(EmpleadoPendienteDto item)
    {
        if (item.IdEstado == IdEstadoTerminado || !item.FechaEstimacionTermino.HasValue)
        {
            return null;
        }

        return Math.Max((_fechaEmision.Date - item.FechaEstimacionTermino.Value.Date).Days, 0);
    }

    private void ComposeFooter(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().AlignBottom().Text(text =>
            {
                text.Span("Documento generado automáticamente por el sistema ERP de CJ Telecom.   Página ").FontSize(7).FontColor(Gris);
                text.CurrentPageNumber().FontSize(7).FontColor(Gris);
                text.Span(" de ").FontSize(7).FontColor(Gris);
                text.TotalPages().FontSize(7).FontColor(Gris);
            });

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

    private static string Fecha(DateTime? fecha) => fecha?.ToString("dd/MM/yyyy", EsPe) ?? string.Empty;

    private static string Valor(string? valor) => string.IsNullOrWhiteSpace(valor) ? "—" : valor.Trim();
}
