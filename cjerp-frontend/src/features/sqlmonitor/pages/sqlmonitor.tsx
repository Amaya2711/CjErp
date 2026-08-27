import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Download,
  Clock3,
  Database,
  Eye,
  Filter,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  Zap,
} from "lucide-react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import DataGridBase, { type DataGridColumn } from "../../../components/base/DataGridBase";
import { getHttpErrorMessage } from "../../../utils/httpError";
import {
  sqlMonitorService,
  type SqlMonitorAlerta,
  type SqlMonitorAnalisis,
  type SqlMonitorBloqueo,
  type SqlMonitorNetwork,
  type SqlMonitorOverhead,
  type SqlMonitorQuery,
  type SqlMonitorQueryDetalle,
  type SqlMonitorResumen,
  type SqlMonitorSesionActiva,
  type SqlMonitorTopSql,
} from "../../../api/sqlMonitorService";

type TabKey = "dashboard" | "queries" | "top-sql" | "bloqueos" | "network" | "alertas" | "overhead";

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "queries", label: "Queries" },
  { key: "top-sql", label: "Top SQL" },
  { key: "bloqueos", label: "Bloqueos" },
  { key: "network", label: "Network" },
  { key: "alertas", label: "Alertas" },
  { key: "overhead", label: "Overhead" },
];

type DetailState = {
  loading: boolean;
  query: SqlMonitorQueryDetalle | null;
  analisis: SqlMonitorAnalisis | null;
  error: string | null;
};

function formatNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-PE");
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("es-PE");
}

function levelTone(level?: string | null) {
  const normalized = (level ?? "").toUpperCase();

  if (normalized.includes("CRIT")) {
    return "error";
  }

  if (normalized.includes("ALTO")) {
    return "error";
  }

  if (normalized.includes("MED")) {
    return "info";
  }

  return "success";
}

function statusPill(level?: string | null) {
  const normalized = (level ?? "").toUpperCase();
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    minWidth: 72,
  };

  if (normalized.includes("CRIT")) {
    return { ...base, background: "#FEE2E2", color: "#B91C1C" };
  }

  if (normalized.includes("ALTO")) {
    return { ...base, background: "#FEF3C7", color: "#B45309" };
  }

  if (normalized.includes("MED")) {
    return { ...base, background: "#DBEAFE", color: "#1D4ED8" };
  }

  return { ...base, background: "#DCFCE7", color: "#166534" };
}

function normalizeSessionSortValue(value: string | number | Date | null | undefined) {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return value;
}

function compareSessionValues(
  left: SqlMonitorSesionActiva,
  right: SqlMonitorSesionActiva,
  key: keyof SqlMonitorSesionActiva
) {
  const leftValue = normalizeSessionSortValue(left[key] as string | number | Date | null | undefined);
  const rightValue = normalizeSessionSortValue(right[key] as string | number | Date | null | undefined);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  return String(leftValue).localeCompare(String(rightValue), "es", { sensitivity: "base" });
}

const refreshIntervals: Record<TabKey, number> = {
  dashboard: 60000,
  queries: 30000,
  "top-sql": 300000,
  bloqueos: 30000,
  network: 60000,
  alertas: 45000,
  overhead: 60000,
};

export default function SqlMonitorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const initialTab = location.pathname.includes("/query/") ? "queries" : "dashboard";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SqlMonitorResumen | null>(null);
  const [queries, setQueries] = useState<SqlMonitorQuery[]>([]);
  const [topSql, setTopSql] = useState<SqlMonitorTopSql[]>([]);
  const [bloqueos, setBloqueos] = useState<SqlMonitorBloqueo[]>([]);
  const [network, setNetwork] = useState<SqlMonitorNetwork[]>([]);
  const [alertas, setAlertas] = useState<SqlMonitorAlerta[]>([]);
  const [overhead, setOverhead] = useState<SqlMonitorOverhead | null>(null);
  const [loadingTab, setLoadingTab] = useState<Record<TabKey, boolean>>({
    dashboard: false,
    queries: false,
    "top-sql": false,
    bloqueos: false,
    network: false,
    alertas: false,
    overhead: false,
  });
  const [topRange, setTopRange] = useState("24h");
  const [alertFilters, setAlertFilters] = useState({
    nivel: "",
    tipoAlerta: "",
    estado: "",
    fecha: "",
  });
  const [detailState, setDetailState] = useState<DetailState>({
    loading: false,
    query: null,
    analisis: null,
    error: null,
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SqlMonitorSesionActiva[]>([]);
  const [sessionSortKey, setSessionSortKey] = useState<keyof SqlMonitorSesionActiva>("sessionId");
  const [sessionSortDirection, setSessionSortDirection] = useState<"asc" | "desc">("asc");
  const [cancelingSessionId, setCancelingSessionId] = useState<number | null>(null);

  const selectedQueryId = Number(params.id ?? 0);

  const setTabLoading = useCallback((tab: TabKey, value: boolean) => {
    setLoadingTab((current) => ({ ...current, [tab]: value }));
  }, []);

  const fetchQueries = useCallback(() => sqlMonitorService.obtenerQueries(), []);

  const loadDashboard = useCallback(async () => {
    setTabLoading("dashboard", true);
    try {
      setSummary(await sqlMonitorService.obtenerResumen());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar el dashboard del monitor."));
    } finally {
      setTabLoading("dashboard", false);
    }
  }, [setTabLoading]);

  const loadQueries = useCallback(async () => {
    setTabLoading("queries", true);
    try {
      setQueries(await fetchQueries());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudieron cargar las consultas activas."));
    } finally {
      setTabLoading("queries", false);
    }
  }, [fetchQueries, setTabLoading]);

  const loadTopSql = useCallback(async () => {
    setTabLoading("top-sql", true);
    try {
      setTopSql(await sqlMonitorService.obtenerTopSql(topRange));
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar el Top SQL."));
    } finally {
      setTabLoading("top-sql", false);
    }
  }, [setTabLoading, topRange]);

  const loadBloqueos = useCallback(async () => {
    setTabLoading("bloqueos", true);
    try {
      setBloqueos(await sqlMonitorService.obtenerBloqueos());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudieron cargar los bloqueos."));
    } finally {
      setTabLoading("bloqueos", false);
    }
  }, [setTabLoading]);

  const loadNetwork = useCallback(async () => {
    setTabLoading("network", true);
    try {
      setNetwork(await sqlMonitorService.obtenerNetwork());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudieron cargar las metricas de red."));
    } finally {
      setTabLoading("network", false);
    }
  }, [setTabLoading]);

  const loadAlertas = useCallback(async () => {
    setTabLoading("alertas", true);
    try {
      setAlertas(
        await sqlMonitorService.obtenerAlertas({
          nivel: alertFilters.nivel || undefined,
          tipoAlerta: alertFilters.tipoAlerta || undefined,
          estado: alertFilters.estado || undefined,
          fecha: alertFilters.fecha || undefined,
        })
      );
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudieron cargar las alertas."));
    } finally {
      setTabLoading("alertas", false);
    }
  }, [setTabLoading, alertFilters]);

  const loadOverhead = useCallback(async () => {
    setTabLoading("overhead", true);
    try {
      setOverhead(await sqlMonitorService.obtenerOverhead());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar el overhead del monitor."));
    } finally {
      setTabLoading("overhead", false);
    }
  }, [setTabLoading]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions(await sqlMonitorService.obtenerSesionesActivas());
    } catch (loadError) {
      setSessionsError(getHttpErrorMessage(loadError, "No se pudieron cargar las sesiones activas."));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadCurrentTab = useCallback(async () => {
    setError(null);

    switch (activeTab) {
      case "dashboard":
        await loadDashboard();
        break;
      case "queries":
        await loadQueries();
        break;
      case "top-sql":
        await loadTopSql();
        break;
      case "bloqueos":
        await loadBloqueos();
        break;
      case "network":
        await loadNetwork();
        break;
      case "alertas":
        await loadAlertas();
        break;
      case "overhead":
        await loadOverhead();
        break;
    }
  }, [
    activeTab,
    loadAlertas,
    loadBloqueos,
    loadDashboard,
    loadNetwork,
    loadOverhead,
    loadQueries,
    loadTopSql,
  ]);

  const openDetail = useCallback(
    async (id: number, analyze = false) => {
      if (!id) {
        return;
      }

      navigate(`/sqlmonitor/query/${id}`);
      setDetailVisible(true);
      setDetailState({
        loading: true,
        query: null,
        analisis: null,
        error: null,
      });

      try {
        const query = await sqlMonitorService.obtenerQueryDetalle(id);
        setDetailState({
          loading: false,
          query,
          analisis: null,
          error: null,
        });

        if (analyze) {
          const analisis = await sqlMonitorService.analizarQuery(id);
          setDetailState((current) => ({ ...current, analisis }));
        }
      } catch (loadError) {
        setDetailState({
          loading: false,
          query: null,
          analisis: null,
          error: getHttpErrorMessage(loadError, "No se pudo recuperar el detalle de la query."),
        });
      }
    },
    [navigate]
  );

  const openSessionsPanel = useCallback(async () => {
    setSessionsVisible(true);
    await loadSessions();
  }, [loadSessions]);

  const cancelSession = useCallback(
    async (sessionId: number) => {
      if (!sessionId || cancelingSessionId === sessionId) {
        return;
      }

      const confirmed = window.confirm(
        `¿Desea cancelar la sesión ${sessionId}? ` +
          "Esto envía un KILL a esa sesión y puede provocar rollback de su transacción."
      );

      if (!confirmed) {
        return;
      }

      setError(null);
      setSessionsError(null);
      setCancelingSessionId(sessionId);

      try {
        await sqlMonitorService.cancelarSesion(sessionId);

        if (activeTab === "queries") {
          await loadQueries();
        }

        if (sessionsVisible) {
          await loadSessions();
        }
      } catch (loadError) {
        setError(getHttpErrorMessage(loadError, `No se pudo cancelar la sesion ${sessionId}.`));
      } finally {
        setCancelingSessionId(null);
      }
    },
    [activeTab, cancelingSessionId, loadQueries, loadSessions, sessionsVisible]
  );

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    setDetailState({
      loading: false,
      query: null,
      analisis: null,
      error: null,
    });
    navigate("/sqlmonitor");
  }, [navigate]);

  const closeSessionsPanel = useCallback(() => {
    setSessionsVisible(false);
    setSessionsError(null);
  }, []);

  const handleSessionSortChange = useCallback((key: string) => {
    const nextKey = key as keyof SqlMonitorSesionActiva;
    setSessionSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setSessionSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return currentKey;
      }

      setSessionSortDirection("asc");
      return nextKey;
    });
  }, []);

  const sessionRows = useMemo(() => {
    const rows = [...sessions];
    rows.sort((left, right) => {
      const comparison = compareSessionValues(left, right, sessionSortKey);
      return sessionSortDirection === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [sessionSortDirection, sessionSortKey, sessions]);

  const exportSessionsToExcel = useCallback(async () => {
    if (sessionRows.length === 0) {
      return;
    }

    const XLSX = await import("xlsx");
    const exportRows = sessionRows.map((row) => ({
      SessionId: row.sessionId ?? "",
      DatabaseName: row.databaseName || "",
      Status: row.status || "",
      CpuTimeMs: row.cpuTimeMs,
      ElapsedTimeMs: row.elapsedTimeMs,
      Reads: row.reads,
      Writes: row.writes,
      LogicalReads: row.logicalReads,
      WaitType: row.waitType || "",
      BlockingSessionId: row.blockingSessionId ?? "",
      HostName: row.hostName || "",
      ProgramName: row.programName || "",
      LoginName: row.loginName || "",
      LoginTime: formatDateTime(row.loginTime),
      LastRequestStartTime: formatDateTime(row.lastRequestStartTime),
      LastWaitType: row.lastRequestEndTime || "",
      OpenTransactionCount: row.openTransactionCount,
      Nivel: row.nivel || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sesiones activas");
    XLSX.writeFile(workbook, `sqlmonitor_sesiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [sessionRows]);

  useEffect(() => {
    void loadCurrentTab();
  }, [loadCurrentTab]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadCurrentTab();
    }, refreshIntervals[activeTab]);

    return () => window.clearInterval(interval);
  }, [activeTab, loadCurrentTab]);

  useEffect(() => {
    if (selectedQueryId > 0) {
      setActiveTab("queries");
      void openDetail(selectedQueryId, false);
      return;
    }

    setDetailVisible(false);
  }, [selectedQueryId, openDetail]);

  const dashboardCards = useMemo(
    () => [
      { label: "Estado servidor", value: summary?.estadoServidor ?? "-", icon: Database },
      { label: "Sesiones usuario", value: formatNumber(summary?.sesionesUsuario), icon: Eye, onClick: openSessionsPanel },
      { label: "Requests activos", value: formatNumber(summary?.requestsActivos), icon: Zap },
      { label: "Requests bloqueados", value: formatNumber(summary?.requestsBloqueados), icon: ShieldAlert },
      { label: "Conexiones", value: formatNumber(summary?.conexiones), icon: ArrowRight },
      { label: "Memoria SQL", value: `${formatDecimal(summary?.memoriaSqlMb)} MB`, icon: TimerReset },
      { label: "Memoria disponible", value: `${formatDecimal(summary?.memoriaDisponibleMb)} MB`, icon: Clock3 },
      { label: "PLE", value: formatDecimal(summary?.pageLifeExpectancySegundos), icon: RefreshCw },
      { label: "Alertas pendientes", value: formatNumber(summary?.alertasPendientes), icon: AlertTriangle },
      { label: "Sesiones monitor", value: formatNumber(summary?.sesionesMonitor), icon: Database },
      { label: "Requests monitor", value: formatNumber(summary?.requestsMonitor), icon: Zap },
    ],
    [openSessionsPanel, summary]
  );

  const sessionColumns = useMemo<DataGridColumn<SqlMonitorSesionActiva>[]>(
    () => [
      { key: "sessionId", header: "SessionId", sortable: true, render: (row) => row.sessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", sortable: true, render: (row) => row.databaseName || "-" },
      { key: "status", header: "Status", sortable: true, render: (row) => row.status || "-" },
      { key: "cpuTimeMs", header: "CpuTimeMs", sortable: true, align: "right", render: (row) => formatNumber(row.cpuTimeMs) },
      { key: "elapsedTimeMs", header: "ElapsedTimeMs", sortable: true, align: "right", render: (row) => formatNumber(row.elapsedTimeMs) },
      { key: "reads", header: "Reads", sortable: true, align: "right", render: (row) => formatNumber(row.reads) },
      { key: "writes", header: "Writes", sortable: true, align: "right", render: (row) => formatNumber(row.writes) },
      { key: "logicalReads", header: "LogicalReads", sortable: true, align: "right", render: (row) => formatNumber(row.logicalReads) },
      { key: "waitType", header: "WaitType", sortable: true, render: (row) => row.waitType || "-" },
      { key: "blockingSessionId", header: "BlockingSessionId", sortable: true, render: (row) => row.blockingSessionId ?? "-" },
      { key: "hostName", header: "HostName", sortable: true, render: (row) => row.hostName || "-" },
      { key: "programName", header: "ProgramName", sortable: true, render: (row) => row.programName || "-" },
      { key: "loginName", header: "LoginName", sortable: true, render: (row) => row.loginName || "-" },
      { key: "loginTime", header: "LoginTime", sortable: true, render: (row) => formatDateTime(row.loginTime) },
      { key: "lastRequestStartTime", header: "LastRequestStartTime", sortable: true, render: (row) => formatDateTime(row.lastRequestStartTime) },
      { key: "openTransactionCount", header: "OpenTransactionCount", sortable: true, align: "right", render: (row) => formatNumber(row.openTransactionCount) },
      { key: "nivel", header: "Nivel", sortable: true, render: (row) => <span style={statusPill(row.nivel)}>{row.nivel || "-"}</span> },
    ],
    []
  );

  const queryColumns = useMemo<DataGridColumn<SqlMonitorQuery>[]>(
    () => [
      { key: "fechaHora", header: "FechaHora", render: (row) => formatDateTime(row.fechaHora) },
      { key: "sessionId", header: "SessionId", render: (row) => row.sessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", render: (row) => row.databaseName || "-" },
      { key: "status", header: "Status", render: (row) => row.status || "-" },
      { key: "command", header: "Command", render: (row) => row.command || "-" },
      { key: "cpuTimeMs", header: "CpuTimeMs", align: "right", render: (row) => formatNumber(row.cpuTimeMs) },
      { key: "elapsedTimeMs", header: "ElapsedTimeMs", align: "right", render: (row) => formatNumber(row.elapsedTimeMs) },
      { key: "reads", header: "Reads", align: "right", render: (row) => formatNumber(row.reads) },
      { key: "writes", header: "Writes", align: "right", render: (row) => formatNumber(row.writes) },
      { key: "logicalReads", header: "LogicalReads", align: "right", render: (row) => formatNumber(row.logicalReads) },
      { key: "cantidadFilas", header: "CantidadFilas", align: "right", render: (row) => formatNumber(row.cantidadFilas) },
      { key: "waitType", header: "WaitType", render: (row) => row.waitType || "-" },
      { key: "waitTimeMs", header: "WaitTimeMs", align: "right", render: (row) => formatNumber(row.waitTimeMs) },
      { key: "blockingSessionId", header: "BlockingSessionId", render: (row) => row.blockingSessionId ?? "-" },
      { key: "hostName", header: "HostName", render: (row) => row.hostName || "-" },
      { key: "programName", header: "ProgramName", render: (row) => row.programName || "-" },
      { key: "loginName", header: "LoginName", render: (row) => row.loginName || "-" },
      { key: "nivel", header: "Nivel", render: (row) => <span style={statusPill(row.nivel)}>{row.nivel || "-"}</span> },
    ],
    []
  );

  const topSqlColumns = useMemo<DataGridColumn<SqlMonitorTopSql>[]>(
    () => [
      { key: "executionCount", header: "ExecutionCount", align: "right", render: (row) => formatNumber(row.executionCount) },
      { key: "cpuTotalMs", header: "CpuTotalMs", align: "right", render: (row) => formatNumber(row.cpuTotalMs) },
      { key: "cpuPromedioMs", header: "CpuPromedioMs", align: "right", render: (row) => formatNumber(row.cpuPromedioMs) },
      { key: "tiempoTotalMs", header: "TiempoTotalMs", align: "right", render: (row) => formatNumber(row.tiempoTotalMs) },
      { key: "tiempoPromedioMs", header: "TiempoPromedioMs", align: "right", render: (row) => formatNumber(row.tiempoPromedioMs) },
      { key: "logicalReadsTotal", header: "LogicalReadsTotal", align: "right", render: (row) => formatNumber(row.logicalReadsTotal) },
      { key: "logicalReadsPromedio", header: "LogicalReadsPromedio", align: "right", render: (row) => formatNumber(row.logicalReadsPromedio) },
      { key: "logicalWritesTotal", header: "LogicalWritesTotal", align: "right", render: (row) => formatNumber(row.logicalWritesTotal) },
      { key: "rowsTotal", header: "RowsTotal", align: "right", render: (row) => formatNumber(row.rowsTotal) },
      { key: "lastExecutionTime", header: "LastExecutionTime", render: (row) => formatDateTime(row.lastExecutionTime) },
      { key: "sqlText", header: "SqlText", render: (row) => row.sqlText || "-" },
    ],
    []
  );

  const bloqueoColumns = useMemo<DataGridColumn<SqlMonitorBloqueo>[]>(
    () => [
      { key: "sessionId", header: "SessionId", render: (row) => row.sessionId ?? "-" },
      { key: "blockingSessionId", header: "BlockingSessionId", render: (row) => row.blockingSessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", render: (row) => row.databaseName || "-" },
      { key: "waitType", header: "WaitType", render: (row) => row.waitType || "-" },
      { key: "waitTimeMs", header: "WaitTimeMs", align: "right", render: (row) => formatNumber(row.waitTimeMs) },
      { key: "waitResource", header: "WaitResource", render: (row) => row.waitResource || "-" },
      { key: "hostName", header: "HostName", render: (row) => row.hostName || "-" },
      { key: "programName", header: "ProgramName", render: (row) => row.programName || "-" },
      { key: "loginName", header: "LoginName", render: (row) => row.loginName || "-" },
      { key: "nivel", header: "Nivel", render: (row) => <span style={statusPill(row.nivel)}>{row.nivel || "-"}</span> },
      { key: "sqlText", header: "SqlText", render: (row) => row.sqlText || "-" },
    ],
    []
  );

  const networkColumns = useMemo<DataGridColumn<SqlMonitorNetwork>[]>(
    () => [
      { key: "fechaHora", header: "FechaHora", render: (row) => formatDateTime(row.fechaHora) },
      { key: "sessionId", header: "SessionId", render: (row) => row.sessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", render: (row) => row.databaseName || "-" },
      { key: "waitTimeMs", header: "WaitTimeMs", align: "right", render: (row) => formatNumber(row.waitTimeMs) },
      { key: "elapsedTimeMs", header: "ElapsedTimeMs", align: "right", render: (row) => formatNumber(row.elapsedTimeMs) },
      { key: "cpuTimeMs", header: "CpuTimeMs", align: "right", render: (row) => formatNumber(row.cpuTimeMs) },
      { key: "cantidadFilas", header: "CantidadFilas", align: "right", render: (row) => formatNumber(row.cantidadFilas) },
      { key: "reads", header: "Reads", align: "right", render: (row) => formatNumber(row.reads) },
      { key: "writes", header: "Writes", align: "right", render: (row) => formatNumber(row.writes) },
      { key: "logicalReads", header: "LogicalReads", align: "right", render: (row) => formatNumber(row.logicalReads) },
      { key: "hostName", header: "HostName", render: (row) => row.hostName || "-" },
      { key: "programName", header: "ProgramName", render: (row) => row.programName || "-" },
      { key: "loginName", header: "LoginName", render: (row) => row.loginName || "-" },
      { key: "sqlText", header: "SqlText", render: (row) => row.sqlText || "-" },
    ],
    []
  );

  const alertaColumns = useMemo<DataGridColumn<SqlMonitorAlerta>[]>(
    () => [
      { key: "fechaHora", header: "FechaHora", render: (row) => formatDateTime(row.fechaHora) },
      { key: "tipoAlerta", header: "TipoAlerta", render: (row) => row.tipoAlerta || "-" },
      { key: "nivel", header: "Nivel", render: (row) => <span style={statusPill(row.nivel)}>{row.nivel || "-"}</span> },
      { key: "sessionId", header: "SessionId", render: (row) => row.sessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", render: (row) => row.databaseName || "-" },
      { key: "titulo", header: "Titulo", render: (row) => row.titulo || "-" },
      { key: "detalle", header: "Detalle", render: (row) => row.detalle || "-" },
      { key: "estado", header: "Estado", render: (row) => row.estado || "-" },
      { key: "analizadoIA", header: "AnalizadoIA", render: (row) => (row.analizadoIA ? "SI" : "NO") },
    ],
    []
  );

  const detailColumns = useMemo<DataGridColumn<SqlMonitorQueryDetalle>[]>(
    () => [
      { key: "fechaHora", header: "FechaHora", render: (row) => formatDateTime(row.fechaHora) },
      { key: "sessionId", header: "SessionId", render: (row) => row.sessionId ?? "-" },
      { key: "databaseName", header: "DatabaseName", render: (row) => row.databaseName || "-" },
      { key: "status", header: "Status", render: (row) => row.status || "-" },
      { key: "command", header: "Command", render: (row) => row.command || "-" },
      { key: "cpuTimeMs", header: "CpuTimeMs", align: "right", render: (row) => formatNumber(row.cpuTimeMs) },
      { key: "elapsedTimeMs", header: "ElapsedTimeMs", align: "right", render: (row) => formatNumber(row.elapsedTimeMs) },
      { key: "reads", header: "Reads", align: "right", render: (row) => formatNumber(row.reads) },
      { key: "writes", header: "Writes", align: "right", render: (row) => formatNumber(row.writes) },
      { key: "logicalReads", header: "LogicalReads", align: "right", render: (row) => formatNumber(row.logicalReads) },
      { key: "cantidadFilas", header: "CantidadFilas", align: "right", render: (row) => formatNumber(row.cantidadFilas) },
      { key: "waitType", header: "WaitType", render: (row) => row.waitType || "-" },
      { key: "waitTimeMs", header: "WaitTimeMs", align: "right", render: (row) => formatNumber(row.waitTimeMs) },
      { key: "waitResource", header: "WaitResource", render: (row) => row.waitResource || "-" },
      { key: "blockingSessionId", header: "BlockingSessionId", render: (row) => row.blockingSessionId ?? "-" },
      { key: "hostName", header: "HostName", render: (row) => row.hostName || "-" },
      { key: "programName", header: "ProgramName", render: (row) => row.programName || "-" },
      { key: "loginName", header: "LoginName", render: (row) => row.loginName || "-" },
      { key: "nivel", header: "Nivel", render: (row) => <span style={statusPill(row.nivel)}>{row.nivel || "-"}</span> },
    ],
    []
  );

  const activeSection = useMemo(() => TAB_ORDER.find((item) => item.key === activeTab)?.label ?? "Dashboard", [activeTab]);

  const renderDashboard = () => (
    <div style={styles.grid}>
      {dashboardCards.map((card) => {
        const Icon = card.icon;
        const cardBody = (
          <AppCard key={card.label} style={styles.kpiCard}>
            <div style={styles.kpiHeader}>
              <div style={styles.kpiIconWrap}>
                <Icon size={18} />
              </div>
              <div style={styles.kpiLabel}>{card.label}</div>
            </div>
            <div style={styles.kpiValue}>{card.value}</div>
          </AppCard>
        );

        if (card.onClick) {
          return (
            <div
              key={card.label}
              role="button"
              tabIndex={0}
              style={styles.clickableCard}
              onClick={() => void card.onClick?.()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void card.onClick?.();
                }
              }}
            >
              {cardBody}
            </div>
          );
        }

        return (
          <AppCard key={card.label} style={styles.kpiCard}>
            <div style={styles.kpiHeader}>
              <div style={styles.kpiIconWrap}>
                <Icon size={18} />
              </div>
              <div style={styles.kpiLabel}>{card.label}</div>
            </div>
            <div style={styles.kpiValue}>{card.value}</div>
          </AppCard>
        );
      })}
      <AppCard title="Estado general">
        <div style={styles.stateRow}>
          <span style={statusPill(summary?.semaforo)}>{summary?.semaforo ?? "NORMAL"}</span>
          <span style={styles.stateHint}>{summary?.observacion ?? "Monitoreo activo con capturas automáticas."}</span>
        </div>
      </AppCard>
    </div>
  );

  const renderQueries = () => (
    <AppCard
      title="Consultas activas"
      actions={
        <button style={styles.iconButton} onClick={() => void loadQueries()}>
          <RefreshCw size={16} />
          Refrescar
        </button>
      }
    >
      <DataGridBase
        columns={queryColumns}
        rows={queries}
        loading={loadingTab.queries}
        loadingMessage="Cargando consultas activas..."
        getRowKey={(row) => row.id}
        rowActions={(row) => (
          <div style={styles.rowActions}>
            <button style={styles.smallButton} onClick={() => void openDetail(row.id, false)}>
              <Eye size={14} />
              Ver detalle
            </button>
            <button style={styles.smallButtonPrimary} onClick={() => void openDetail(row.id, true)}>
              <BrainCircuit size={14} />
              Analizar con IA
            </button>
            {row.sessionId ? (
              <button
                style={styles.smallButtonDanger}
                onClick={() => void cancelSession(row.sessionId ?? 0)}
                disabled={cancelingSessionId === row.sessionId}
              >
                <ShieldAlert size={14} />
                {cancelingSessionId === row.sessionId ? "Cancelando..." : "Cancelar"}
              </button>
            ) : null}
          </div>
        )}
      />
    </AppCard>
  );

  const renderTopSql = () => (
    <AppCard
      title="Top SQL"
      actions={
        <div style={styles.filterGroup}>
          {(["1h", "6h", "12h", "24h", "7d"] as const).map((range) => (
            <button
              key={range}
              style={topRange === range ? styles.filterActive : styles.filterButton}
              onClick={() => setTopRange(range)}
            >
              {range === "1h" ? "Última hora" : range === "6h" ? "6 horas" : range === "12h" ? "12 horas" : range === "24h" ? "24 horas" : "7 días"}
            </button>
          ))}
          <button style={styles.iconButton} onClick={() => void loadTopSql()}>
            <RefreshCw size={16} />
            Refrescar
          </button>
        </div>
      }
    >
      <DataGridBase
        columns={topSqlColumns}
        rows={topSql}
        loading={loadingTab["top-sql"]}
        loadingMessage="Cargando Top SQL..."
        getRowKey={(row) => row.id}
      />
    </AppCard>
  );

  const renderBloqueos = () => (
    <AppCard
      title="Bloqueos"
      actions={
        <button style={styles.iconButton} onClick={() => void loadBloqueos()}>
          <RefreshCw size={16} />
          Refrescar
        </button>
      }
    >
      <AppStatusMessage tone="info" style={{ marginBottom: 16 }}>
        Bloqueos mayores a 15s, 30s o 60s quedan resaltados en el detalle visual de la fila.
      </AppStatusMessage>
      <DataGridBase
        columns={bloqueoColumns}
        rows={bloqueos}
        loading={loadingTab.bloqueos}
        loadingMessage="Cargando bloqueos..."
        getRowKey={(row) => row.id}
      />
    </AppCard>
  );

  const renderNetwork = () => (
    <AppCard
      title="Network"
      actions={
        <button style={styles.iconButton} onClick={() => void loadNetwork()}>
          <RefreshCw size={16} />
          Refrescar
        </button>
      }
    >
      <AppStatusMessage tone="info" style={{ marginBottom: 16 }}>
        Posible cuello de botella SQL / aplicación / red. ASYNC_NETWORK_IO no implica por si solo una red física saturada.
      </AppStatusMessage>
      <DataGridBase
        columns={networkColumns}
        rows={network}
        loading={loadingTab.network}
        loadingMessage="Cargando metricas de red..."
        getRowKey={(row) => row.id}
      />
    </AppCard>
  );

  const renderAlertas = () => (
    <AppCard
      title="Alertas"
      actions={
        <div style={styles.filterGroup}>
          <select style={styles.select} value={alertFilters.nivel} onChange={(event) => setAlertFilters((current) => ({ ...current, nivel: event.target.value }))}>
            <option value="">Nivel</option>
            <option value="NORMAL">NORMAL</option>
            <option value="ALERTA">ALERTA</option>
            <option value="CRITICO">CRITICO</option>
          </select>
          <select style={styles.select} value={alertFilters.estado} onChange={(event) => setAlertFilters((current) => ({ ...current, estado: event.target.value }))}>
            <option value="">Estado</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="ATENDIDO">ATENDIDO</option>
          </select>
          <input
            type="date"
            style={styles.select}
            value={alertFilters.fecha}
            onChange={(event) => setAlertFilters((current) => ({ ...current, fecha: event.target.value }))}
          />
          <button style={styles.filterButton} onClick={() => setAlertFilters({ nivel: "", tipoAlerta: "", estado: "", fecha: "" })}>
            Limpiar
          </button>
          <button style={styles.iconButton} onClick={() => void loadAlertas()}>
            <Filter size={16} />
            Aplicar filtros
          </button>
        </div>
      }
    >
      <DataGridBase
        columns={alertaColumns}
        rows={alertas}
        loading={loadingTab.alertas}
        loadingMessage="Cargando alertas..."
        getRowKey={(row) => row.id}
      />
    </AppCard>
  );

  const renderOverhead = () => {
    const level = overhead?.nivel ?? "NORMAL";

    return (
      <div style={styles.overheadGrid}>
        <AppCard title="Overhead del monitor">
          <div style={styles.overheadKpiGrid}>
            {[
              { label: "Snapshots últimos 5 min", value: formatNumber(overhead?.snapshotsUltimos5Min) },
              { label: "Queries guardadas últimos 5 min", value: formatNumber(overhead?.queriesGuardadasUltimos5Min) },
              { label: "Bloqueos guardados últimos 5 min", value: formatNumber(overhead?.bloqueosGuardadosUltimos5Min) },
              { label: "Sesiones monitor", value: formatNumber(overhead?.sesionesMonitor) },
              { label: "Requests monitor activos", value: formatNumber(overhead?.requestsMonitorActivos) },
              { label: "Cpu monitor actual ms", value: formatDecimal(overhead?.cpuMonitorActualMs) },
              { label: "Logical reads monitor actual", value: formatDecimal(overhead?.logicalReadsMonitorActual) },
              { label: "Reads monitor actual", value: formatDecimal(overhead?.readsMonitorActual) },
              { label: "Writes monitor actual", value: formatDecimal(overhead?.writesMonitorActual) },
            ].map((item) => (
              <div key={item.label} style={styles.overheadCard}>
                <div style={styles.overheadLabel}>{item.label}</div>
                <div style={styles.overheadValue}>{item.value}</div>
              </div>
            ))}
          </div>
        </AppCard>
        <AppCard title="Indicador general">
          <span style={statusPill(level)}>{level}</span>
          <p style={styles.overheadNote}>
            {overhead?.observacion ?? "El propio monitor debe mantenerse ligero y predecible."}
          </p>
        </AppCard>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "queries":
        return renderQueries();
      case "top-sql":
        return renderTopSql();
      case "bloqueos":
        return renderBloqueos();
      case "network":
        return renderNetwork();
      case "alertas":
        return renderAlertas();
      case "overhead":
        return renderOverhead();
    }
  };

  const detailQuery = detailState.query;

  return (
    <AppPage title="SQL Monitor / DBA Inteligente" fillHeight>
      <div style={styles.shell}>
        <div style={styles.toolbar}>
          <div>
            <div style={styles.eyebrow}>DBA Inteligente</div>
            <h1 style={styles.title}>SQL Monitor</h1>
            <div style={styles.subtitle}>Supervisión de performance, bloqueos, waits, red y overhead del monitor.</div>
          </div>
          <div style={styles.tabRow}>
            {TAB_ORDER.map((tab) => (
              <button
                key={tab.key}
                style={activeTab === tab.key ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <button style={styles.iconButton} onClick={() => void loadCurrentTab()}>
              <RefreshCw size={16} />
              Refrescar
            </button>
          </div>
        </div>

        {error ? <AppStatusMessage tone="error" style={{ marginBottom: 16 }}>{error}</AppStatusMessage> : null}
        {renderContent()}

        {detailVisible && (
          <div style={styles.modalBackdrop} onClick={closeDetail}>
            <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.eyebrow}>Detalle de consulta</div>
                  <h2 style={styles.modalTitle}>Query #{detailQuery?.id ?? params.id}</h2>
                </div>
                <div style={styles.modalActions}>
                  <button style={styles.smallButtonPrimary} onClick={() => detailQuery && void sqlMonitorService.analizarQuery(detailQuery.id).then((analisis) => setDetailState((current) => ({ ...current, analisis })))} disabled={!detailQuery}>
                    <BrainCircuit size={14} />
                    Analizar con IA
                  </button>
                  <button style={styles.smallButton} onClick={closeDetail}>
                    Cerrar
                  </button>
                </div>
              </div>

              {detailState.loading ? (
                <AppStatusMessage tone="info">Cargando detalle...</AppStatusMessage>
              ) : detailState.error ? (
                <AppStatusMessage tone="error">{detailState.error}</AppStatusMessage>
              ) : detailQuery ? (
                <>
                  <DataGridBase
                    columns={detailColumns}
                    rows={[detailQuery]}
                    getRowKey={(row) => row.id}
                    loading={false}
                  />

                  <AppCard title="SqlText">
                    <pre style={styles.sqlText}>{detailQuery.sqlText || "-"}</pre>
                  </AppCard>

                  <AppCard title="Análisis IA">
                    {detailState.analisis ? (
                      <div style={styles.analysisBox}>
                        <div style={styles.analysisLine}>
                          <strong>Nivel de riesgo:</strong> {detailState.analisis.nivelRiesgo || "-"}
                        </div>
                        <div style={styles.analysisLine}>
                          <strong>Diagnóstico:</strong> {detailState.analisis.diagnostico || "-"}
                        </div>
                        <div style={styles.analysisLine}>
                          <strong>Causa probable:</strong> {detailState.analisis.causaProbable || "-"}
                        </div>
                        <div style={styles.analysisLine}>
                          <strong>Recomendaciones:</strong>
                          <ul>
                            {(detailState.analisis.recomendaciones || []).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div style={styles.analysisLine}>
                          <strong>Índices potenciales:</strong>
                          <ul>
                            {(detailState.analisis.indicesPotenciales || []).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div style={styles.analysisLine}>
                          <strong>Observaciones:</strong>
                          <ul>
                            {(detailState.analisis.observaciones || []).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <AppStatusMessage tone="info">
                        El análisis IA se ejecuta solo cuando el usuario lo solicita.
                      </AppStatusMessage>
                    )}
                  </AppCard>
                </>
              ) : null}
            </div>
          </div>
        )}

        {sessionsVisible && (
          <div style={styles.modalBackdrop} onClick={closeSessionsPanel}>
            <div style={styles.modalResizable} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div>
                  <div style={styles.eyebrow}>Sesiones activas</div>
                  <h2 style={styles.modalTitle}>Relación general de sesiones</h2>
                  <div style={styles.subtitle}>
                    Vista general de las sesiones activas del servidor para dar contexto de uso.
                  </div>
                </div>
                <div style={styles.modalActions}>
                  <button
                    style={styles.smallButtonPrimary}
                    onClick={() => void exportSessionsToExcel()}
                    disabled={sessionsLoading || sessionRows.length === 0}
                  >
                    <Download size={14} />
                    Exportar
                  </button>
                  <button style={styles.smallButton} onClick={closeSessionsPanel}>
                    Cerrar
                  </button>
                </div>
              </div>

              {sessionsError ? (
                <AppStatusMessage tone="error">{sessionsError}</AppStatusMessage>
              ) : (
                <AppStatusMessage tone="info" style={{ marginBottom: 16 }}>
                  {sessionsLoading
                    ? "Cargando sesiones activas..."
                    : "La lista muestra información general de cada sesión activa."}
                </AppStatusMessage>
              )}

              <DataGridBase
                columns={sessionColumns}
                rows={sessionRows}
                loading={sessionsLoading}
                loadingMessage="Cargando sesiones activas..."
                emptyMessage="No hay sesiones activas para mostrar."
                getRowKey={(row) => row.id}
                rowActions={(row) =>
                  row.sessionId ? (
                    <div style={styles.rowActions}>
                      <button
                        style={styles.smallButtonDanger}
                        onClick={() => void cancelSession(row.sessionId ?? 0)}
                        disabled={cancelingSessionId === row.sessionId}
                      >
                        <ShieldAlert size={14} />
                        {cancelingSessionId === row.sessionId ? "Cancelando..." : "Cancelar"}
                      </button>
                    </div>
                  ) : null
                }
                sortKey={sessionSortKey}
                sortDirection={sessionSortDirection}
                onSortChange={handleSessionSortChange}
                maxHeight="55vh"
              />
            </div>
          </div>
        )}
      </div>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 0,
  },
  toolbar: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    color: "#6D28D9",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#0F172A",
  },
  subtitle: {
    color: "#475569",
    fontSize: 14,
    marginTop: 8,
  },
  tabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  tab: {
    border: "1px solid #CBD5E1",
    background: "#FFF",
    color: "#334155",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  tabActive: {
    border: "1px solid #7C3AED",
    background: "#7C3AED",
    color: "#FFF",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #CBD5E1",
    background: "#FFF",
    color: "#334155",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  filterGroup: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  filterButton: {
    border: "1px solid #CBD5E1",
    background: "#FFF",
    color: "#334155",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  filterActive: {
    border: "1px solid #7C3AED",
    background: "#F3E8FF",
    color: "#6D28D9",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  select: {
    border: "1px solid #CBD5E1",
    background: "#FFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 600,
    minHeight: 38,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },
  kpiCard: {
    minHeight: 128,
    display: "flex",
    flexDirection: "column",
  },
  clickableCard: {
    cursor: "pointer",
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  kpiHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F3E8FF",
    color: "#6D28D9",
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: "#334155",
    lineHeight: 1.15,
  },
  kpiValue: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: 900,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  stateRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  stateHint: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 600,
  },
  rowActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  smallButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #CBD5E1",
    background: "#FFF",
    color: "#334155",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  smallButtonPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #7C3AED",
    background: "#7C3AED",
    color: "#FFF",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  smallButtonDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #EF4444",
    background: "#FFF",
    color: "#DC2626",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  overheadGrid: {
    display: "grid",
    gridTemplateColumns: "1.5fr 0.8fr",
    gap: 12,
  },
  overheadKpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  overheadCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 14,
    background: "#FFF",
  },
  overheadLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },
  overheadValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  overheadNote: {
    marginTop: 12,
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.5,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 80,
    padding: 20,
  },
  modal: {
    width: "min(1320px, 96vw)",
    maxHeight: "92vh",
    overflow: "auto",
    background: "#FFF",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 24px 60px rgba(15,23,42,0.3)",
  },
  modalResizable: {
    width: "min(1320px, 96vw)",
    height: "min(92vh, 760px)",
    minWidth: 900,
    minHeight: 520,
    maxWidth: "98vw",
    maxHeight: "96vh",
    overflow: "hidden",
    background: "#FFF",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 24px 60px rgba(15,23,42,0.3)",
    resize: "both",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 16,
    flexWrap: "wrap",
  },
  modalTitle: {
    margin: 0,
    fontSize: 22,
    lineHeight: 1.2,
    color: "#0F172A",
  },
  modalActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  sqlText: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 12,
    lineHeight: 1.5,
    color: "#0F172A",
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 14,
    maxHeight: 280,
    overflow: "auto",
  },
  analysisBox: {
    display: "grid",
    gap: 10,
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 1.6,
  },
  analysisLine: {
    display: "grid",
    gap: 4,
  },
};
