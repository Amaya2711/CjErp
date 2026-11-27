import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { consumeSessionNotice, getErrorMessage, getHttpStatus, useSession } from "@cjerp/shared";

/** La clave del backend admite como máximo 10 caracteres (parámetro @pClave NVARCHAR(10) de sp_ValidarUsuario). */
const CLAVE_MAX = 10;
const USUARIO_KEY = "cjerp.mobile.logistica.ultimoUsuario";

function leerUltimoUsuario(): string {
  try {
    return localStorage.getItem(USUARIO_KEY) ?? "";
  } catch {
    return "";
  }
}

function guardarUltimoUsuario(usuario: string) {
  try {
    localStorage.setItem(USUARIO_KEY, usuario);
  } catch {
    /* sin almacenamiento */
  }
}

export default function LoginPage() {
  const { user, loading, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [idUsuario, setIdUsuario] = useState(leerUltimoUsuario);
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [tocado, setTocado] = useState({ usuario: false, clave: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Aviso de por qué terminó la sesión anterior (inactividad, otro dispositivo…); se lee una sola vez.
  const aviso = useMemo(() => consumeSessionNotice(), []);

  const destino = (location.state as { from?: string } | null)?.from || "/";

  const errUsuario = idUsuario.trim() ? "" : "Ingrese su usuario.";
  const errClave = !clave ? "Ingrese su clave." : clave.length > CLAVE_MAX ? `La clave admite hasta ${CLAVE_MAX} caracteres.` : "";

  // No redirigir mientras el login está en curso.
  if (!loading && user && !busy) return <Navigate to={destino} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTocado({ usuario: true, clave: true });
    setError("");
    if (errUsuario || errClave) return;

    setBusy(true);
    try {
      // El backend valida credenciales (401) y, antes de crear la sesión, que el usuario esté activo, que su cargo esté permitido para
      // esta app y que tenga un rol de esta app (403 con el motivo). La app no decide nada de eso.
      try {
        await login(idUsuario, clave);
      } catch (err) {
        const estado = getHttpStatus(err);
        setError(
          estado === 401
            ? "Usuario o contraseña incorrectos."
            : estado === 403
              ? getErrorMessage(err, "No tiene acceso a esta aplicación.")
              : getErrorMessage(err, "No se pudo iniciar sesión."),
        );
        return;
      }

      guardarUltimoUsuario(idUsuario.trim());
      navigate(destino, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <div className="login">
        <div className="marca">
          <span className="logo" aria-hidden="true">CJ</span>
          <h1>CJ Despachos</h1>
          <p>Logística · Almacén</p>
        </div>

        <form className="card" onSubmit={onSubmit} noValidate>
          {aviso && <p className="aviso" role="status">{aviso}</p>}

          <label>
            Usuario
            <input
              value={idUsuario}
              onChange={(e) => setIdUsuario(e.target.value)}
              onBlur={() => setTocado((t) => ({ ...t, usuario: true }))}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              inputMode="text"
              aria-invalid={tocado.usuario && !!errUsuario}
              disabled={busy}
            />
            {tocado.usuario && errUsuario && <small className="campo-error">{errUsuario}</small>}
          </label>

          <label>
            Clave
            <span className="clave">
              <input
                type={verClave ? "text" : "password"}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onBlur={() => setTocado((t) => ({ ...t, clave: true }))}
                autoComplete="current-password"
                autoCapitalize="none"
                maxLength={CLAVE_MAX + 5}
                aria-invalid={tocado.clave && !!errClave}
                disabled={busy}
              />
              <button type="button" className="sec ver" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? "Ocultar clave" : "Mostrar clave"} disabled={busy}>
                {verClave ? "Ocultar" : "Ver"}
              </button>
            </span>
            {tocado.clave && errClave && <small className="campo-error">{errClave}</small>}
          </label>

          {error && <p className="error" role="alert">{error}</p>}

          <button type="submit" disabled={busy}>
            {busy ? "Verificando…" : "Ingresar"}
          </button>
        </form>

        {import.meta.env.DEV && <small className="entorno">Entorno de desarrollo</small>}
      </div>
    </main>
  );
}
