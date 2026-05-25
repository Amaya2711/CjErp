import httpClient from "../../../api/httpClient";

export interface LoginRequest {
  idUsuario: string;
  clave: string;
}

export interface LoginResponse {
  token: string;
  sessionId?: string;
  idUsuario: string;
  nombreEmpleado?: string;
  correo?: string;
  codEmp?: number | null;
  idEmpleado?: number | null;
  idCargo?: number | null;
  codVal?: number | null;
  cuadrilla?: number | null;
  expiration?: string;
  IdPerfil?: number | null;
  IdRol?: number | null;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return await httpClient.post<LoginResponse>("/auth/login", payload);
}

export async function logout(): Promise<void> {
  await httpClient.post("/auth/logout");
}

export function sendLogoutBeacon(token: string) {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  const apiBaseUrl =
    configuredApiUrl || (import.meta.env.DEV ? "http://localhost:5015/api" : "/api");

  const beaconUrl = `${apiBaseUrl}/auth/logout-beacon`;
  const payload = JSON.stringify({ token });
  const blob = new Blob([payload], { type: "application/json" });

  navigator.sendBeacon(beaconUrl, blob);
}
