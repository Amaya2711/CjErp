import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  crearContratoArrendamientos,
  crearVersionContratoArrendamientos,
  listarArrendadoresArrendamientos,
  listarContratosArrendamientos,
  listarInmueblesArrendamientos,
  listarInquilinosArrendamientos,
  listarUnidadesArrendamientos,
} from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosCrudPage from "../components/ArrendamientosCrudPage";
import SidePanelForm from "../../../components/base/SidePanelForm";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

type ContratoForm = {
  id: number | null;
  codigoContrato: string;
  idArrendador: string;
  idInquilino: string;
  idInmueble: string;
  idUnidadPrincipal: string;
  fechaFirma: string;
  fechaInicio: string;
  fechaFin: string;
  moneda: string;
  monedaAlquiler: string;
  monedaMantenimiento: string;
  monedaCochera: string;
  monedaGarantia: string;
  importeAlquiler: string;
  periodicidadAlquiler: string;
  diaLimitePago: string;
  diasGracia: string;
  importeMantenimiento: string;
  periodicidadMantenimiento: string;
  diaLimiteMantenimiento: string;
  importeCochera: string;
  periodicidadCochera: string;
  diaLimiteCochera: string;
  garantiaPactada: string;
  garantiaPagada: string;
  garantiaPendiente: string;
  tipoReajuste: string;
  porcentajeReajuste: string;
  formulaReajuste: string;
  frecuenciaReajuste: string;
  penalidadMora: string;
  interesMoratorio: string;
  estadoContrato: string;
  observaciones: string;
  documentoFirmadoNombre: string;
  documentoFirmadoUrl: string;
  documentoFirmadoTamanoKB: string;
  fechaSuspension: string;
  fechaCancelacion: string;
  motivoCancelacion: string;
  activo: boolean;
  tipoMovimiento: string;
  fechaVigenciaDesde: string;
  fechaVigenciaHasta: string;
  motivoVersion: string;
};

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
  { key: "inmueble", header: "Inmueble", render: (row) => row.inmueble ?? "-" },
  { key: "unidad", header: "Unidad", render: (row) => row.unidad ?? "-" },
  {
    key: "importe",
    header: "Importe",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
  { key: "monedaAlquiler", header: "Moneda alquiler", render: (row) => row.monedaAlquiler ?? row.moneda ?? "-" },
  {
    key: "importeCochera",
    header: "Importe cochera",
    align: "right",
    render: (row) =>
      (row.importeCochera ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
  { key: "monedaCochera", header: "Moneda cochera", render: (row) => row.monedaCochera ?? row.moneda ?? "-" },
  {
    key: "importeMantenimiento",
    header: "Importe mantenimiento",
    align: "right",
    render: (row) =>
      (row.importeMantenimiento ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
  { key: "monedaMantenimiento", header: "Moneda mantenimiento", render: (row) => row.monedaMantenimiento ?? row.moneda ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
];

const initialForm = (): ContratoForm => {
  const today = dateInputValue(new Date());
  const nextYear = dateInputValue(addMonths(new Date(), 12));

  return {
    id: null,
    codigoContrato: generarCodigoContrato(),
    idArrendador: "",
    idInquilino: "",
    idInmueble: "",
    idUnidadPrincipal: "",
    fechaFirma: today,
    fechaInicio: today,
    fechaFin: nextYear,
    moneda: "PEN",
    monedaAlquiler: "PEN",
    monedaMantenimiento: "PEN",
    monedaCochera: "PEN",
    monedaGarantia: "PEN",
    importeAlquiler: "",
    periodicidadAlquiler: "MENSUAL",
    diaLimitePago: "5",
    diasGracia: "0",
    importeMantenimiento: "",
    periodicidadMantenimiento: "MENSUAL",
    diaLimiteMantenimiento: "5",
    importeCochera: "",
    periodicidadCochera: "MENSUAL",
    diaLimiteCochera: "5",
    garantiaPactada: "",
    garantiaPagada: "",
    garantiaPendiente: "",
    tipoReajuste: "",
    porcentajeReajuste: "",
    formulaReajuste: "",
    frecuenciaReajuste: "",
    penalidadMora: "",
    interesMoratorio: "",
    estadoContrato: "ACTIVO",
    observaciones: "",
    documentoFirmadoNombre: "",
    documentoFirmadoUrl: "",
    documentoFirmadoTamanoKB: "",
    fechaSuspension: "",
    fechaCancelacion: "",
    motivoCancelacion: "",
    activo: true,
    tipoMovimiento: "",
    fechaVigenciaDesde: today,
    fechaVigenciaHasta: nextYear,
    motivoVersion: "",
  };
};

export default function ArrendamientosContratosPage() {
  const [arrendadores, setArrendadores] = useState<ArrendamientosFila[]>([]);
  const [inquilinos, setInquilinos] = useState<ArrendamientosFila[]>([]);
  const [inmuebles, setInmuebles] = useState<ArrendamientosFila[]>([]);
  const [unidades, setUnidades] = useState<ArrendamientosFila[]>([]);
  const [adendaOpen, setAdendaOpen] = useState(false);
  const [adendaForm, setAdendaForm] = useState<ContratoForm>(initialForm());
  const [adendaErrors, setAdendaErrors] = useState<Record<string, string>>({});
  const [adendaSaving, setAdendaSaving] = useState(false);
  const [adendaFeedback, setAdendaFeedback] = useState<string | null>(null);
  const [pageReloadKey, setPageReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      listarArrendadoresArrendamientos(),
      listarInquilinosArrendamientos(),
      listarInmueblesArrendamientos(),
      listarUnidadesArrendamientos(),
    ])
      .then(([arrendadoresData, inquilinosData, inmueblesData, unidadesData]) => {
        if (cancelled) {
          return;
        }

        setArrendadores(arrendadoresData);
        setInquilinos(inquilinosData);
        setInmuebles(inmueblesData);
        setUnidades(unidadesData);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setArrendadores([]);
        setInquilinos([]);
        setInmuebles([]);
        setUnidades([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const arrendadorOptions = useMemo(() => sortByLabel(arrendadores, (row) => row.nombre ?? row.codigo ?? ""), [arrendadores]);
  const inquilinoOptions = useMemo(() => sortByLabel(inquilinos, (row) => row.nombre ?? row.codigo ?? ""), [inquilinos]);
  const inmuebleOptions = useMemo(() => sortByLabel(inmuebles, (row) => row.nombre ?? row.codigo ?? ""), [inmuebles]);
  const unidadOptions = useMemo(() => sortByLabel(unidades, (row) => row.nombre ?? row.codigo ?? ""), [unidades]);

  const mapRowToContratoForm = (row: ArrendamientosFila, tipoMovimiento = ""): ContratoForm => {
    const fechaVigenciaDesde = row.fechaFin ?? row.fechaInicio ?? dateInputValue(new Date());

    return {
      id: row.id ?? null,
      codigoContrato: row.codigo ?? generarCodigoContrato(),
      idArrendador: resolveIdByLabel(row.arrendador, arrendadorOptions, (item) => item.nombre ?? item.codigo ?? ""),
      idInquilino: resolveIdByLabel(row.inquilino, inquilinoOptions, (item) => item.nombre ?? item.codigo ?? ""),
      idInmueble: resolveIdByLabel(row.inmueble, inmuebleOptions, (item) => item.nombre ?? item.codigo ?? ""),
      idUnidadPrincipal: resolveIdByLabel(row.unidad, unidadOptions, (item) => item.nombre ?? item.codigo ?? ""),
      fechaFirma: row.fecha ?? dateInputValue(new Date()),
      fechaInicio: row.fechaInicio ?? dateInputValue(new Date()),
      fechaFin: row.fechaFin ?? dateInputValue(addMonths(new Date(), 12)),
      moneda: row.moneda ?? "PEN",
      monedaAlquiler: row.monedaAlquiler ?? row.moneda ?? "PEN",
      monedaMantenimiento: row.monedaMantenimiento ?? row.moneda ?? "PEN",
      monedaCochera: row.monedaCochera ?? row.moneda ?? "PEN",
      monedaGarantia: row.monedaGarantia ?? row.moneda ?? "PEN",
      importeAlquiler: row.importe != null ? String(row.importe) : "",
      periodicidadAlquiler: "MENSUAL",
      diaLimitePago: "5",
      diasGracia: "0",
      importeMantenimiento: row.importeMantenimiento != null ? String(row.importeMantenimiento) : "",
      periodicidadMantenimiento: "MENSUAL",
      diaLimiteMantenimiento: "5",
      importeCochera: row.importeCochera != null ? String(row.importeCochera) : "",
      periodicidadCochera: "MENSUAL",
      diaLimiteCochera: "5",
      garantiaPactada: "",
      garantiaPagada: "",
      garantiaPendiente: "",
      tipoReajuste: "",
      porcentajeReajuste: "",
      formulaReajuste: "",
      frecuenciaReajuste: "",
      penalidadMora: "",
      interesMoratorio: "",
      estadoContrato: row.estado ?? "ACTIVO",
      observaciones: row.observacion ?? "",
      documentoFirmadoNombre: "",
      documentoFirmadoUrl: "",
      documentoFirmadoTamanoKB: "",
      fechaSuspension: "",
      fechaCancelacion: "",
      motivoCancelacion: "",
      activo: true,
      tipoMovimiento,
      fechaVigenciaDesde,
      fechaVigenciaHasta: row.fechaFin ?? addMonths(new Date(), 12).toISOString().slice(0, 10),
      motivoVersion: "",
    };
  };

  const abrirAdenda = (row: ArrendamientosFila) => {
    setAdendaForm(mapRowToContratoForm(row, "ADENDA"));
    setAdendaErrors({});
    setAdendaFeedback(null);
    setAdendaOpen(true);
  };

  const guardarAdenda = async () => {
    const errors: Record<string, string> = {};

    if (!adendaForm.id) errors.id = "No se pudo identificar el contrato.";
    if (!adendaForm.tipoMovimiento.trim()) errors.tipoMovimiento = "Seleccione el tipo de movimiento.";
    if (!adendaForm.fechaVigenciaDesde) errors.fechaVigenciaDesde = "Seleccione la vigencia desde.";
    if (!adendaForm.fechaFin) errors.fechaFin = "Seleccione la fecha de termino.";
    if (!adendaForm.moneda.trim()) errors.moneda = "Seleccione la moneda.";
    if (!adendaForm.monedaAlquiler.trim()) errors.monedaAlquiler = "Seleccione la moneda del alquiler.";
    if (!adendaForm.monedaMantenimiento.trim()) errors.monedaMantenimiento = "Seleccione la moneda del mantenimiento.";
    if (!adendaForm.importeAlquiler || Number(adendaForm.importeAlquiler) < 0) errors.importeAlquiler = "Ingrese el importe del alquiler.";
    if (!adendaForm.importeMantenimiento || Number(adendaForm.importeMantenimiento) < 0) errors.importeMantenimiento = "Ingrese el importe del mantenimiento.";
    if (adendaForm.importeCochera === "" || Number(adendaForm.importeCochera) < 0) {
      errors.importeCochera = "Ingrese el importe de cochera o 0.";
    }
    if (!adendaForm.diaLimitePago || Number(adendaForm.diaLimitePago) < 1 || Number(adendaForm.diaLimitePago) > 31) {
      errors.diaLimitePago = "Ingrese un dia entre 1 y 31.";
    }
    if (!adendaForm.diaLimiteMantenimiento || Number(adendaForm.diaLimiteMantenimiento) < 1 || Number(adendaForm.diaLimiteMantenimiento) > 31) {
      errors.diaLimiteMantenimiento = "Ingrese un dia entre 1 y 31.";
    }
    if (!adendaForm.diaLimiteCochera || Number(adendaForm.diaLimiteCochera) < 1 || Number(adendaForm.diaLimiteCochera) > 31) {
      errors.diaLimiteCochera = "Ingrese un dia entre 1 y 31.";
    }

    if (Object.keys(errors).length > 0) {
      setAdendaErrors(errors);
      return;
    }

    try {
      setAdendaSaving(true);
      setAdendaErrors({});
      setAdendaFeedback(null);
      const payload = buildContratoPayload(adendaForm);
      const result = await crearVersionContratoArrendamientos(payload);
      setAdendaFeedback(result.message || "Version del contrato registrada correctamente.");
      setAdendaOpen(false);
      setPageReloadKey((value) => value + 1);
    } catch (error) {
      setAdendaFeedback(error instanceof Error ? error.message : "No se pudo registrar la version del contrato.");
    } finally {
      setAdendaSaving(false);
    }
  };

  const buildContratoPayload = (form: ContratoForm) => ({
    idContrato: form.id,
    codigoContrato: form.codigoContrato.trim(),
    idArrendador: Number(form.idArrendador),
    idInquilino: Number(form.idInquilino),
    idInmueble: Number(form.idInmueble),
    idUnidadPrincipal: form.idUnidadPrincipal ? Number(form.idUnidadPrincipal) : null,
    fechaFirma: form.fechaFirma || null,
    fechaInicio: form.fechaInicio,
    fechaFin: form.fechaFin,
    moneda: form.moneda,
    monedaAlquiler: form.monedaAlquiler,
    monedaMantenimiento: form.monedaMantenimiento,
    monedaCochera: form.monedaCochera,
    monedaGarantia: form.monedaGarantia,
    importeAlquiler: Number(form.importeAlquiler || 0),
    periodicidadAlquiler: form.periodicidadAlquiler || null,
    diaLimitePago: Number(form.diaLimitePago || 5),
    diasGracia: Number(form.diasGracia || 0),
    importeMantenimiento: Number(form.importeMantenimiento || 0),
    periodicidadMantenimiento: form.periodicidadMantenimiento || null,
    diaLimiteMantenimiento: Number(form.diaLimiteMantenimiento || 5),
    importeCochera: Number(form.importeCochera || 0),
    periodicidadCochera: form.periodicidadCochera || null,
    diaLimiteCochera: Number(form.diaLimiteCochera || 5),
    garantiaPactada: Number(form.garantiaPactada || 0),
    garantiaPagada: Number(form.garantiaPagada || 0),
    garantiaPendiente: Number(form.garantiaPendiente || 0),
    tipoReajuste: form.tipoReajuste.trim() || null,
    porcentajeReajuste: form.porcentajeReajuste ? Number(form.porcentajeReajuste) : null,
    formulaReajuste: form.formulaReajuste.trim() || null,
    frecuenciaReajuste: form.frecuenciaReajuste.trim() || null,
    penalidadMora: Number(form.penalidadMora || 0),
    interesMoratorio: Number(form.interesMoratorio || 0),
    estadoContrato: form.estadoContrato.trim() || "ACTIVO",
    observaciones: form.observaciones.trim() || null,
    documentoFirmadoNombre: form.documentoFirmadoNombre.trim() || null,
    documentoFirmadoUrl: form.documentoFirmadoUrl.trim() || null,
    documentoFirmadoTamanoKB: form.documentoFirmadoTamanoKB ? Number(form.documentoFirmadoTamanoKB) : null,
    idEmpleadoResponsable: null,
    fechaSuspension: form.fechaSuspension || null,
    fechaCancelacion: form.fechaCancelacion || null,
    motivoCancelacion: form.motivoCancelacion.trim() || null,
    activo: form.activo,
    tipoMovimiento: form.tipoMovimiento.trim() || null,
    fechaVigenciaDesde: form.fechaVigenciaDesde || null,
    fechaVigenciaHasta: form.fechaVigenciaHasta || null,
    motivoVersion: form.motivoVersion.trim() || null,
  });

  return (
    <div>
    <ArrendamientosCrudPage<ContratoForm>
      key={pageReloadKey}
      title="Contratos"
      description="Contratos vigentes, renovaciones y vínculos entre arrendador, inquilino, inmueble y unidad."
      searchHint="codigo, arrendador, inquilino, inmueble, unidad"
      loadRows={listarContratosArrendamientos}
      columns={columns}
      rowActionsPosition={11}
      initialForm={initialForm}
      mapRowToForm={(row) => mapRowToContratoForm(row)}
      buildPayload={(form) => buildContratoPayload(form)}
      saveForm={async (payload, mode) => {
        const result = await crearContratoArrendamientos(payload);
        return {
          message: result.message || (mode === "nuevo" ? "Contrato creado correctamente." : "Contrato actualizado correctamente."),
        };
      }}
      validateForm={(form) => {
        const errors: Record<string, string> = {};
        if (!form.codigoContrato.trim()) errors.codigoContrato = "Ingrese el codigo.";
        if (!form.idArrendador) errors.idArrendador = "Seleccione el arrendador.";
        if (!form.idInquilino) errors.idInquilino = "Seleccione el inquilino.";
        if (!form.idInmueble) errors.idInmueble = "Seleccione el inmueble.";
        if (!form.fechaInicio) errors.fechaInicio = "Seleccione la fecha de inicio.";
        if (!form.fechaFin) errors.fechaFin = "Seleccione la fecha de termino.";
        if (!form.moneda.trim()) errors.moneda = "Seleccione la moneda.";
        if (!form.monedaAlquiler.trim()) errors.monedaAlquiler = "Seleccione la moneda del alquiler.";
        if (!form.monedaMantenimiento.trim()) errors.monedaMantenimiento = "Seleccione la moneda del mantenimiento.";
        if (!form.monedaCochera.trim()) errors.monedaCochera = "Seleccione la moneda de cochera.";
        if (!form.monedaGarantia.trim()) errors.monedaGarantia = "Seleccione la moneda de garantia.";
        if (!form.importeAlquiler || Number(form.importeAlquiler) < 0) errors.importeAlquiler = "Ingrese el importe del alquiler.";
        if (!form.diaLimitePago || Number(form.diaLimitePago) < 1 || Number(form.diaLimitePago) > 31) errors.diaLimitePago = "Ingrese un dia entre 1 y 31.";
        if (!form.diaLimiteMantenimiento || Number(form.diaLimiteMantenimiento) < 1 || Number(form.diaLimiteMantenimiento) > 31) {
          errors.diaLimiteMantenimiento = "Ingrese un dia entre 1 y 31.";
        }
        if (!form.diaLimiteCochera || Number(form.diaLimiteCochera) < 1 || Number(form.diaLimiteCochera) > 31) {
          errors.diaLimiteCochera = "Ingrese un dia entre 1 y 31.";
        }
        return errors;
      }}
      renderRowActions={(row) => (
        <button type="button" style={styles.versionButton} onClick={() => abrirAdenda(row)} title="Crear adenda">
          + Adenda
        </button>
      )}
      renderForm={(form, setForm, errors) => (
        <div style={styles.stack}>
          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Identificacion</h4>
            <div style={styles.grid}>
              <Field label="Codigo" error={errors.codigoContrato} helperText="Se genera automaticamente al crear el contrato.">
                <input value={form.codigoContrato} readOnly style={getFieldStyle(false)} />
              </Field>
              <Field label="Estado contrato" error={errors.estadoContrato}>
                <select
                  value={form.estadoContrato}
                  onChange={(e) => setForm((p) => ({ ...p, estadoContrato: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.estadoContrato))}
                  disabled
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="VIGENTE">VIGENTE</option>
                  <option value="SUSPENDIDO">SUSPENDIDO</option>
                  <option value="RESUELTO">RESUELTO</option>
                  <option value="CANCELADO">CANCELADO</option>
                  <option value="FINALIZADO">FINALIZADO</option>
                </select>
              </Field>
              <Field label="Arrendador" error={errors.idArrendador}>
                <select value={form.idArrendador} onChange={(e) => setForm((p) => ({ ...p, idArrendador: e.target.value }))} style={getFieldStyle(Boolean(errors.idArrendador))}>
                  <option value="">Seleccione...</option>
                  {arrendadorOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Inquilino" error={errors.idInquilino}>
                <select value={form.idInquilino} onChange={(e) => setForm((p) => ({ ...p, idInquilino: e.target.value }))} style={getFieldStyle(Boolean(errors.idInquilino))}>
                  <option value="">Seleccione...</option>
                  {inquilinoOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Ubicacion y vigencia</h4>
            <div style={styles.grid}>
              <Field label="Inmueble" error={errors.idInmueble}>
                <select value={form.idInmueble} onChange={(e) => setForm((p) => ({ ...p, idInmueble: e.target.value }))} style={getFieldStyle(Boolean(errors.idInmueble))}>
                  <option value="">Seleccione...</option>
                  {inmuebleOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unidad principal">
                <select value={form.idUnidadPrincipal} onChange={(e) => setForm((p) => ({ ...p, idUnidadPrincipal: e.target.value }))} style={getFieldStyle(false)}>
                  <option value="">Seleccione...</option>
                  {unidadOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moneda contrato" error={errors.moneda}>
                <select value={form.moneda} onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value }))} style={getFieldStyle(Boolean(errors.moneda))}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <div style={styles.dateGrid}>
                <Field label="Fecha firma">
                  <input type="date" value={form.fechaFirma} onChange={(e) => setForm((p) => ({ ...p, fechaFirma: e.target.value }))} style={getFieldStyle(false)} />
                </Field>
                <Field label="Fecha inicio" error={errors.fechaInicio}>
                  <input type="date" value={form.fechaInicio} onChange={(e) => setForm((p) => ({ ...p, fechaInicio: e.target.value }))} style={getFieldStyle(Boolean(errors.fechaInicio))} />
                </Field>
                <Field label="Fecha termino" error={errors.fechaFin}>
                  <input type="date" value={form.fechaFin} onChange={(e) => setForm((p) => ({ ...p, fechaFin: e.target.value }))} style={getFieldStyle(Boolean(errors.fechaFin))} />
                </Field>
              </div>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Montos y reglas</h4>
            <div style={styles.grid}>
              <Field label="Moneda alquiler" error={errors.monedaAlquiler}>
                <select
                  value={form.monedaAlquiler}
                  onChange={(e) => setForm((p) => ({ ...p, monedaAlquiler: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.monedaAlquiler))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe alquiler" error={errors.importeAlquiler}>
                <input type="number" step="0.01" value={form.importeAlquiler} onChange={(e) => setForm((p) => ({ ...p, importeAlquiler: e.target.value }))} style={getFieldStyle(Boolean(errors.importeAlquiler))} />
              </Field>
              <Field label="Periodicidad alquiler">
                <select value={form.periodicidadAlquiler} onChange={(e) => setForm((p) => ({ ...p, periodicidadAlquiler: e.target.value }))} style={getFieldStyle(false)}>
                  <option value="MENSUAL">MENSUAL</option>
                  <option value="BIMESTRAL">BIMESTRAL</option>
                  <option value="TRIMESTRAL">TRIMESTRAL</option>
                  <option value="SEMESTRAL">SEMESTRAL</option>
                  <option value="ANUAL">ANUAL</option>
                </select>
              </Field>
              <Field label="Dia limite pago">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.diaLimitePago}
                  onChange={(e) => setForm((p) => ({ ...p, diaLimitePago: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.diaLimitePago))}
                />
              </Field>
              <Field label="Dias gracia">
                <input type="number" min="0" value={form.diasGracia} onChange={(e) => setForm((p) => ({ ...p, diasGracia: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Moneda mantenimiento" error={errors.monedaMantenimiento}>
                <select
                  value={form.monedaMantenimiento}
                  onChange={(e) => setForm((p) => ({ ...p, monedaMantenimiento: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.monedaMantenimiento))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe mantenimiento">
                <input type="number" step="0.01" value={form.importeMantenimiento} onChange={(e) => setForm((p) => ({ ...p, importeMantenimiento: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Periodicidad mantenimiento">
                <select value={form.periodicidadMantenimiento} onChange={(e) => setForm((p) => ({ ...p, periodicidadMantenimiento: e.target.value }))} style={getFieldStyle(false)}>
                  <option value="MENSUAL">MENSUAL</option>
                  <option value="BIMESTRAL">BIMESTRAL</option>
                  <option value="TRIMESTRAL">TRIMESTRAL</option>
                  <option value="SEMESTRAL">SEMESTRAL</option>
                  <option value="ANUAL">ANUAL</option>
                </select>
              </Field>
              <Field label="Dia limite mantenimiento">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.diaLimiteMantenimiento}
                  onChange={(e) => setForm((p) => ({ ...p, diaLimiteMantenimiento: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.diaLimiteMantenimiento))}
                />
              </Field>
              <Field label="Moneda cochera" error={errors.monedaCochera}>
                <select
                  value={form.monedaCochera}
                  onChange={(e) => setForm((p) => ({ ...p, monedaCochera: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.monedaCochera))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe cochera">
                <input type="number" step="0.01" value={form.importeCochera} onChange={(e) => setForm((p) => ({ ...p, importeCochera: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Periodicidad cochera">
                <select value={form.periodicidadCochera} onChange={(e) => setForm((p) => ({ ...p, periodicidadCochera: e.target.value }))} style={getFieldStyle(false)}>
                  <option value="MENSUAL">MENSUAL</option>
                  <option value="BIMESTRAL">BIMESTRAL</option>
                  <option value="TRIMESTRAL">TRIMESTRAL</option>
                  <option value="SEMESTRAL">SEMESTRAL</option>
                  <option value="ANUAL">ANUAL</option>
                </select>
              </Field>
              <Field label="Dia limite cochera">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.diaLimiteCochera}
                  onChange={(e) => setForm((p) => ({ ...p, diaLimiteCochera: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.diaLimiteCochera))}
                />
              </Field>
              <Field label="Garantia pactada">
                <input type="number" step="0.01" value={form.garantiaPactada} onChange={(e) => setForm((p) => ({ ...p, garantiaPactada: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Moneda garantia" error={errors.monedaGarantia}>
                <select
                  value={form.monedaGarantia}
                  onChange={(e) => setForm((p) => ({ ...p, monedaGarantia: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.monedaGarantia))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Garantia pagada">
                <input type="number" step="0.01" value={form.garantiaPagada} onChange={(e) => setForm((p) => ({ ...p, garantiaPagada: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Garantia pendiente">
                <input type="number" step="0.01" value={form.garantiaPendiente} onChange={(e) => setForm((p) => ({ ...p, garantiaPendiente: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Reajustes y documentos</h4>
            <div style={{ ...styles.grid, opacity: 0.55, pointerEvents: "none" }}>
              <Field label="Tipo reajuste">
                <input value={form.tipoReajuste} onChange={(e) => setForm((p) => ({ ...p, tipoReajuste: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Porcentaje reajuste">
                <input type="number" step="0.000001" value={form.porcentajeReajuste} onChange={(e) => setForm((p) => ({ ...p, porcentajeReajuste: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Frecuencia reajuste">
                <input value={form.frecuenciaReajuste} onChange={(e) => setForm((p) => ({ ...p, frecuenciaReajuste: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Penalidad mora">
                <input type="number" step="0.01" value={form.penalidadMora} onChange={(e) => setForm((p) => ({ ...p, penalidadMora: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Interes moratorio">
                <input type="number" step="0.01" value={form.interesMoratorio} onChange={(e) => setForm((p) => ({ ...p, interesMoratorio: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Archivo firmado">
                <input value={form.documentoFirmadoNombre} onChange={(e) => setForm((p) => ({ ...p, documentoFirmadoNombre: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="URL documento" fullWidth>
                <input value={form.documentoFirmadoUrl} onChange={(e) => setForm((p) => ({ ...p, documentoFirmadoUrl: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Tamano KB">
                <input type="number" step="0.01" value={form.documentoFirmadoTamanoKB} onChange={(e) => setForm((p) => ({ ...p, documentoFirmadoTamanoKB: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Activo">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} disabled />
              </Field>
              <Field label="Suspension">
                <input type="date" value={form.fechaSuspension} onChange={(e) => setForm((p) => ({ ...p, fechaSuspension: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Cancelacion">
                <input type="date" value={form.fechaCancelacion} onChange={(e) => setForm((p) => ({ ...p, fechaCancelacion: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Motivo cancelacion" fullWidth>
                <input value={form.motivoCancelacion} onChange={(e) => setForm((p) => ({ ...p, motivoCancelacion: e.target.value }))} style={getFieldStyle(false)} disabled />
              </Field>
              <Field label="Observaciones" fullWidth>
                <textarea rows={4} value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} style={{ ...getFieldStyle(false), resize: "vertical", minHeight: 100 }} disabled />
              </Field>
            </div>
          </section>
        </div>
      )}
    />
      {adendaFeedback ? <div style={styles.feedbackBanner}>{adendaFeedback}</div> : null}
      <SidePanelForm
        open={adendaOpen}
        title="Nueva adenda"
        subtitle="Registra una nueva version del contrato sin perder historial."
        onClose={() => {
          setAdendaOpen(false);
          setAdendaErrors({});
        }}
        maxWidth={880}
        footer={
          <>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setAdendaOpen(false);
                setAdendaErrors({});
              }}
              disabled={adendaSaving}
            >
              Cancelar
            </button>
            <button type="button" style={styles.primaryButton} onClick={() => void guardarAdenda()} disabled={adendaSaving}>
              {adendaSaving ? "Guardando..." : "Guardar adenda"}
            </button>
          </>
        }
      >
        <div style={styles.stack}>
          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Version y vigencia</h4>
            <div style={styles.grid}>
              <Field label="Tipo movimiento" error={adendaErrors.tipoMovimiento}>
                <select value={adendaForm.tipoMovimiento} onChange={(e) => setAdendaForm((prev) => ({ ...prev, tipoMovimiento: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.tipoMovimiento))}>
                  <option value="ADENDA">ADENDA</option>
                  <option value="AMPLIACION">AMPLIACION</option>
                  <option value="MODIFICACION">MODIFICACION</option>
                </select>
              </Field>
              <Field label="Fecha vigencia desde" error={adendaErrors.fechaVigenciaDesde}>
                <input
                  type="date"
                  value={adendaForm.fechaVigenciaDesde}
                  onChange={(e) => setAdendaForm((prev) => ({ ...prev, fechaVigenciaDesde: e.target.value }))}
                  style={getFieldStyle(Boolean(adendaErrors.fechaVigenciaDesde))}
                />
              </Field>
              <Field label="Fecha termino" error={adendaErrors.fechaFin}>
                <input type="date" value={adendaForm.fechaFin} onChange={(e) => setAdendaForm((prev) => ({ ...prev, fechaFin: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.fechaFin))} />
              </Field>
              <Field label="Motivo de la version" fullWidth error={adendaErrors.motivoVersion}>
                <textarea
                  rows={3}
                  value={adendaForm.motivoVersion}
                  onChange={(e) => setAdendaForm((prev) => ({ ...prev, motivoVersion: e.target.value }))}
                  style={{ ...getFieldStyle(Boolean(adendaErrors.motivoVersion)), resize: "vertical", minHeight: 90 }}
                />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Importes nuevos</h4>
            <div style={styles.grid}>
              <Field label="Moneda alquiler" error={adendaErrors.monedaAlquiler}>
                <select value={adendaForm.monedaAlquiler} onChange={(e) => setAdendaForm((prev) => ({ ...prev, monedaAlquiler: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.monedaAlquiler))}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe alquiler" error={adendaErrors.importeAlquiler}>
                <input type="number" step="0.01" value={adendaForm.importeAlquiler} onChange={(e) => setAdendaForm((prev) => ({ ...prev, importeAlquiler: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.importeAlquiler))} />
              </Field>
              <Field label="Moneda mantenimiento" error={adendaErrors.monedaMantenimiento}>
                <select value={adendaForm.monedaMantenimiento} onChange={(e) => setAdendaForm((prev) => ({ ...prev, monedaMantenimiento: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.monedaMantenimiento))}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe mantenimiento" error={adendaErrors.importeMantenimiento}>
                <input type="number" step="0.01" value={adendaForm.importeMantenimiento} onChange={(e) => setAdendaForm((prev) => ({ ...prev, importeMantenimiento: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.importeMantenimiento))} />
              </Field>
              <Field label="Moneda cochera">
                <select value={adendaForm.monedaCochera} onChange={(e) => setAdendaForm((prev) => ({ ...prev, monedaCochera: e.target.value }))} style={getFieldStyle(false)}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe cochera" error={adendaErrors.importeCochera}>
                <input type="number" step="0.01" value={adendaForm.importeCochera} onChange={(e) => setAdendaForm((prev) => ({ ...prev, importeCochera: e.target.value }))} style={getFieldStyle(Boolean(adendaErrors.importeCochera))} />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Documento</h4>
            <div style={styles.grid}>
              <Field label="Archivo firmado">
                <input value={adendaForm.documentoFirmadoNombre} onChange={(e) => setAdendaForm((prev) => ({ ...prev, documentoFirmadoNombre: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="URL documento" fullWidth>
                <input value={adendaForm.documentoFirmadoUrl} onChange={(e) => setAdendaForm((prev) => ({ ...prev, documentoFirmadoUrl: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Tamano KB">
                <input type="number" step="0.01" value={adendaForm.documentoFirmadoTamanoKB} onChange={(e) => setAdendaForm((prev) => ({ ...prev, documentoFirmadoTamanoKB: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
            </div>
          </section>
        </div>
      </SidePanelForm>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  fullWidth = false,
  helperText,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  fullWidth?: boolean;
  helperText?: string;
}) {
  return (
    <label style={{ ...styles.field, ...(fullWidth ? styles.fullWidth : {}) }}>
      <span style={styles.label}>{label}</span>
      {children}
      {helperText ? <span style={styles.helper}>{helperText}</span> : null}
      {error ? <span style={styles.error}>{error}</span> : null}
    </label>
  );
}

function getFieldStyle(hasError: boolean): CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${hasError ? "#FCA5A5" : "#D6DCEB"}`,
    background: "#F8FAFC",
    color: "#0F172A",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  };
}

function sortByLabel<T>(items: T[], getLabel: (item: T) => string) {
  return [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b), "es", { sensitivity: "base" }));
}

function resolveIdByLabel<T>(label: string | null | undefined, items: T[], getLabel: (item: T) => string) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "";
  }

  const match = items.find((item) => normalizeText(getLabel(item)) === normalized);
  return match ? getItemId(match) : "";
}

function getItemId(item: unknown) {
  const typed = item as { id?: number; idEmpleado?: number };
  return String(typed.id ?? typed.idEmpleado ?? "");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function generarCodigoContrato() {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const suffix = pad(Math.floor(Math.random() * 1000), 3);
  return `CTR-${stamp}-${suffix}`;
}

const styles: Record<string, CSSProperties> = {
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  dateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
    gridColumn: "1 / -1",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  helper: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 500,
  },
  error: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },
  feedbackBanner: {
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#166534",
    fontSize: 13,
    fontWeight: 700,
  },
  versionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #F59E0B",
    borderRadius: 10,
    background: "#FFF7ED",
    color: "#9A3412",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
};
