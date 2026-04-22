    // ...existing code...

  // ...existing code...

  // ...existing code...

  // ...existing code...

  // ...existing code...
import React, { useState, useEffect } from 'react';
import type { FiltroOperativoValue } from '../../../models/filtroOperativo';
import { FiltroOperativoLookup } from '../../../components/lookups/FiltroOperativoLookup';
import { registrarPago } from '../../../api/tesoreriaService';
import { listarEmpleadosCta } from '../../../api/empleadoService';
import type { EmpleadoCta } from '../../../models/empleadoCta';
import './gastos.css';

const GastosPage: React.FC = () => {
    // Selección de responsable desde el autocomplete
    const handleResponsableSelect = (emp: EmpleadoCta) => {
      setForm(prev => ({
        ...prev,
        responsable: String(emp.idEmpleado),
        cuenta: `Banco: ${emp.nombreBanco || ''}, Tipo Cta: ${emp.nombreCta || ''}, Cta. ${emp.cuenta || ''}, CI: ${emp.cuentaInter || ''}, Nro Doc: ${emp.nroDocumento || ''}`
      }));
      setResponsableInput(emp.nombreEmpleado);
      setShowResponsableDropdown(false);
      setHighlightedResponsableIdx(-1);
    };
  // Estado para empleados responsables (debe ir antes del autocomplete)
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);

  // Estados para el autocomplete de Responsable
  const [responsableInput, setResponsableInput] = useState('');
  const [showResponsableDropdown, setShowResponsableDropdown] = useState(false);
  const [highlightedResponsableIdx, setHighlightedResponsableIdx] = useState(-1);
  const filteredResponsables = responsableInput.trim() === ''
    ? empleados
    : empleados.filter(emp =>
        emp.nombreEmpleado.toLowerCase().includes(responsableInput.toLowerCase())
      );
// ...existing code...
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    filtroOperativo: {} as FiltroOperativoValue,
    responsable: '',
    cuenta: '',
    tipoPago: '',
    solicitante: '',
    gestor: '',
      validador: '',
    monto: '',
    igv: '',
    moneda: '',
    comentario: '',
    detalle: '',
    fechaVencimiento: today,
    bien: '',
    comprobante: '',
    serie: '',
    // ...otros campos
  });

  const [showFechaVenc, setShowFechaVenc] = useState(false);
  // ...existing code...
  const [showFechaEmi, setShowFechaEmi] = useState(false);
  const [fechaEmision, setFechaEmision] = useState(today);


  const handleFiltroChange = (value: FiltroOperativoValue) => {
    setForm(prev => ({
      ...prev,
      filtroOperativo: value,
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'monto') {
      // Solo permitir números y punto
      const clean = value.replace(/[^0-9.]/g, '');
      // Evitar más de un punto
      const parts = clean.split('.');
      let numeric = parts[0];
      if (parts.length > 1) numeric += '.' + parts.slice(1).join('');
      setForm(prev => ({ ...prev, [name]: numeric }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.filtroOperativo.filtro?.filtroKey) {
      alert('Debe seleccionar un filtro operativo.');
      return;
    }
    // setLoading(true); // Eliminado: loading no se usa
    try {
      await registrarPago({
        filtroOperativoKey: form.filtroOperativo.filtro.filtroKey,
        responsable: form.responsable,
        cuenta: form.cuenta,
        tipoPago: form.tipoPago,
        monto: Number(form.monto),
        comentario: form.comentario,
        detalle: form.detalle,
        fechavencimiento: form.fechaVencimiento,
        fecehemision: fechaEmision,
        // ...otros campos
      });
      alert('Pago registrado correctamente');
      // Limpia el formulario si lo deseas
    } catch {
      alert('Error al registrar el pago');
    }
    // setLoading(false); // Eliminado: loading no se usa
  };

  const [activeTab, setActiveTab] = useState<'registro' | 'resumen'>('registro');

  // ...existing code...

  useEffect(() => {
    setEmpleadosLoading(true);
    listarEmpleadosCta()
      .then(setEmpleados)
      .catch(() => setEmpleadosError('Error al cargar responsables'))
      .finally(() => setEmpleadosLoading(false));
  }, []);

  // (Eliminado: handleResponsableChange, ya no se usa con el nuevo autocomplete)

  return (
    <div className="gastos-container" style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', marginTop: 0 }}>
      {/* Toolstrip CRUD */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, background: '#f5f5f5', borderRadius: 4, padding: '6px 10px', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', justifyContent: 'flex-end' }}>
        <button type="button" title="Nuevo" style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
          <span role="img" aria-label="Nuevo">🆕</span> Nuevo
        </button>
        <button type="button" title="Editar" style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
          <span role="img" aria-label="Editar">✏️</span> Editar
        </button>
        <button type="button" title="Eliminar" style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
          <span role="img" aria-label="Eliminar">🗑️</span> Eliminar
        </button>
        <button type="button" title="Guardar" style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
          <span role="img" aria-label="Guardar">💾</span> Guardar
        </button>
        <button type="button" title="Cancelar" style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
          <span role="img" aria-label="Cancelar">❌</span> Cancelar
        </button>
      </div>
      {/* XtraTabControl simulado */}
      <div style={{ background: '#e9e9e9', borderRadius: 5, padding: 0, marginBottom: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        {/* Tabs header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #ccc', background: '#f7f7f7', borderTopLeftRadius: 5, borderTopRightRadius: 5 }}>
          <div
            style={{
              padding: '8px 18px',
              cursor: 'pointer',
              borderBottom: activeTab === 'registro' ? '2px solid #1976d2' : 'none',
              fontWeight: activeTab === 'registro' ? 600 : undefined,
              color: activeTab === 'registro' ? '#1976d2' : '#555',
              background: activeTab === 'registro' ? '#fff' : 'transparent',
              borderTopLeftRadius: 5
            }}
            onClick={() => setActiveTab('registro')}
          >
            Registro de solicitud
          </div>
          <div
            style={{
              padding: '8px 18px',
              cursor: 'pointer',
              borderBottom: activeTab === 'resumen' ? '2px solid #1976d2' : 'none',
              fontWeight: activeTab === 'resumen' ? 600 : undefined,
              color: activeTab === 'resumen' ? '#1976d2' : '#555',
              background: activeTab === 'resumen' ? '#fff' : 'transparent',
              borderTopRightRadius: 5
            }}
            onClick={() => setActiveTab('resumen')}
          >
            Resumen
          </div>
        </div>
        {/* Tab content dinámico */}
        <div style={{ padding: '18px 18px 10px 18px', background: '#fff', borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }}>
          {activeTab === 'registro' ? (
            <form className="gastos-form" onSubmit={handleSubmit} style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
              <div className="gastos-row">
                <div className="gastos-col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FiltroOperativoLookup
                    value={form.filtroOperativo}
                    onChange={handleFiltroChange}
                  />
                  {/* Detalle y Comentario en la misma fila */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 2, marginBottom: 2, position: 'relative', zIndex: 1, overflow: 'visible' }}>
                    {/* Detalle */}
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 300 }}>
                      <label htmlFor="detalle" style={{ marginBottom: 2 }}>Detalle</label>
                      <textarea
                        id="detalle"
                        name="detalle"
                        rows={3}
                        value={form.detalle}
                        onChange={handleInputChange}
                        style={{ width: '100%', maxWidth: 300, fontFamily: 'Arial, sans-serif', fontSize: '13px', resize: 'vertical', minHeight: 150, maxHeight: 150 }}
                      />
                    </div>
                    {/* Comentario, Emisión y Vencimiento */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 200 }}>
                      <label htmlFor="comentario" style={{ marginBottom: 2 }}>Comentario</label>
                      <textarea
                        id="comentario"
                        name="comentario"
                        rows={3}
                        value={form.comentario}
                        onChange={handleInputChange}
                        style={{ width: '100%', maxWidth: 200, fontFamily: 'Arial, sans-serif', fontSize: '13px', resize: 'vertical' }}
                      />
                      {/* Emisión debajo de Comentario */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={showFechaEmi}
                            onChange={e => setShowFechaEmi(e.target.checked)}
                            style={{ marginRight: 4 }}
                          />
                          <label style={{ marginBottom: 0, marginRight: 4 }}>Emisión</label>
                        </div>
                        <input
                          type="date"
                          name="fechaEmision"
                          value={fechaEmision}
                          onChange={e => setFechaEmision(e.target.value)}
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', minWidth: 120 }}
                          disabled={!showFechaEmi}
                        />
                      </div>
                      {/* Vencimiento debajo de Emisión */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={showFechaVenc}
                            onChange={e => {
                              setShowFechaVenc(e.target.checked);
                              if (e.target.checked && !form.fechaVencimiento) {
                                setForm(prev => ({ ...prev, fechaVencimiento: today }));
                              }
                              if (!e.target.checked) {
                                setForm(prev => ({ ...prev, fechaVencimiento: '' }));
                              }
                            }}
                            style={{ marginRight: 4 }}
                          />
                          <label style={{ marginBottom: 0, marginRight: 4 }}>Vencim.</label>
                        </div>
                        <input
                          type="date"
                          name="fechaVencimiento"
                          value={form.fechaVencimiento}
                          onChange={handleInputChange}
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', minWidth: 120 }}
                          disabled={!showFechaVenc}
                        />
                      </div>
                    </div>
                    {/* Bien y Comprobante */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120, maxWidth: 160 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label htmlFor="bien" style={{ marginBottom: 2 }}>Bien</label>
                        <select
                          id="bien"
                          name="bien"
                          value={form.bien || ''}
                          onChange={handleInputChange}
                          style={{ width: '100%', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}
                        >
                          <option value="">Seleccione...</option>
                          <option value="BIEN1">Bien 1</option>
                          <option value="BIEN2">Bien 2</option>
                          <option value="BIEN3">Bien 3</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label htmlFor="comprobante" style={{ marginBottom: 2 }}>Comprobante</label>
                        <select
                          id="comprobante"
                          name="comprobante"
                          value={form.comprobante || ''}
                          onChange={handleInputChange}
                          style={{ width: '100%', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}
                        >
                          <option value="">Seleccione...</option>
                          <option value="FACTURA">Factura</option>
                          <option value="RECIBO">Recibo</option>
                          <option value="BOLETA">Boleta</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label htmlFor="serie" style={{ marginBottom: 2 }}>Serie</label>
                        <input
                          type="text"
                          id="serie"
                          name="serie"
                          value={form.serie || ''}
                          onChange={handleInputChange}
                          style={{ width: '100%', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}
                        />
                      </div>
                    </div>
                    {/* Vencimiento eliminado de columna separada, ahora está debajo de Emisión */}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: -4 }}>
                    <div style={{ flex: 1 }}>
                      <label>Responsable</label>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input
                          type="text"
                          name="responsable"
                          value={
                            empleados.find(emp => String(emp.idEmpleado) === form.responsable)?.nombreEmpleado || responsableInput || ''
                          }
                          onChange={e => {
                            setResponsableInput(e.target.value);
                            setShowResponsableDropdown(true);
                            setForm(prev => ({ ...prev, responsable: '' }));
                          }}
                          onFocus={() => {
                            if (filteredResponsables.length > 0) setShowResponsableDropdown(true);
                          }}
                          onKeyDown={e => {
                            if (filteredResponsables.length === 0) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedResponsableIdx(idx => Math.min(idx + 1, filteredResponsables.length - 1));
                              setShowResponsableDropdown(true);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedResponsableIdx(idx => Math.max(idx - 1, 0));
                              setShowResponsableDropdown(true);
                            } else if (e.key === 'Enter') {
                              if (highlightedResponsableIdx >= 0 && highlightedResponsableIdx < filteredResponsables.length) {
                                const emp = filteredResponsables[highlightedResponsableIdx];
                                handleResponsableSelect(emp);
                              }
                            }
                          }}
                          placeholder="Seleccione..."
                          autoComplete="off"
                          required
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: '100%' }}
                          disabled={empleadosLoading}
                        />
                        {showResponsableDropdown && filteredResponsables.length > 0 && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: '#fff',
                            border: '1px solid #ccc',
                            zIndex: 1002,
                            maxHeight: 180,
                            overflowY: 'auto',
                          }}>
                            {filteredResponsables.map((emp, idx) => (
                              <div
                                key={emp.idEmpleado}
                                style={{
                                  padding: 6,
                                  cursor: 'pointer',
                                  background: idx === highlightedResponsableIdx ? '#e6f7ff' : undefined,
                                }}
                                onMouseDown={() => handleResponsableSelect(emp)}
                              >
                                {emp.nombreEmpleado}
                              </div>
                            ))}
                          </div>
                        )}
                        {empleadosLoading && <span style={{ fontSize: 12, color: '#888' }}>Cargando...</span>}
                        {empleadosError && <span style={{ fontSize: 12, color: 'red' }}>{empleadosError}</span>}
                      </div>
                    </div>
                    <div style={{ flex: 2, minWidth: 200, width: '100%' }}>
                      {/* <label>Cuenta</label> */}
                      <input
                        name="cuenta"
                        value={form.cuenta}
                        onChange={handleInputChange}
                        required
                        readOnly={true}
                        style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="gastos-row">
                <div className="gastos-col">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label htmlFor="tipoPago" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Tipo de Pago</label>
                      <select
                        id="tipoPago"
                        name="tipoPago"
                        value={form.tipoPago}
                        onChange={handleInputChange}
                        required
                        style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 120 }}
                      >
                        <option value="">Seleccione...</option>
                        <option value="CONTADO">CONTADO</option>
                        <option value="CREDITO">CRÉDITO</option>
                      </select>
                        <label htmlFor="monto" style={{ marginBottom: 0, whiteSpace: 'nowrap', marginLeft: 8 }}>Monto</label>
                        <input
                          type="text"
                          id="monto"
                          name="monto"
                          value={form.monto}
                          onChange={handleInputChange}
                          onBlur={e => {
                            let val = e.target.value;
                            if (val === '' || isNaN(Number(val))) {
                              setForm(prev => ({ ...prev, monto: '' }));
                            } else {
                              setForm(prev => ({ ...prev, monto: Number(val).toFixed(2) }));
                            }
                          }}
                          required
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          minLength={1}
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 120, textAlign: 'right' }}
                        />
                        <span style={{ marginLeft: 8, marginRight: 4, fontSize: '13px', color: '#555' }}>IGV</span>
                        <input
                          type="text"
                          id="igv"
                          name="igv"
                          value={(() => {
                            const monto = parseFloat(form.monto) || 0;
                            return (monto * 0.13).toFixed(2);
                          })()}
                          readOnly
                          inputMode="decimal"
                          style={{
                            fontFamily: 'Arial, sans-serif',
                            fontSize: '13px',
                            width: 90,
                            marginRight: 8,
                            background: '#f5f5f5',
                            borderRadius: 3,
                            padding: '2px 8px',
                            color: '#1976d2',
                            fontWeight: 600,
                            textAlign: 'right',
                            border: '1px solid #ccc',
                          }}
                        />
                        <span style={{ marginRight: 4, fontSize: '13px', color: '#555', marginLeft: 0 }}>TOTAL</span>
                        <input
                          type="text"
                          value={(() => {
                            const monto = parseFloat(form.monto) || 0;
                            const igv = monto * 0.13;
                            return (monto + igv).toFixed(2);
                          })()}
                          readOnly
                          inputMode="decimal"
                          style={{
                            minWidth: 90,
                            display: 'inline-block',
                            fontWeight: 600,
                            color: '#1976d2',
                            fontSize: '13px',
                            marginRight: 8,
                            background: '#f5f5f5',
                            borderRadius: 3,
                            padding: '2px 8px',
                            textAlign: 'right',
                            border: '1px solid #ccc',
                          }}
                        />
                        <label htmlFor="moneda" style={{ marginBottom: 0, marginLeft: 0, whiteSpace: 'nowrap' }}>Moneda</label>
                        <select
                          id="moneda"
                          name="moneda"
                          value={form.moneda || ''}
                          onChange={handleInputChange}
                          required
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 90 }}
                        >
                          <option value="">-</option>
                          <option value="BOB">BOB</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                    </div>
                    {/* Solicitante y Gestor en la misma fila */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label htmlFor="solicitante" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Solicitante</label>
                      <input
                        type="text"
                        id="solicitante"
                        name="solicitante"
                        value={form.solicitante || ''}
                        onChange={handleInputChange}
                        style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 180 }}
                        placeholder="Nombre del solicitante"
                      />
                      <label htmlFor="gestor" style={{ marginBottom: 0, whiteSpace: 'nowrap', marginLeft: 8 }}>Gestor</label>
                      <select
                        id="gestor"
                        name="gestor"
                        value={form.gestor || ''}
                        onChange={handleInputChange}
                        style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 140 }}
                      >
                        <option value="">Seleccione...</option>
                        <option value="GESTOR1">Gestor 1</option>
                        <option value="GESTOR2">Gestor 2</option>
                        <option value="GESTOR3">Gestor 3</option>
                      </select>
                        <label htmlFor="validador" style={{ marginBottom: 0, whiteSpace: 'nowrap', marginLeft: 8 }}>Validador</label>
                        <select
                          id="validador"
                          name="validador"
                          value={form.validador || ''}
                          onChange={handleInputChange}
                          style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', width: 140 }}
                        >
                          <option value="">Seleccione...</option>
                          <option value="VALIDADOR1">Validador 1</option>
                          <option value="VALIDADOR2">Validador 2</option>
                          <option value="VALIDADOR3">Validador 3</option>
                        </select>
                    </div>
                    </div>
                  </div>
              </div>
              {/* <div className="gastos-actions">
                <button type="submit" disabled={loading} style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
                  {loading ? 'Registrando...' : 'Registrar'}
                </button>
              </div> */}
            </form>
          ) : (
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#333' }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, color: '#1976d2' }}>Resumen de la solicitud</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li><strong>Filtro Operativo:</strong> {form.filtroOperativo?.filtro?.filtroKey || '-'}</li>
                <li><strong>Detalle:</strong> {form.detalle || '-'}</li>
                <li><strong>Comentario:</strong> {form.comentario || '-'}</li>
                <li><strong>Fec. Emisión:</strong> {fechaEmision || '-'}</li>
                <li><strong>Fec. Vencimiento:</strong> {form.fechaVencimiento || '-'}</li>
                <li><strong>Responsable:</strong> {form.responsable || '-'}</li>
                <li><strong>Cuenta:</strong> {form.cuenta || '-'}</li>
                <li><strong>Tipo de Pago:</strong> {form.tipoPago || '-'}</li>
                <li><strong>Monto:</strong> {form.monto || '-'}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GastosPage;
