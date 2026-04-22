import type { EmpleadoCta } from '../models/empleadoCta';

export async function listarEmpleadosCta(): Promise<EmpleadoCta[]> {
  const response = await fetch('/api/empleado/cta/listar');
  if (!response.ok) throw new Error('Error al cargar empleados');
  const json = await response.json();
  // Si la respuesta es { data: [...] }, devolver json.data; si es array, devolver json
  return Array.isArray(json) ? json : json.data;
}
