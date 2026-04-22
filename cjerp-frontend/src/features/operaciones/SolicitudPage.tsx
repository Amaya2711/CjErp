// src/pages/operaciones/SolicitudPage.tsx

import React, { useState } from 'react';
import { FiltroOperativoValue } from '../../models/filtroOperativo';
import { FiltroOperativoLookup } from '../../components/lookups/FiltroOperativoLookup';

const SolicitudPage: React.FC = () => {
  const [lookupValue, setLookupValue] = useState<FiltroOperativoValue>({});

  const handleLookupChange = (value: FiltroOperativoValue) => {
    setLookupValue(value);
    // Aquí puedes hacer bind al formulario, enviar a backend, etc.
  };

  return (
    <div>
      <h2>Solicitud Operativa</h2>
      <form>
        <FiltroOperativoLookup
          value={lookupValue}
          onChange={handleLookupChange}
          className="mb-3"
        />
        <div>
          <h4>Datos seleccionados:</h4>
          <pre>{JSON.stringify(lookupValue, null, 2)}</pre>
        </div>
        {/* Otros campos del formulario */}
        <button type="submit">Guardar</button>
      </form>
    </div>
  );
};

export default SolicitudPage;
