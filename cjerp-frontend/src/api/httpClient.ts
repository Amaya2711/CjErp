import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { getAuthUser, clearAuthUser } from "../utils/authStorage";
import { isJwtExpired } from "../utils/jwt";

type HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

export const API_BASE_URL =
  import.meta.env.DEV ? "https://localhost:7130/api" : "https://cj-erp.vercel.app/";


const axiosClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

axiosClient.interceptors.request.use((config) => {
  const requestUrl = config.url?.toLowerCase() ?? "";

  if (requestUrl.includes("/auth/login")) {
    return config;
  }

  const authUser = getAuthUser();

  if (authUser?.token) {
    if (isJwtExpired(authUser.token)) {
      clearAuthUser();
      window.location.replace("/");
      return Promise.reject(new axios.CanceledError("JWT expirado."));
    }

    config.headers.Authorization = `Bearer ${authUser.token}`;
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => {
    const data = response?.data;

    if (data && typeof data === "object") {
      const payload = data as {
        success?: boolean;
        message?: string;
        data?: unknown;
      };

      if (typeof payload.success === "boolean") {
        if (payload.success === false) {
          return Promise.reject(new Error(payload.message || "La operacion no fue completada por el servidor."));
        }

        if ("data" in payload) {
          return payload.data;
        }

        return data;
      }

      if ("data" in payload) {
        return payload.data;
      }
    }

    return data;
  },
  (error) => {
    if (error?.response?.data) {
      console.error("[httpClient] Error response", error.response.data);
    }

    if (error?.response?.status === 401) {
      clearAuthUser();
      window.location.replace("/");
    }

    return Promise.reject(error);
  }
);

const httpClient: HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.get(url, config) as unknown as Promise<T>;
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.post(url, data, config) as unknown as Promise<T>;
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.put(url, data, config) as unknown as Promise<T>;
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.delete(url, config) as unknown as Promise<T>;
  },
};

export default httpClient;
