using System.Globalization;
using CjERP.Application.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CjERP.Infrastructure.Services;

// Reporte gerencial de asistencia (PDF ejecutivo). Todo el contenido usa elementos nativos de QuestPDF (sin SVG)
// para que ninguna etiqueta dependa de la fuente del render de graficos.
public sealed partial class ReportePdfService
{
    private const decimal MetaAsistenciaGerencial = 95m;
    private const string GxNavy = "#0F3D6E";
    private const string GxText = "#334155";
    private const string GxMuted = "#64748B";
    private const string GxBorder = "#D9E2EC";

    private static readonly string[] GxDiasNombre = { "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado" };
    private static readonly string[] GxDiasCorto = { "dom", "lun", "mar", "mié", "jue", "vie", "sáb" };

    private static Document BuildExecutiveGerencialDocument(AsistenciaGerencialPdfDto reporte)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                GxConfigurePage(page, reporte);
                page.Content().PaddingTop(10).Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Element(c => GxBanner(c, reporte));
                    column.Item().Element(c => GxKpis(c, reporte));
                    column.Item().Element(c => GxLectura(c, reporte));
                    column.Item().Element(c => GxDecisiones(c, reporte));
                    column.Item().Element(c => GxComposicionEstados(c, reporte.Graficos.DistribucionPorEstado));
                });
            });

            container.Page(page =>
            {
                GxConfigurePage(page, reporte);
                page.Content().PaddingTop(10).Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Element(c => GxSectionTitle(c, "Dónde actuar: responsables y empleados críticos", "Priorice el seguimiento en quienes concentran las incidencias del periodo."));
                    column.Item().Element(c => GxTablaResponsables(c, reporte.Incidencias.ResponsablesCriticos));
                    column.Item().Element(c => GxTablaEmpleados(c, reporte.Incidencias.EmpleadosCriticos));
                });
            });

            container.Page(page =>
            {
                GxConfigurePage(page, reporte);
                page.Content().PaddingTop(10).Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Element(c => GxSectionTitle(c, "Evolución y segmentación", "Qué días, clientes y áreas concentran las incidencias."));
                    column.Item().Element(c => GxGraficoDiario(c, reporte.Graficos.TendenciaDiaria));
                    column.Item().Row(row =>
                    {
                        row.Spacing(10);
                        row.RelativeItem().Element(c => GxRankingBarras(c, "Incidencias por cliente", reporte.Incidencias.IncidenciasPorCliente, "#2563EB"));
                        row.RelativeItem().Element(c => GxRankingBarras(c, "Incidencias por área", reporte.Incidencias.IncidenciasPorArea, "#7C3AED"));
                    });
                    column.Item().Element(c => GxTablaPendientes(c, reporte.Incidencias.PendientesAprobacion));
                    column.Item().Element(GxNotaMetodologica);
                });
            });
        });
    }

    private static void GxConfigurePage(PageDescriptor page, AsistenciaGerencialPdfDto reporte)
    {
        page.Size(PageSizes.A4);
        page.MarginHorizontal(24);
        page.MarginVertical(20);
        page.DefaultTextStyle(x => x.FontSize(9).FontColor(GxText));

        page.Header().PaddingBottom(6).BorderBottom(1).BorderColor(GxBorder).Row(row =>
        {
            row.RelativeItem().Column(left =>
            {
                left.Item().Text("CJ TELECOM").Bold().FontSize(17).FontColor(GxNavy);
                left.Item().Text("Reporte gerencial de asistencia").SemiBold().FontSize(11).FontColor("#1E3A5F");
            });

            row.ConstantItem(230).Column(right =>
            {
                right.Item().AlignRight().Text($"Periodo: {reporte.PeriodoConsultado}").SemiBold().FontSize(9);
                right.Item().AlignRight().Text($"Generado: {reporte.FechaGeneracion:dd/MM/yyyy HH:mm}").FontSize(8).FontColor(GxMuted);
                right.Item().AlignRight().Text($"Para: {ShortenName(reporte.Destinatario, 40)}").FontSize(8).FontColor(GxMuted);
            });
        });

        page.Footer().Row(row =>
        {
            row.RelativeItem().Text("Cj Telecom - Reporte gerencial de asistencia | Uso interno y confidencial").FontSize(7.5f).FontColor(GxMuted);
            row.ConstantItem(80).AlignRight().Text(text =>
            {
                text.DefaultTextStyle(x => x.FontSize(7.5f).FontColor(GxMuted));
                text.Span("Página ");
                text.CurrentPageNumber();
                text.Span(" / ");
                text.TotalPages();
            });
        });
    }

    private static (string Accent, string Background, string Label) GxNivel(decimal asistencia)
    {
        if (asistencia >= MetaAsistenciaGerencial)
        {
            return ("#027A48", "#ECFDF3", "CUMPLE LA META");
        }

        return asistencia >= 90m
            ? ("#B54708", "#FFFAEB", "EN ATENCIÓN")
            : ("#B42318", "#FEF3F2", "NIVEL CRÍTICO");
    }

    private static (string Accent, string Background) GxTone(string? semaforo) =>
        semaforo?.Trim().ToUpperInvariant() switch
        {
            "ROJO" => ("#F04438", "#FEE4E2"),
            "AMARILLO" => ("#F79009", "#FEF0C7"),
            _ => ("#12B76A", "#D1FADF")
        };

    private static string GxSigned(decimal value) =>
        value > 0m ? $"+{value.ToString("0.0", CultureInfo.InvariantCulture)}" : value.ToString("0.0", CultureInfo.InvariantCulture);

    private static void GxSectionTitle(IContainer container, string title, string subtitle)
    {
        container.Column(column =>
        {
            column.Item().Text(title).Bold().FontSize(15).FontColor(GxNavy);
            column.Item().Text(subtitle).FontSize(9).FontColor(GxMuted);
        });
    }

    private static void GxBanner(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var k = reporte.Kpis;
        var (accent, background, label) = GxNivel(k.PorcentajeAsistencia);
        var brecha = k.PorcentajeAsistencia - MetaAsistenciaGerencial;

        var titular = brecha >= 0m
            ? $"La asistencia efectiva cumple la meta de {MetaAsistenciaGerencial:0}% (+{brecha:0.0} puntos)."
            : $"La asistencia efectiva está {Math.Abs(brecha):0.0} puntos por debajo de la meta de {MetaAsistenciaGerencial:0}%.";

        string? comparativo = null;
        if (k.AsistenciaPeriodoAnterior is { } anterior)
        {
            var variacion = k.PorcentajeAsistencia - anterior;
            var tendencia = variacion > 0.05m ? $"mejora de {variacion:0.0} puntos" : variacion < -0.05m ? $"deterioro de {Math.Abs(variacion):0.0} puntos" : "sin cambios";
            comparativo = $"Vs. periodo anterior ({anterior:0.0}%): {tendencia}."
                + (k.IncidenciasPeriodoAnterior is { } incAnterior
                    ? $" Incidencias críticas: de {incAnterior} a {k.IncidenciasCriticas}."
                    : string.Empty);
        }

        container.Border(1).BorderColor(accent).Background(background).Padding(12).Row(row =>
        {
            row.ConstantItem(150).Column(left =>
            {
                left.Item().Text("Asistencia efectiva").SemiBold().FontSize(9).FontColor(GxMuted);
                left.Item().Text($"{k.PorcentajeAsistencia:0.0}%").Bold().FontSize(32).FontColor(accent);
                left.Item().Text(label).Bold().FontSize(10).FontColor(accent);
            });

            row.RelativeItem().PaddingLeft(14).AlignMiddle().Column(right =>
            {
                right.Spacing(4);
                right.Item().Text(titular).Bold().FontSize(11).FontColor("#1F2937");
                right.Item().Text($"{k.TotalEmpleados} empleados evaluados · {k.TotalRegistros} registros diarios · {k.IncidenciasCriticas} con incidencia crítica.").FontSize(9);
                if (comparativo is not null)
                {
                    right.Item().Text(comparativo).FontSize(9);
                }
            });
        });
    }

    private static void GxKpis(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var k = reporte.Kpis;
        string Rojo(int value) => value > 0 ? "#B42318" : "#027A48";
        string Fondo(int value) => value > 0 ? "#FEF3F2" : "#ECFDF3";

        var fila1 = new[]
        {
            ("Empleados evaluados", k.TotalEmpleados.ToString(CultureInfo.InvariantCulture), $"{k.TotalRegistros} registros diarios", GxNavy, "#F8FAFC"),
            ("Incidencias críticas", k.IncidenciasCriticas.ToString(CultureInfo.InvariantCulture), "Falta, incompleto o rechazado", Rojo(k.IncidenciasCriticas), Fondo(k.IncidenciasCriticas)),
            ("Faltas", k.Faltas.ToString(CultureInfo.InvariantCulture), "Registros en estado FALTA", Rojo(k.Faltas), Fondo(k.Faltas)),
            ("Pendientes de aprobar", k.FaltaAprobar.ToString(CultureInfo.InvariantCulture), "FALTA APROBAR: cuentan como falta", Rojo(k.FaltaAprobar), Fondo(k.FaltaAprobar))
        };

        var fila2 = new[]
        {
            ("Incompletos", k.Incompletos.ToString(CultureInfo.InvariantCulture), "Marcación sin cierre", Rojo(k.Incompletos), Fondo(k.Incompletos)),
            ("Sin marcar / sin salida", $"{k.SinMarcar} / {k.SinSalida}", "Registros por regularizar", Rojo(k.SinMarcar + k.SinSalida), Fondo(k.SinMarcar + k.SinSalida)),
            ("Empleados con brecha", k.EmpleadosConDiferenciaNegativa.ToString(CultureInfo.InvariantCulture), "Horas por debajo de lo laboral", Rojo(k.EmpleadosConDiferenciaNegativa), Fondo(k.EmpleadosConDiferenciaNegativa)),
            ("Horas laboradas", k.TotalHorasLaboradas.ToString("0.##", CultureInfo.InvariantCulture), $"Promedio {k.PromedioHorasPorEmpleado:0.##} h por empleado", GxNavy, "#F8FAFC")
        };

        container.Column(column =>
        {
            column.Spacing(8);
            foreach (var fila in new[] { fila1, fila2 })
            {
                column.Item().Row(row =>
                {
                    row.Spacing(8);
                    foreach (var (title, value, caption, accent, background) in fila)
                    {
                        row.RelativeItem().Element(c => GxKpiCard(c, title, value, caption, accent, background));
                    }
                });
            }
        });
    }

    private static void GxKpiCard(IContainer container, string title, string value, string caption, string accent, string background)
    {
        container.Background(background).Border(1).BorderColor(GxBorder).Padding(8).Column(column =>
        {
            column.Spacing(2);
            column.Item().Text(title).SemiBold().FontSize(8.5f).FontColor(GxMuted);
            column.Item().Text(value).Bold().FontSize(19).FontColor(accent);
            column.Item().Text(caption).FontSize(7.5f).FontColor(GxMuted);
        });
    }

    private static IReadOnlyList<(string Color, string Texto)> GxConstruirLectura(AsistenciaGerencialPdfDto reporte)
    {
        var k = reporte.Kpis;
        var filas = new List<(string, string)>();

        if (k.PorcentajeAsistencia >= MetaAsistenciaGerencial)
        {
            filas.Add(("#12B76A", $"La asistencia efectiva ({k.PorcentajeAsistencia:0.0}%) está dentro de la meta; el foco es sostener el control de aprobaciones."));
        }
        else
        {
            filas.Add(("#F04438", $"La asistencia efectiva ({k.PorcentajeAsistencia:0.0}%) no alcanza la meta de {MetaAsistenciaGerencial:0}%: hay {k.IncidenciasCriticas} registros con incidencia crítica."));
        }

        if (k.AsistenciaPeriodoAnterior is { } anterior)
        {
            var variacion = k.PorcentajeAsistencia - anterior;
            filas.Add((variacion < -0.05m ? "#F04438" : variacion > 0.05m ? "#12B76A" : "#F79009",
                $"Respecto al periodo anterior la asistencia {(variacion > 0.05m ? "mejoró" : variacion < -0.05m ? "empeoró" : "se mantuvo")} ({GxSigned(variacion)} puntos)."));
        }

        var diaCritico = reporte.Graficos.TendenciaDiaria.OrderByDescending(d => d.Incidencias).ThenBy(d => d.Fecha).FirstOrDefault();
        if (diaCritico is not null && diaCritico.Incidencias > 0)
        {
            filas.Add(("#F79009", $"El día más crítico fue el {GxDiasNombre[(int)diaCritico.Fecha.DayOfWeek]} {diaCritico.Fecha:dd/MM}: {diaCritico.Incidencias} incidencias ({diaCritico.PorcentajeAsistencia:0.0}% de asistencia ese día)."));
        }

        var responsable = reporte.Incidencias.ResponsablesCriticos.FirstOrDefault();
        if (responsable is not null)
        {
            filas.Add(("#F04438", $"{ShortenName(responsable.Responsable, 40)} concentra {responsable.Incidencias} incidencias en {responsable.EmpleadosAfectados} de {responsable.EmpleadosACargo} empleados a su cargo."));
        }

        var cliente = reporte.Incidencias.IncidenciasPorCliente.FirstOrDefault(c => !string.Equals(c.Nombre, "Sin cliente", StringComparison.OrdinalIgnoreCase));
        if (cliente is not null)
        {
            filas.Add(("#F79009", $"El cliente {ShortenName(cliente.Nombre, 40)} acumula {cliente.Cantidad} incidencias ({cliente.Porcentaje:0.#}% del total)."));
        }

        if (k.FaltaAprobar > 0)
        {
            filas.Add(("#F79009", $"Hay {k.FaltaAprobar} registros FALTA APROBAR sin validar: mientras no se aprueben cuentan como falta y no suman horas."));
        }

        return filas;
    }

    private static void GxLectura(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var filas = GxConstruirLectura(reporte);

        container.Border(1).BorderColor(GxBorder).Padding(12).Column(column =>
        {
            column.Spacing(6);
            column.Item().Text("Lectura gerencial").Bold().FontSize(12).FontColor(GxNavy);
            foreach (var (color, texto) in filas)
            {
                column.Item().Row(row =>
                {
                    row.ConstantItem(12).PaddingTop(3).Height(7).Width(7).Background(color);
                    row.RelativeItem().Text(texto).FontSize(9.5f);
                });
            }
        });
    }

    private static void GxDecisiones(IContainer container, AsistenciaGerencialPdfDto reporte)
    {
        var acciones = reporte.Incidencias.RecomendacionesEjecutivas.Where(x => !string.IsNullOrWhiteSpace(x)).Take(5).ToList();

        container.Border(1).BorderColor(GxNavy).Padding(12).Column(column =>
        {
            column.Spacing(7);
            column.Item().Text("Decisiones sugeridas").Bold().FontSize(12).FontColor(GxNavy);

            if (acciones.Count == 0)
            {
                column.Item().Text("No hay acciones pendientes para este periodo.").FontSize(9.5f);
                return;
            }

            for (var i = 0; i < acciones.Count; i++)
            {
                var numero = i + 1;
                column.Item().Row(row =>
                {
                    row.ConstantItem(20).Height(16).Width(16).Background(GxNavy).AlignCenter().AlignMiddle()
                        .Text(numero.ToString(CultureInfo.InvariantCulture)).Bold().FontSize(9).FontColor(Colors.White);
                    row.RelativeItem().PaddingLeft(4).Text(acciones[i]).FontSize(9.5f);
                });
            }
        });
    }

    private static void GxComposicionEstados(IContainer container, IReadOnlyList<AsistenciaGerencialEstadoChartItemDto> items)
    {
        var top = items.OrderByDescending(i => i.Cantidad).ThenBy(i => i.Estado, StringComparer.OrdinalIgnoreCase).Take(8).ToList();
        var max = Math.Max(1, top.FirstOrDefault()?.Cantidad ?? 1);

        container.Border(1).BorderColor(GxBorder).Padding(12).Column(column =>
        {
            column.Spacing(5);
            column.Item().Text("Composición por estado").Bold().FontSize(12).FontColor(GxNavy);

            if (top.Count == 0)
            {
                column.Item().Text("Sin registros.").FontSize(9).FontColor(GxMuted);
                return;
            }

            foreach (var item in top)
            {
                var relleno = Math.Max(1, (int)Math.Round(item.Cantidad * 100d / max));
                var tone = GxTone(item.Semaforo);
                column.Item().Row(row =>
                {
                    row.Spacing(8);
                    row.ConstantItem(150).Text(ShortenName(item.Estado, 32)).FontSize(9);
                    row.RelativeItem().AlignMiddle().Height(10).Row(bar =>
                    {
                        bar.RelativeItem(relleno).Background(tone.Accent);
                        bar.RelativeItem(Math.Max(1, 100 - relleno)).Background("#E5E7EB");
                    });
                    row.ConstantItem(40).AlignRight().Text($"{item.Porcentaje:0.#}%").FontSize(9).FontColor(GxMuted);
                    row.ConstantItem(34).AlignRight().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(9).Bold();
                });
            }
        });
    }

    private static IContainer GxTh(IContainer container) =>
        container.Background(GxNavy).PaddingVertical(5).PaddingHorizontal(5)
            .DefaultTextStyle(x => x.FontSize(8).Bold().FontColor(Colors.White));

    private static IContainer GxTd(IContainer container, bool zebra) =>
        container.Background(zebra ? "#F8FAFC" : "#FFFFFF").BorderBottom(1).BorderColor("#E5E7EB").PaddingVertical(4).PaddingHorizontal(5)
            .DefaultTextStyle(x => x.FontSize(8).FontColor("#1F2937"));

    private static void GxVacio(IContainer container, string mensaje) =>
        container.Border(1).BorderColor(GxBorder).Padding(12).Text(mensaje).FontSize(9).FontColor(GxMuted);

    private static void GxTablaResponsables(IContainer container, IReadOnlyList<AsistenciaGerencialResponsableDto> items)
    {
        container.Column(column =>
        {
            column.Spacing(4);
            column.Item().Text("Responsables con más incidencias").Bold().FontSize(12).FontColor(GxNavy);
            column.Item().Text("Cada responsable debe validar las marcaciones de su equipo; las pendientes de aprobar cuentan como falta.").FontSize(8).FontColor(GxMuted);

            if (items.Count == 0)
            {
                column.Item().Element(c => GxVacio(c, "Sin incidencias por responsable en el periodo."));
                return;
            }

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(4);
                    c.ConstantColumn(52);
                    c.ConstantColumn(58);
                    c.ConstantColumn(52);
                    c.ConstantColumn(58);
                    c.ConstantColumn(58);
                });

                table.Header(h =>
                {
                    h.Cell().Element(GxTh).Text("Responsable");
                    h.Cell().Element(GxTh).AlignRight().Text("A cargo");
                    h.Cell().Element(GxTh).AlignRight().Text("Afectados");
                    h.Cell().Element(GxTh).AlignRight().Text("Incidencias");
                    h.Cell().Element(GxTh).AlignRight().Text("Pend. aprob.");
                    h.Cell().Element(GxTh).AlignRight().Text("Brecha (h)");
                });

                for (var i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    var zebra = i % 2 == 1;
                    table.Cell().Element(c => GxTd(c, zebra)).Text(ShortenName(item.Responsable, 38));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.EmpleadosACargo.ToString(CultureInfo.InvariantCulture));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.EmpleadosAfectados.ToString(CultureInfo.InvariantCulture));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(t => t.Span(item.Incidencias.ToString(CultureInfo.InvariantCulture)).Bold().FontColor("#B42318"));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.PendientesAprobacion == 0 ? "-" : item.PendientesAprobacion.ToString(CultureInfo.InvariantCulture));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.HorasEnBrecha == 0m ? "-" : item.HorasEnBrecha.ToString("0.##", CultureInfo.InvariantCulture));
                }
            });
        });
    }

    private static void GxTablaEmpleados(IContainer container, IReadOnlyList<AsistenciaGerencialEmpleadoCriticoDto> items)
    {
        container.Column(column =>
        {
            column.Spacing(4);
            column.Item().Text("Empleados críticos").Bold().FontSize(12).FontColor(GxNavy);
            column.Item().Text("Empleados con incidencias en el periodo, ordenados por cantidad. Revise los días indicados antes de decidir.").FontSize(8).FontColor(GxMuted);

            if (items.Count == 0)
            {
                column.Item().Element(c => GxVacio(c, "Ningún empleado registra incidencias críticas en el periodo."));
                return;
            }

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(3.2f);
                    c.RelativeColumn(2.4f);
                    c.ConstantColumn(34);
                    c.ConstantColumn(44);
                    c.ConstantColumn(40);
                    c.ConstantColumn(46);
                    c.RelativeColumn(2.4f);
                });

                table.Header(h =>
                {
                    h.Cell().Element(GxTh).Text("Empleado");
                    h.Cell().Element(GxTh).Text("Responsable");
                    h.Cell().Element(GxTh).AlignRight().Text("Falta");
                    h.Cell().Element(GxTh).AlignRight().Text("Incompl.");
                    h.Cell().Element(GxTh).AlignRight().Text("Pend.");
                    h.Cell().Element(GxTh).AlignRight().Text("Brecha (h)");
                    h.Cell().Element(GxTh).Text("Días con incidencia");
                });

                string Num(int value) => value == 0 ? "-" : value.ToString(CultureInfo.InvariantCulture);

                for (var i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    var zebra = i % 2 == 1;
                    table.Cell().Element(c => GxTd(c, zebra)).Text(t => t.Span(ShortenName(item.NombreEmpleado, 32)).SemiBold());
                    table.Cell().Element(c => GxTd(c, zebra)).Text(ShortenName(item.Responsable, 26));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(Num(item.Faltas));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(Num(item.Incompletos));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(Num(item.FaltaAprobar));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(t => t.Span(item.DiferenciaHoras.ToString("0.##", CultureInfo.InvariantCulture))
                        .FontColor(item.DiferenciaHoras < 0m ? "#B42318" : "#1F2937"));
                    table.Cell().Element(c => GxTd(c, zebra)).Text(item.DiasConIncidencia);
                }
            });
        });
    }

    private static void GxGraficoDiario(IContainer container, IReadOnlyList<AsistenciaGerencialTendenciaDiariaDto> dias)
    {
        container.Border(1).BorderColor(GxBorder).Padding(12).Column(column =>
        {
            column.Spacing(6);
            column.Item().Text("Incidencias por día").Bold().FontSize(12).FontColor(GxNavy);
            column.Item().Text("Altura = incidencias críticas del día. Debajo de cada barra: fecha y % de asistencia del día.").FontSize(8).FontColor(GxMuted);

            if (dias.Count == 0)
            {
                column.Item().Text("Sin datos diarios para el periodo.").FontSize(9).FontColor(GxMuted);
                return;
            }

            const float alturaMaxima = 90f;
            var max = Math.Max(1, dias.Max(d => d.Incidencias));

            column.Item().Row(row =>
            {
                row.Spacing(4);
                foreach (var dia in dias)
                {
                    var altura = dia.Incidencias == 0 ? 1.5f : Math.Max(4f, (float)dia.Incidencias / max * alturaMaxima);
                    var color = dia.PorcentajeAsistencia >= MetaAsistenciaGerencial ? "#12B76A" : dia.PorcentajeAsistencia >= 90m ? "#F79009" : "#F04438";

                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Height(alturaMaxima + 14f - altura).AlignBottom().AlignCenter()
                            .Text(dia.Incidencias.ToString(CultureInfo.InvariantCulture)).Bold().FontSize(8).FontColor("#1F2937");
                        col.Item().PaddingHorizontal(6).Height(altura).Background(color);
                        col.Item().PaddingTop(3).AlignCenter().Text($"{GxDiasCorto[(int)dia.Fecha.DayOfWeek]} {dia.Fecha:dd/MM}").FontSize(7.5f).SemiBold();
                        col.Item().AlignCenter().Text($"{dia.PorcentajeAsistencia:0}%").FontSize(7).FontColor(GxMuted);
                    });
                }
            });
        });
    }

    private static void GxRankingBarras(IContainer container, string title, IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> items, string color)
    {
        var top = items.Take(8).ToList();
        var max = Math.Max(1, top.FirstOrDefault()?.Cantidad ?? 1);

        container.Border(1).BorderColor(GxBorder).Padding(10).Column(column =>
        {
            column.Spacing(6);
            column.Item().Text(title).Bold().FontSize(11).FontColor(GxNavy);

            if (top.Count == 0)
            {
                column.Item().Text("Sin incidencias.").FontSize(9).FontColor(GxMuted);
                return;
            }

            foreach (var item in top)
            {
                var relleno = Math.Max(1, (int)Math.Round(item.Cantidad * 100d / max));
                column.Item().Column(block =>
                {
                    block.Spacing(2);
                    block.Item().Row(row =>
                    {
                        row.RelativeItem().Text(ShortenName(item.Nombre, 30)).FontSize(8.5f).SemiBold();
                        row.ConstantItem(26).AlignRight().Text(item.Cantidad.ToString(CultureInfo.InvariantCulture)).FontSize(8.5f).Bold();
                        row.ConstantItem(40).AlignRight().Text($"{item.Porcentaje:0.#}%").FontSize(8.5f).FontColor(GxMuted);
                    });
                    block.Item().Height(8).Row(row =>
                    {
                        row.RelativeItem(relleno).Background(color);
                        row.RelativeItem(Math.Max(1, 100 - relleno)).Background("#E5E7EB");
                    });
                });
            }
        });
    }

    private static void GxTablaPendientes(IContainer container, IReadOnlyList<AsistenciaGerencialPendienteAprobacionDto> items)
    {
        container.Column(column =>
        {
            column.Spacing(4);
            column.Item().Text("Pendientes de aprobación").Bold().FontSize(12).FontColor(GxNavy);
            column.Item().Text("Registros FALTA APROBAR: requieren validación del responsable; hasta entonces cuentan como falta.").FontSize(8).FontColor(GxMuted);

            if (items.Count == 0)
            {
                column.Item().Element(c => GxVacio(c, "No hay registros pendientes de aprobación."));
                return;
            }

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(3);
                    c.RelativeColumn(3);
                    c.ConstantColumn(62);
                    c.ConstantColumn(70);
                });

                table.Header(h =>
                {
                    h.Cell().Element(GxTh).Text("Empleado");
                    h.Cell().Element(GxTh).Text("Responsable");
                    h.Cell().Element(GxTh).AlignRight().Text("Pendientes");
                    h.Cell().Element(GxTh).AlignRight().Text("Horas por validar");
                });

                for (var i = 0; i < items.Count; i++)
                {
                    var item = items[i];
                    var zebra = i % 2 == 1;
                    table.Cell().Element(c => GxTd(c, zebra)).Text(ShortenName(item.NombreEmpleado, 36));
                    table.Cell().Element(c => GxTd(c, zebra)).Text(ShortenName(item.Responsable, 36));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.CantidadPendientes.ToString(CultureInfo.InvariantCulture));
                    table.Cell().Element(c => GxTd(c, zebra)).AlignRight().Text(item.HorasPendientes.ToString("0.##", CultureInfo.InvariantCulture));
                }
            });
        });
    }

    private static void GxNotaMetodologica(IContainer container)
    {
        container.Background("#F8FAFC").Border(1).BorderColor(GxBorder).Padding(10).Column(column =>
        {
            column.Spacing(2);
            column.Item().Text("Cómo leer este reporte").Bold().FontSize(9).FontColor(GxNavy);
            column.Item().Text("• Incidencia crítica: registro con estado FALTA, FALTA APROBAR, INCOMPLETO o RECHAZADO.").FontSize(8).FontColor(GxMuted);
            column.Item().Text($"• Asistencia efectiva = registros sin incidencia crítica / total de registros; meta {MetaAsistenciaGerencial:0}%. Los registros de sábado, domingo y feriado no se cuentan como incidencia.").FontSize(8).FontColor(GxMuted);
            column.Item().Text("• Brecha (h): diferencia negativa entre las horas registradas y las laborales del periodo. Periodo anterior: mismo número de días inmediatamente previos.").FontSize(8).FontColor(GxMuted);
        });
    }
}
