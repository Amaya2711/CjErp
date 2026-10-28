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
    private readonly bool _autorizado;
    private readonly byte[]? _membrete;
    private readonly byte[]? _pie1;
    private readonly byte[]? _pie2;

    /// <param name="autorizado">false = la solicitud no tiene la 3ra aprobación: se imprime la marca de agua "NO AUTORIZADO".</param>
    public VacacionesPdfDocument(VacacionesCartaDto carta, DateTime fechaEmision, bool autorizado = true)
    {
        _carta = carta;
        _fechaEmision = fechaEmision;
        _autorizado = autorizado;
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
                if (!_autorizado)
                {
                    ComponerMarcaDeAgua(layers);
                }
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
            Colocar(layers, 0, 0, 672.2f, 148.6f, conPadding: false).Image(_membrete).FitArea();
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
            Colocar(layers, 29.16667f, 197f, 230.8333f, 23f)
                .Text(_carta.NombreCliente!.Trim()).FontSize(11).Bold();
        }

        Colocar(layers, 29.16667f, 220f, 330f, 23f).Text(Direccion).FontSize(10);

        // Solo la fecha (el reporte original no antepone "Lima,")
        Colocar(layers, 26.66667f, 243f, 365.8333f, 26.3333f)
            .Text(_fechaEmision.ToString("d 'de' MMMM 'de' yyyy", EsPe));

        Colocar(layers, 26.66667f, 285f, 88.3333f, 23f).Text("Atención :").FontSize(10).Bold();
        Colocar(layers, 115f, 285f, 218.3333f, 23f).Text(Atencion);

        Colocar(layers, 29.16667f, 343.3334f, 88.3333f, 23f).Text("Asunto :").FontSize(10).Bold();
        Colocar(layers, 117.5f, 343.3334f, 215.8333f, 23f).Text("Solicitud de Vacaciones");

        Colocar(layers, 27.5f, 404.6667f, 640f, 60f).Text(
            $"Por medio de la presente, yo {nombre}\n" +
            $"identificado con Nro: {Valor(_carta.NroDocumento)}   me dirijo a usted para solicitar la autorización de mis vacaciones.");

        Colocar(layers, 27.5f, 467.8334f, 640f, 52f).Text(
            $"Solicito tomar mis días de descanso desde el {inicio} hasta el {fin},\n" +
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
            Colocar(layers, 496.6667f, yPie, 82.5f, 78.33334f, conPadding: false).Image(_pie2).FitArea();
        }

        if (_pie1 is not null)
        {
            Colocar(layers, 579.1667f, yPie, 60.83334f, 100f, conPadding: false).Image(_pie1).FitArea();
        }
    }

    /// <summary>Marca de agua diagonal centrada en la hoja, encima del contenido, para documentos sin la 3ra aprobación.</summary>
    private static void ComponerMarcaDeAgua(LayersDescriptor layers)
    {
        // El giro se hace sobre la esquina superior izquierda del cuadro: se calcula dónde ubicarla para que, una vez
        // girado -45°, el centro del cuadro caiga en el centro de la hoja Carta (612 x 792 pt).
        const float ancho = 560f;
        const float alto = 96f;
        const float centroX = 306f;
        const float centroY = 396f;
        var raiz2 = MathF.Sqrt(2f);
        // +11.5 / +5.5: corrección medida sobre el PDF renderizado (el trazo del texto no llena todo el cuadro).
        var x = centroX - (ancho + alto) / (2f * raiz2) + 11.5f;
        var y = centroY - (alto - ancho) / (2f * raiz2) + 5.5f;

        layers.Layer().TranslateX(x).TranslateY(y).Width(ancho).Height(alto).Rotate(-45).AlignMiddle().Column(marca =>
        {
            marca.Item().AlignCenter().Text("NO AUTORIZADO")
                .FontSize(60).Bold().FontColor(Color.FromARGB(70, 200, 0, 0));
            marca.Item().AlignCenter().Text("Sin la 3ra aprobación - documento no válido")
                .FontSize(18).Bold().FontColor(Color.FromARGB(70, 200, 0, 0));
        });
    }

    private static void FilaAprobacion(LayersDescriptor layers, float y, string etiqueta, string? aprobador)
    {
        Colocar(layers, 37.49995f, y, 153.3333f, 23f).AlignMiddle().Text(etiqueta).FontSize(8);
        Colocar(layers, 190.8333f, y, 219.1667f, 23f).AlignMiddle().Text(Valor(aprobador)).FontSize(8);
    }

    /// <summary>Coloca un contenedor en posición absoluta (coordenadas del reporte, relativas al margen lateral).</summary>
    private static IContainer Colocar(LayersDescriptor layers, float x, float y, float ancho, float alto, bool conPadding = true) =>
        layers.Layer()
            .TranslateX((MargenX + x) * Punto)
            .TranslateY(y * Punto)
            .Width(ancho * Punto)
            .Height(alto * Punto)
            .PaddingHorizontal(conPadding ? 2 * Punto : 0);

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
