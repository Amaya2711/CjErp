import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DataGridBase, { type DataGridColumn } from "../../../components/base/DataGridBase";
import type { AiChatResponse } from "../types";

const colors = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed"];
const value = (item: Record<string, unknown>, key: string) => item[key];
function display(input: unknown) { if (input === null || input === undefined || input === "") return "-"; if (typeof input === "number") return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(input); return String(input); }

export default function AiResultVisual({ result }: { result: AiChatResponse }) {
  if (!result.data?.length) return null;
  const keys = Object.keys(result.data[0]);
  const columns: DataGridColumn<Record<string, unknown>>[] = keys.map((key) => ({ key, header: key, render: (row) => display(row[key]) }));
  const chartData = result.data.slice(0, 30);
  const labelKey = keys[0]; const numericKey = keys.find((key) => chartData.some((item) => typeof item[key] === "number"));
  if (result.suggestedVisualization === "kpi") return <div className="ai-kpi-grid">{chartData.slice(0, 4).map((item, index) => <div className="ai-kpi" key={String(item[labelKey] ?? index)}><span>{display(item[labelKey])}</span><strong>{display(item[numericKey || keys[1] || labelKey])}</strong></div>)}</div>;
  if ((result.suggestedVisualization === "bar" || result.suggestedVisualization === "line") && numericKey) return <div className="ai-chart"><ResponsiveContainer width="100%" height={300}>{result.suggestedVisualization === "bar" ? <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={labelKey} /><YAxis /><Tooltip /><Bar dataKey={numericKey} fill="#0f766e" radius={[5, 5, 0, 0]} /></BarChart> : <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={labelKey} /><YAxis /><Tooltip /><Line type="monotone" dataKey={numericKey} stroke="#0f766e" strokeWidth={3} /></LineChart>}</ResponsiveContainer></div>;
  if (result.suggestedVisualization === "pie" && numericKey) return <div className="ai-chart"><ResponsiveContainer width="100%" height={300}><PieChart><Tooltip /><Pie data={chartData} dataKey={numericKey} nameKey={labelKey} outerRadius={105} label>{chartData.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie></PieChart></ResponsiveContainer></div>;
  if (result.suggestedVisualization === "comparison") return <div className="ai-comparison-grid">{chartData.slice(0, 3).map((item, index) => <div className="ai-comparison" key={index}><span>{display(item[labelKey])}</span><strong>{display(item[numericKey || keys[1] || labelKey])}</strong>{keys[2] ? <small>{display(item[keys[2]])}</small> : null}</div>)}</div>;
  return <DataGridBase columns={columns} rows={result.data} getRowKey={(row) => JSON.stringify(row)} maxHeight={360} emptyMessage="No encontré registros para los criterios solicitados." />;
}
