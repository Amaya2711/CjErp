import { useState, useEffect } from "react";

interface CrudApi<T, TPayload = Partial<T>> {
  list: () => Promise<T[]>;
  create: (payload: TPayload) => Promise<T>;
  update: (id: number, payload: TPayload) => Promise<T>;
  remove: (id: number) => Promise<void>;
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
    } catch (err: any) {
      setError(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (mode === "nuevo") {
        await api.create(form);
        setMessage("Registro creado correctamente");
      } else if (mode === "editar" && (form as any).id) {
        await api.update((form as any).id, form);
        setMessage("Registro actualizado correctamente");
      }
      setPanelOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message || "Error al guardar");
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
    } catch (err: any) {
      setError(err.message || "Error al eliminar");
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
