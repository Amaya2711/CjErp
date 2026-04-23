import httpClient from "../../../api/httpClient";

export interface LoginRequest {
  idUsuario: string;
  clave: string;
}

export interface LoginResponse {
  token: string;
  idUsuario: string;
  nombreEmpleado?: string;
  correo?: string;
  codEmp?: number | null;
  codVal?: number | null;
  cuadrilla?: number | null;
  expiration?: string;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return await httpClient.post<LoginResponse>("/auth/login", payload);
}
