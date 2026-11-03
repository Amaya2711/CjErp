using Xunit;

namespace CjERP.Backend.Tests.Integration;

// Compuertas de las pruebas de integracion. TODAS se OMITEN por defecto. Tres categorias SEPARADAS (xUnit Trait "Category"):
//   SqlIntegration - persistencia y permisos contra SQL Server (JC_Db) con la conexion de cj_ia. ESCRIBE filas de prueba.
//   PagosReal      - UNA consulta real de pagos bajo cj_ia (equivale al script 24). Exige AUTORIZACION APARTE de SqlIntegration.
//   OpenAiLive     - llamadas REALES a OpenAI (costo y red). Exige clave y activacion propias.
// Activacion (variables de entorno; NO se guardan claves en archivos):
//   SqlIntegration: CJ_SQL_INTEGRATION=1, ConnectionStrings__CjIntelligence (usuario cj_ia), CJ_TEST_USER_A, CJ_TEST_USER_B
//   PagosReal:      lo anterior + CJ_SQL_PAGOS_REAL=1, CJ_TEST_USER_PROPIO, CJ_PAGOS_FECHA (yyyy-MM-dd)
//   SqlConcurrency: lo de SqlIntegration + CJ_SQL_CONCURRENCY=1 + ConnectionStrings__CjIntelligenceAdmin (administrador). Dos sesiones y un
//                   bloqueo breve (segundos) sobre tablas NUEVAS de CJ Intelligence, para forzar la intercalacion entre validar y escribir.
//   SqlIdentity:    lo de SqlIntegration + CJ_SQL_IDENTITY=1 + ConnectionStrings__CjIntelligenceAdmin. Altera la huella de la identidad que crea la propia prueba
//                   y ejecuta sp_IA_Cj_Identidad_Resolver (solo administrador). CJ_TEST_USER_A debe ser un usuario SIN uso previo del modulo.
//   OpenAiLive:     OPENAI_LIVE_TESTS=1, OPENAI_API_KEY (y opcional OPENAI_MODEL)
internal static class Gates
{
    public static string? Env(string name) => Environment.GetEnvironmentVariable(name) is { Length: > 0 } v ? v : null;

    public static bool Flag(string name) => Env(name) == "1";

    public static string? SqlSkip() =>
        !Flag("CJ_SQL_INTEGRATION") ? "Prueba de integracion SQL omitida: defina CJ_SQL_INTEGRATION=1 (requiere autorizacion y scripts 18-20c aplicados)."
        : Env("ConnectionStrings__CjIntelligence") is null ? "Falta ConnectionStrings__CjIntelligence (usuario cj_ia)."
        : Env("CJ_TEST_USER_A") is null || Env("CJ_TEST_USER_B") is null ? "Faltan CJ_TEST_USER_A y CJ_TEST_USER_B."
        : null;

    public static string? PagosSkip() =>
        SqlSkip()
        ?? (!Flag("CJ_SQL_PAGOS_REAL") ? "Consulta real de pagos omitida: defina CJ_SQL_PAGOS_REAL=1 (autorizacion expresa de consultas de pagos)."
            : Env("CJ_TEST_USER_PROPIO") is null || Env("CJ_PAGOS_FECHA") is null ? "Faltan CJ_TEST_USER_PROPIO y CJ_PAGOS_FECHA."
            : null);

    public static string? ConcurrencySkip() =>
        SqlSkip()
        ?? (!Flag("CJ_SQL_CONCURRENCY") ? "Prueba de concurrencia omitida: defina CJ_SQL_CONCURRENCY=1 (retiene un bloqueo de tabla unos segundos en las tablas nuevas de CJ Intelligence)."
            : Env("ConnectionStrings__CjIntelligenceAdmin") is null ? "Falta ConnectionStrings__CjIntelligenceAdmin (conexion de administrador solo para retener el bloqueo)."
            : null);

    public static string? IdentitySkip() =>
        SqlSkip()
        ?? (!Flag("CJ_SQL_IDENTITY") ? "Prueba de identidad omitida: defina CJ_SQL_IDENTITY=1 (escribe conversaciones e identidades de prueba y ejecuta Resolver como administrador)."
            : Env("ConnectionStrings__CjIntelligenceAdmin") is null ? "Falta ConnectionStrings__CjIntelligenceAdmin (conexion de administrador)."
            : null);

    public static string? OpenAiSkip() =>
        !Flag("OPENAI_LIVE_TESTS") ? "Llamada real a OpenAI omitida: defina OPENAI_LIVE_TESTS=1."
        : Env("OPENAI_API_KEY") is null ? "Falta OPENAI_API_KEY."
        : null;
}

public sealed class SqlIntegrationFactAttribute : FactAttribute
{
    public SqlIntegrationFactAttribute() => Skip = Gates.SqlSkip();
}

public sealed class PagosRealFactAttribute : FactAttribute
{
    public PagosRealFactAttribute() => Skip = Gates.PagosSkip();
}

public sealed class SqlConcurrencyTheoryAttribute : TheoryAttribute
{
    public SqlConcurrencyTheoryAttribute() => Skip = Gates.ConcurrencySkip();
}

public sealed class SqlIdentityFactAttribute : FactAttribute
{
    public SqlIdentityFactAttribute() => Skip = Gates.IdentitySkip();
}

public sealed class OpenAiLiveFactAttribute : FactAttribute
{
    public OpenAiLiveFactAttribute() => Skip = Gates.OpenAiSkip();
}
