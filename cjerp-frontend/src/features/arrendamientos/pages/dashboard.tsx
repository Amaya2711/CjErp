import { useEffect, useState } from "react";
import ArrendamientosDashboardView from "../components/ArrendamientosDashboardView";
import { obtenerDashboardArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosDashboard } from "../../../models/arrendamientos";

const EMPTY_DASHBOARD: ArrendamientosDashboard = {
  arrendadoresActivos: 0,
  inquilinosActivos: 0,
  contratosVigentes: 0,
  obligacionesPendientes: 0,
  totalPendientePEN: 0,
  totalPendienteUSD: 0,
  pagosMesPEN: 0,
  pagosMesUSD: 0,
};

export default function ArrendamientosDashboardPage() {
  const [dashboard, setDashboard] = useState<ArrendamientosDashboard>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await obtenerDashboardArrendamientos();
      setDashboard(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  return <ArrendamientosDashboardView dashboard={dashboard} loading={loading} onRefresh={() => void cargar()} />;
}
