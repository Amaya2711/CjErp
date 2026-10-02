// Extraido de IaChatService.cs (fila 1.6 de la tabla original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. [D-6] Sin agregar
// validaciones nuevas en este paso (limite de tamaño, magic bytes, cantidad por conversacion): esa
// tarea de hardening queda pendiente como tarea aparte, fuera de este refactor.
using CjERP.Application.DTOs.IaChat;

using static CjERP.Infrastructure.Services.IaTextUtils;

namespace CjERP.Infrastructure.Services;

internal static class IaAttachmentValidator
{
    internal static IaChatImageAttachmentDto? NormalizeAttachment(IaChatImageAttachmentDto? attachment)
    {
        if (attachment is null)
        {
            return null;
        }

        var mimeType = NormalizeText(attachment.MimeType);
        if (string.IsNullOrWhiteSpace(mimeType) ||
            (!mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) &&
             !mimeType.Equals("image/png", StringComparison.OrdinalIgnoreCase) &&
             !mimeType.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase) &&
             !mimeType.Equals("image/webp", StringComparison.OrdinalIgnoreCase) &&
             !mimeType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase)))
        {
            return null;
        }

        var base64Data = NormalizeText(attachment.Base64Data);
        if (string.IsNullOrWhiteSpace(base64Data))
        {
            return null;
        }

        return new IaChatImageAttachmentDto
        {
            FileName = NormalizeText(attachment.FileName),
            MimeType = mimeType,
            Base64Data = base64Data
        };
    }

    internal static bool HasPdfAttachment(IaChatImageAttachmentDto? attachment)
    {
        return attachment is not null &&
               string.Equals(attachment.MimeType, "application/pdf", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool ShouldPreferStructuredAttachmentResponse(string question, string? presentationMode)
    {
        var normalizedQuestion = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var normalizedMode = NormalizeText(presentationMode)?.ToLowerInvariant();

        if (normalizedMode is "executive" or "detail")
        {
            return true;
        }

        var structuredTokens = new[]
        {
            "formato",
            "presentacion",
            "presentación",
            "ejecutivo",
            "reunion",
            "reunión",
            "directorio",
            "avance",
            "resumen",
            "cuadro",
            "reporte",
            "grafico",
            "gráfico"
        };

        return structuredTokens.Any(token => normalizedQuestion.Contains(token, StringComparison.OrdinalIgnoreCase));
    }

    internal static string GetAttachmentPromptInstruction(bool isPdfAttachment, bool prefersStructuredAttachmentResponse)
    {
        if (!prefersStructuredAttachmentResponse)
        {
            return isPdfAttachment
                ? "El PDF adjunto es solo contexto de referencia."
                : "La imagen adjunta es solo contexto de referencia.";
        }

        return isPdfAttachment
            ? "Como hay un PDF adjunto y se requiere una salida ejecutiva, responde exclusivamente con JSON valido compatible con IaChatResponseDto y prioriza tabla/resumen/top 5."
            : "Como hay una imagen adjunta y se requiere una salida ejecutiva, responde exclusivamente con JSON valido compatible con IaChatResponseDto y prioriza tabla/resumen/top 5.";
    }
}
