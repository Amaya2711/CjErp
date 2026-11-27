/** Aviso de por qué terminó la sesión; la pantalla de login lo muestra una sola vez. */
let notice = "";

export function setSessionNotice(message: string) {
  notice = message;
}

export function consumeSessionNotice(): string {
  const m = notice;
  notice = "";
  return m;
}
