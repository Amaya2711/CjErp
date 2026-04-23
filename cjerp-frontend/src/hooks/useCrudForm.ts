import { useState, useEffect } from "react";
import { getHttpErrorMessage } from "../utils/httpError";

interface CrudApi<T, TPayload = Partial<T>> {
  list: () => Promise<T[]>;
  create: (payload: TPayload) => Promise<unknown>;
  update: (id: number, payload: TPayload) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
}

export function useCrudForm<T, TPayload = Partial<T>>(
  api: CrudApi<T, TPayload>,
  initialForm: TPayload
) {
  const [items, setItems] = useState<T[]>([]);
  const [form, setForm] = useState<TPayload>(initialForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<"nuevo" | "editar">("nuevo");
  const [idToDelete, setIdToDelete] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.list();
      setItems(data);
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "Error al cargar datos"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (mode === "nuevo") {
        await api.create(form);
        setMessage("Registro creado correctamente");
      } else if (mode === "editar" && (form as { id?: number | null }).id) {
        await api.update((form as { id?: number | null }).id as number, form);
        setMessage("Registro actualizado correctamente");
      }
      setPanelOpen(false);
      await load();
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError("");
    setMessage("");
    try {
      await api.remove(id);
      setMessage("Registro eliminado correctamente");
      await load();
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "Error al eliminar"));
    }
  };

  return {
    items,
    form,
    setForm,
    loading,
    saving,
    error,
    message,
    panelOpen,
    setPanelOpen,
    mode,
    setMode,
    idToDelete,
    setIdToDelete,
    handleSave,
    handleDelete,
    load,
  };
}
