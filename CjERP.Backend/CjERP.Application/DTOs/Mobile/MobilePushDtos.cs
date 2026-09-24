namespace CjERP.Application.DTOs.Mobile;

public sealed class MobilePushDispatchResultDto
{
    public int Evaluados { get; set; }
    public int Enviados { get; set; }
    public int Errores { get; set; }
    public int TokensInvalidos { get; set; }
    public bool Habilitado { get; set; }
}
