import React, { useState, useRef, useEffect } from "react";
import type {
  FiltroOperativoLookupProps,
  FiltroOperativoValue,
  TareaOption,
} from "../../models/filtroOperativo";
import { useFiltroOperativoLookup } from "../../hooks/useFiltroOperativoLookup";

export const FiltroOperativoLookup: React.FC<FiltroOperativoLookupProps> = ({
  value,
  onChange,
}) => {
  const safeValue: FiltroOperativoValue = value ?? {};
  const safeOnChange = onChange ?? (() => {});
  const trabajoSelectRef = useRef<HTMLSelectElement>(null);

  const {
    filtros,
    tipoTrabajos,
    ots,
    tareas,
    handleFiltroChange,
    handleTipoTrabajoChange,
    handleOtChange,
    handleTareaChange,
  } = useFiltroOperativoLookup(safeValue, safeOnChange);

  const filtrosSafe = Array.isArray(filtros) ? filtros : [];
  const tipoTrabajosSafe = Array.isArray(tipoTrabajos) ? tipoTrabajos : [];
  const otsSafe = Array.isArray(ots) ? ots : [];
  const tareasSafe = Array.isArray(tareas) ? tareas : [];

  const spanRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState<number>(250);

  const maxFiltroLabel = filtrosSafe.reduce((max: string, f) => {
    const label = `${f.nombreCliente} - ${f.nombreProyecto} - ${f.nombreSite} - ${f.nroInterno}`;
    return label.length > max.length ? label : max;
  }, "Seleccione...");

  useEffect(() => {
    if (spanRef.current) {
      setInputWidth(spanRef.current.offsetWidth + 32);
    }
  }, [maxFiltroLabel, filtrosSafe.length]);

  const [filtroInput, setFiltroInput] = useState(() => {
    if (safeValue?.filtro?.filtroKey) {
      const filtroKey = safeValue.filtro.filtroKey;
      const filtro = filtrosSafe.find((f) => f.filtroKey === filtroKey);
      return filtro
        ? `${filtro.nombreCliente} - ${filtro.nombreProyecto} - ${filtro.nombreSite} - ${filtro.nroInterno}`
        : "";
    }
    return "";
  });

  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const filteredFiltros =
    filtroInput.trim() === ""
      ? filtrosSafe
      : filtrosSafe.filter((f) => {
          const label =
            `${f.nombreCliente} - ${f.nombreProyecto} - ${f.nombreSite} - ${f.nroInterno}`.toLowerCase();
          const palabras = filtroInput.toLowerCase().split(/\s+/).filter(Boolean);
          return palabras.every((palabra) => label.includes(palabra));
        });

  useEffect(() => {
    setHighlightedIdx(filteredFiltros.length > 0 ? 0 : -1);
  }, [filtroInput, filteredFiltros.length]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: 600,
        fontSize: "13px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 40,
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ whiteSpace: "nowrap" }}>Filtro</label>
          <input
            style={{
              width: inputWidth,
              minWidth: 120,
              fontSize: "13px",
              fontFamily: "Arial, sans-serif",
            }}
            type="text"
            value={filtroInput}
            onChange={(e) => {
              setFiltroInput(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={(e) => {
              if (filteredFiltros.length > 0) setShowDropdown(true);
              if (filtroInput) {
                e.target.select();
              }
            }}
            onKeyDown={(e) => {
              if (filteredFiltros.length === 0) return;

              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIdx((idx) => Math.min(idx + 1, filteredFiltros.length - 1));
                setShowDropdown(true);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIdx((idx) => Math.max(idx - 1, 0));
                setShowDropdown(true);
              } else if (e.key === "Enter") {
                if (highlightedIdx >= 0 && highlightedIdx < filteredFiltros.length) {
                  const f = filteredFiltros[highlightedIdx];
                  const label = `${f.nombreCliente} - ${f.nombreProyecto} - ${f.nombreSite} - ${f.nroInterno}`;
                  setFiltroInput(label);
                  handleFiltroChange(f.filtroKey);
                  setShowDropdown(false);
                }
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                setShowDropdown(false);

                const selected = filtrosSafe.find(
                  (f) =>
                    `${f.nombreCliente} - ${f.nombreProyecto} - ${f.nombreSite} - ${f.nroInterno}`.toLowerCase() ===
                    filtroInput.toLowerCase()
                );

                handleFiltroChange(selected ? selected.filtroKey : "");

                if (trabajoSelectRef.current) {
                  trabajoSelectRef.current.focus();
                }
              }, 100);
            }}
            placeholder="Seleccione..."
            autoComplete="off"
          />

          <span
            ref={spanRef}
            style={{
              position: "absolute",
              visibility: "hidden",
              whiteSpace: "pre",
              fontSize: "17px",
              fontFamily: "inherit",
              fontWeight: "normal",
              padding: "6px 12px",
            }}
          >
            {maxFiltroLabel}
          </span>

          {showDropdown && filtroInput && filteredFiltros.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "#fff",
                border: "1px solid #ccc",
                zIndex: 1002,
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {filteredFiltros.map((f, idx) => {
                const label = `${f.nombreCliente} - ${f.nombreProyecto} - ${f.nombreSite} - ${f.nroInterno}`;
                const isHighlighted = idx === highlightedIdx;

                return (
                  <div
                    key={f.filtroKey + "-" + idx}
                    style={{
                      padding: 6,
                      cursor: "pointer",
                      background: isHighlighted ? "#e6f7ff" : undefined,
                    }}
                    onMouseDown={() => {
                      setFiltroInput(label);
                      handleFiltroChange(f.filtroKey);
                      setShowDropdown(false);
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ whiteSpace: "nowrap" }}>Trabajo</label>
            <select
              ref={trabajoSelectRef}
              onChange={(e) => handleTipoTrabajoChange(e.target.value)}
              value={safeValue?.tipoTrabajo?.tipoTrabajo || ""}
              style={{ fontSize: "13px", fontFamily: "Arial, sans-serif" }}
            >
              <option value="">Seleccione...</option>
              {tipoTrabajosSafe.map((t, idx) => (
                <option key={t.tipoTrabajo + "-" + idx} value={t.tipoTrabajo}>
                  {t.tipoTrabajo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ whiteSpace: "nowrap" }}>OT</label>
          <select
            onChange={(e) => handleOtChange(e.target.value)}
            value={safeValue?.ot?.ot || ""}
            style={{ fontSize: "13px", fontFamily: "Arial, sans-serif" }}
          >
            <option value="">Seleccione...</option>
            {otsSafe.map((o, idx) => (
              <option key={o.ot + "-" + idx} value={o.ot}>
                {o.ot} - {o.fecAsignacion ? new Date(o.fecAsignacion).toLocaleDateString() : ""}
              </option>
            ))}
          </select>
        </div>

        <TareaAutocomplete
          value={safeValue}
          tareas={tareasSafe}
          handleTareaChange={handleTareaChange}
        />
      </div>
    </div>
  );
};

type TareaAutocompleteProps = {
  value?: FiltroOperativoValue;
  tareas: TareaOption[];
  handleTareaChange: (correlativo: number | null) => void;
};

function TareaAutocomplete({
  value,
  tareas,
  handleTareaChange,
}: TareaAutocompleteProps) {
  const tareasSafe = Array.isArray(tareas) ? tareas : [];

  const [tareaInput, setTareaInput] = useState(() => {
    if (value?.tarea?.correlativo) {
      const tareaSel = tareasSafe.find(
        (t) => t.correlativo === value.tarea?.correlativo
      );
      return tareaSel ? tareaSel.tarea : "";
    }
    return "";
  });

  const [tareaDropdown, setTareaDropdown] = useState(false);
  const [tareaHighlight, setTareaHighlight] = useState(-1);

  const tareasFiltradas =
    tareaInput.trim() === ""
      ? tareasSafe
      : tareasSafe.filter((t) => {
          const label = t.tarea.toLowerCase();
          const palabras = tareaInput.toLowerCase().split(/\s+/).filter(Boolean);
          return palabras.every((p) => label.includes(p));
        });

  useEffect(() => {
    setTareaHighlight(tareasFiltradas.length > 0 ? 0 : -1);
  }, [tareaInput, tareasFiltradas.length]);

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <label style={{ whiteSpace: "nowrap" }}>Tarea</label>

      <input
        style={{
          minWidth: 250,
          width: 350,
          fontSize: "13px",
          fontFamily: "Arial, sans-serif",
        }}
        type="text"
        value={tareaInput}
        onChange={(e) => {
          setTareaInput(e.target.value);
          setTareaDropdown(true);
        }}
        onFocus={() => {
          if (tareasFiltradas.length > 0) setTareaDropdown(true);
        }}
        onKeyDown={(e) => {
          if (tareasFiltradas.length === 0) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setTareaHighlight((idx) => Math.min(idx + 1, tareasFiltradas.length - 1));
            setTareaDropdown(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setTareaHighlight((idx) => Math.max(idx - 1, 0));
            setTareaDropdown(true);
          } else if (e.key === "Enter") {
            if (tareaHighlight >= 0 && tareaHighlight < tareasFiltradas.length) {
              const t = tareasFiltradas[tareaHighlight];
              setTareaInput(t.tarea);
              handleTareaChange(t.correlativo);
              setTareaDropdown(false);
            }
          }
        }}
        onBlur={() => {
          setTimeout(() => setTareaDropdown(false), 100);

          const tSel = tareasSafe.find(
            (t) => t.tarea.toLowerCase() === tareaInput.toLowerCase()
          );
          handleTareaChange(tSel ? tSel.correlativo : null);
        }}
        placeholder="Seleccione..."
        autoComplete="off"
      />

      {tareaDropdown && tareaInput && tareasFiltradas.length > 0 && (
        <div
          style={{
            fontSize: "13px",
            fontFamily: "Arial, sans-serif",
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 10,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {tareasFiltradas.map((t, idx) => (
            <div
              key={String(t.correlativo) + "-" + idx}
              style={{
                padding: 6,
                cursor: "pointer",
                background: idx === tareaHighlight ? "#e6f7ff" : undefined,
              }}
              onMouseDown={() => {
                setTareaInput(t.tarea);
                handleTareaChange(t.correlativo);
                setTareaDropdown(false);
              }}
            >
              {t.tarea}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}