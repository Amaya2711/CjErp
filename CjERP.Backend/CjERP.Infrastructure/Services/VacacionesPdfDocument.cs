using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Carta "Solicitud de Vacaciones" con las tres aprobaciones del sistema.
/// Réplica del reporte XtraReport1 de DXAsignacion (XtraReport1.Designer.vb): hoja Carta, márgenes laterales de 1",
/// controles en posición absoluta. Las coordenadas están en centésimas de pulgada (unidad de DevExpress) y se
/// convierten a puntos (x 0.72).
/// </summary>
internal sealed class VacacionesPdfDocument : IDocument
{
    private static readonly CultureInfo EsPe = CultureInfo.GetCultureInfo("es-PE");
    private const string Direccion = "Calle Santa Justina 620, Cercado de Lima";
    // Destinataria fija de la carta, igual que en el reporte de referencia.
    private const string Atencion = "Angela Ortiz Quispe";

    private const float Punto = 0.72f;                 // 1/100 de pulgada -> puntos
    private const float MargenX = 100f;                // margen lateral del reporte (1")
    private const float AnchoContenido = 650f;
    private const float AltoPagina = 1100f;

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
            page.Size(PageSizes.Letter);
            page.Margin(0);
            page.DefaultTextStyle(style => style.FontFamily("Arial").FontSize(9.75f).FontColor(Colors.Black));

            page.Content().Layers(layers =>
            {
                layers.PrimaryLayer().Width(AnchoContenido * Punto + 2 * MargenX * Punto).Height(AltoPagina * Punto);
                ComponerContenido(layers);
            });
        });
    }

    private void ComponerContenido(LayersDescriptor layers)
    {
        var inicio = _carta.FechaInicio.ToString("d", EsPe);
        var fin = _carta.FechaFin.ToString("d", EsPe);
        var nombre = Valor(_carta.NombreEmpleado);

        // Membrete (TopMargin: 0,0 - 650 x 146.67)
        if (_membrete is not null)
        {
            Colocar(layers, 0, 0, 650f, 146.6667f).Image(_membrete).FitArea();
        }
        else
        {
            Colocar(layers, 0, 0, 650f, 146.6667f).Text("CJ Telecom SAC").FontSize(14).Bold();
        }

        // Título centrado
        Colocar(layers, 0, 146.6667f, 650f, 23f).AlignMiddle().AlignCenter()
            .Text("SOLICITUD DE VACACIONES").FontSize(11).Bold();

        if (!string.IsNullOrWhiteSpace(_carta.NombreCliente))
        {
            Colocar(layers, 29.16667f, 197f, 230.8333f, 23f).AlignMiddle()
                .Text(_carta.NombreCliente!.Trim()).FontSize(11).Bold();
        }

        Colocar(layers, 29.16667f, 220f, 330f, 23f).AlignMiddle().Text(Direccion).FontSize(10);

        // Solo la fecha (el reporte original no antepone "Lima,")
        Colocar(layers, 26.66667f, 243f, 365.8333f, 26.3333f).AlignMiddle()
            .Text(_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe));

        Colocar(layers, 26.66667f, 285f, 88.3333f, 23f).AlignMiddle().Text("Atención :").FontSize(10).Bold();
        Colocar(layers, 115f, 285f, 218.3333f, 23f).AlignMiddle().Text(Atencion);

        Colocar(layers, 29.16667f, 343.3334f, 88.3333f, 23f).AlignMiddle().Text("Asunto :").FontSize(10).Bold();
        Colocar(layers, 117.5f, 343.3334f, 215.8333f, 23f).AlignMiddle().Text("Solicitud de Vacaciones");

        Colocar(layers, 27.5f, 404.6667f, 584.1667f, 60f).Text(
            $"Por medio de la presente, yo {nombre}, identificado con Nro: {Valor(_carta.NroDocumento)} " +
            "me dirijo a usted para solicitar la autorización de mis vacaciones.");

        Colocar(layers, 27.5f, 467.8334f, 584.1666f, 52f).Text(
            $"Solicito tomar mis días de descanso desde el {inicio} hasta el {fin}, " +
            "en cumplimiento con la normativa laboral y el reglamento interno de la empresa.");

        Colocar(layers, 27.5f, 523.5002f, 584.1666f, 40f).Text(
            "Agradezco su confirmación y la coordinación necesaria para garantizar la continuidad " +
            "de mis funciones durante mi ausencia. Quedo atento a su pronta respuesta.");

        // Firma en el lado derecho
        Colocar(layers, 358.3333f, 585.9999f, 281.6667f, 23f).Text("Atentamente,");
        Colocar(layers, 358.3333f, 608.9999f, 281.6667f, 23f).AlignMiddle().Text(nombre);

        // Aprobaciones (Arial 8)
        FilaAprobacion(layers, 697.4999f, "1era Aprobacion: ( x Sistema)", _carta.PreAprobador);
        FilaAprobacion(layers, 720.4998f, "2da Aprobacion:  ( x Sistema)", _carta.PrimAprobador);
        FilaAprobacion(layers, 743.4998f, "3ra Aprobacion:   ( x Sistema)", _carta.Autorizado);

        // Pie (BottomMargin, 1" desde el borde inferior de la hoja)
        var yPie = AltoPagina - 100f;
        if (_pie2 is not null)
        {
            Colocar(layers, 496.6667f, yPie, 82.5f, 78.33334f).Image(_pie2).FitArea();
        }

        if (_pie1 is not null)
        {
            Colocar(layers, 579.1667f, yPie, 60.83334f, 100f).Image(_pie1).FitArea();
        }
    }

    private static void FilaAprobacion(LayersDescriptor layers, float y, string etiqueta, string? aprobador)
    {
        Colocar(layers, 37.49995f, y, 153.3333f, 23f).AlignMiddle().Text(etiqueta).FontSize(8);
        Colocar(layers, 190.8333f, y, 219.1667f, 23f).AlignMiddle().Text(Valor(aprobador)).FontSize(8);
    }

    /// <summary>Coloca un contenedor en posición absoluta (coordenadas del reporte, relativas al margen lateral).</summary>
    private static IContainer Colocar(LayersDescriptor layers, float x, float y, float ancho, float alto) =>
        layers.Layer()
            .TranslateX((MargenX + x) * Punto)
            .TranslateY(y * Punto)
            .Width(ancho * Punto)
            .Height(alto * Punto)
            .PaddingHorizontal(2 * Punto);

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
