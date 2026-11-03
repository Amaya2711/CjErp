// CJ Intelligence: latido del bloqueo de un turno durante llamadas largas (OpenAI hasta 90 s por llamada, hasta
// 4 llamadas, mas SQL). Renueva el bloqueo cada ~TTL/3 mientras el turno sigue en curso.
//
// Reglas:
// - Renovar devuelve false (otra solicitud tomo el relevo o el bloqueo ya expiro) => se pierde el bloqueo: se cancela
//   el Token (para abortar la llamada en curso a OpenAI/SQL) y el turno NO debe escribir nada mas.
// - Un fallo de renovacion (SQL caido) se tolera UNA vez; dos seguidos se tratan como bloqueo perdido (fail-closed).
// - Ante la duda, perder el bloqueo es seguro: el procedimiento de escritura lo vuelve a verificar en SQL (51050).
// - Quien escribe debe llamar ThrowIfLost() antes de cada escritura, ademas del control en SQL.
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public sealed class CjIntelligenceLockLostException : Exception
{
    public CjIntelligenceLockLostException()
        : base("La solicitud perdio el bloqueo de la conversacion: no puede guardar mensajes ni resultados.")
    {
    }
}

public sealed class CjIntelligenceTurnLease : IAsyncDisposable
{
    public const int MaxConsecutiveRenewFailures = 2;

    private readonly Func<CancellationToken, Task<bool>> _renew;
    private readonly TimeSpan _interval;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;
    private readonly ILogger? _logger;
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;
    private int _lost;

    /// <param name="renew">Renueva el bloqueo; true = sigue siendo propietaria, false = lo perdio.</param>
    /// <param name="interval">Cada cuanto renovar; usar TTL/3.</param>
    public CjIntelligenceTurnLease(
        Func<CancellationToken, Task<bool>> renew,
        TimeSpan interval,
        ILogger? logger = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        if (interval <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(interval));
        }

        _renew = renew;
        _interval = interval;
        _logger = logger;
        _delay = delay ?? Task.Delay;
    }

    /// <summary>Se cancela cuando se pierde el bloqueo, se cancela la solicitud externa o se libera el latido.</summary>
    public CancellationToken Token => _cts.Token;

    public bool Lost => Volatile.Read(ref _lost) == 1;

    /// <summary>Numero de renovaciones exitosas (para pruebas y metricas).</summary>
    public int Renewals { get; private set; }

    public void Start(CancellationToken external = default)
    {
        if (_loop is not null)
        {
            throw new InvalidOperationException("El latido ya se inicio.");
        }

        var linked = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, external);
        _loop = Task.Run(() => LoopAsync(linked.Token));
    }

    public void ThrowIfLost()
    {
        if (Lost)
        {
            throw new CjIntelligenceLockLostException();
        }
    }

    private async Task LoopAsync(CancellationToken token)
    {
        var failures = 0;
        try
        {
            while (!token.IsCancellationRequested)
            {
                await _delay(_interval, token);

                bool stillOwner;
                try
                {
                    stillOwner = await _renew(token);
                    failures = 0;
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    failures++;
                    _logger?.LogWarning(ex, "CJ Intelligence: fallo al renovar el bloqueo ({Failures}/{Max}).", failures, MaxConsecutiveRenewFailures);
                    if (failures < MaxConsecutiveRenewFailures)
                    {
                        continue;
                    }

                    stillOwner = false;
                }

                if (!stillOwner)
                {
                    MarkLost();
                    return;
                }

                Renewals++;
            }
        }
        catch (OperationCanceledException)
        {
            // liberacion o cancelacion externa: no es perdida del bloqueo
        }
    }

    private void MarkLost()
    {
        Interlocked.Exchange(ref _lost, 1);
        _logger?.LogWarning("CJ Intelligence: bloqueo de la conversacion perdido; se cancela el turno.");
        _cts.Cancel();
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_loop is not null)
        {
            try
            {
                await _loop;
            }
            catch (OperationCanceledException)
            {
            }
        }

        _cts.Dispose();
    }
}
