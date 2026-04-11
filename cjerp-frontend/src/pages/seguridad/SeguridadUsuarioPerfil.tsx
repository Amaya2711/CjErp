import { useEffect, useMemo, useState } from "react";
import {
	perfilesService,
	type PerfilDto,
} from "../../features/seguridad/services/perfilesService";
import {
	usuariosService,
	type UsuarioDto,
} from "../../features/seguridad/services/usuariosService";
import { menuService } from "../../features/seguridad/services/menuService";

export default function SeguridadUsuarioPerfilPage() {
	const [usuarios, setUsuarios] = useState<UsuarioDto[]>([]);
	const [perfiles, setPerfiles] = useState<PerfilDto[]>([]);

	const [usuarioSeleccionado, setUsuarioSeleccionado] = useState("");
	const [perfilSeleccionado, setPerfilSeleccionado] = useState<number | "">("");

	const [busqueda, setBusqueda] = useState("");
	const [cargando, setCargando] = useState(false);
	const [guardando, setGuardando] = useState(false);
	const [mensaje, setMensaje] = useState("");
	const [error, setError] = useState("");

	const usuariosFiltrados = useMemo(() => {
		const texto = busqueda.trim().toUpperCase();
		if (!texto) return usuarios;

		return usuarios.filter(
			(u) =>
				u.idUsuario.toUpperCase().includes(texto) ||
				u.nombreEmpleado.toUpperCase().includes(texto)
		);
	}, [usuarios, busqueda]);

	const cargarDatos = async () => {
		try {
			setCargando(true);
			setError("");
			setMensaje("");

			const [usuariosData, perfilesData] = await Promise.all([
				usuariosService.listarUsuarios(),
				perfilesService.listarPerfiles(),
			]);

			setUsuarios(usuariosData);
			setPerfiles(perfilesData);
		} catch (err: any) {
			const apiMessage =
				err?.response?.data?.message ||
				err?.response?.data ||
				"No se pudieron cargar usuarios y perfiles.";

			setError(String(apiMessage));
		} finally {
			setCargando(false);
		}
	};

	useEffect(() => {
		void cargarDatos();
	}, []);

	const guardar = async () => {
		if (!usuarioSeleccionado) {
			setError("Debe seleccionar un usuario.");
			return;
		}

		if (!perfilSeleccionado) {
			setError("Debe seleccionar un perfil.");
			return;
		}

		try {
			setGuardando(true);
			setError("");
			setMensaje("");

			const response = await menuService.sincronizarPerfilUsuario({
				idPerfil: Number(perfilSeleccionado),
				idUsuario: usuarioSeleccionado,
			});

			const filasProcesadas = Number(response?.filasProcesadas ?? 0);

			setMensaje(
				`Asignación ejecutada correctamente. Filas procesadas: ${filasProcesadas}.`
			);
		} catch (err: any) {
			const apiMessage =
				err?.response?.data?.message ||
				err?.response?.data ||
				"No se pudo guardar la asignación de usuario/perfil.";

			setError(String(apiMessage));
		} finally {
			setGuardando(false);
		}
	};

	return (
		<section style={styles.page}>
			<h1 style={styles.title}>Seguridad - Usuario Perfil</h1>

			<div style={styles.toolbar}>
				<input
					style={styles.searchInput}
					placeholder="Buscar por usuario o nombre..."
					value={busqueda}
					onChange={(e) => setBusqueda(e.target.value)}
				/>

				<select
					style={styles.select}
					value={perfilSeleccionado}
					onChange={(e) =>
						setPerfilSeleccionado(e.target.value ? Number(e.target.value) : "")
					}
				>
					<option value="">Seleccione perfil</option>
					{perfiles.map((p) => (
						<option key={p.idPerfil} value={p.idPerfil}>
							{p.nombrePerfil}
						</option>
					))}
				</select>

				<button
					type="button"
					style={styles.primaryButton}
					onClick={() => void guardar()}
					disabled={guardando || cargando}
				>
					{guardando ? "Guardando..." : "Guardar"}
				</button>

				<button
					type="button"
					style={styles.secondaryButton}
					onClick={() => void cargarDatos()}
					disabled={cargando || guardando}
				>
					{cargando ? "Cargando..." : "Recargar"}
				</button>
			</div>

			{error ? <div style={styles.errorBox}>{error}</div> : null}
			{mensaje ? <div style={styles.successBox}>{mensaje}</div> : null}

			<div style={styles.tableWrapper}>
				<table style={styles.table}>
					<thead>
						<tr>
							<th style={styles.th}>IdUsuario</th>
							<th style={styles.th}>NombreEmpleado</th>
							<th style={styles.th}>Seleccionar</th>
						</tr>
					</thead>
					<tbody>
						{cargando ? (
							<tr>
								<td style={styles.td} colSpan={3}>
									Cargando usuarios...
								</td>
							</tr>
						) : usuariosFiltrados.length === 0 ? (
							<tr>
								<td style={styles.td} colSpan={3}>
									No hay usuarios para mostrar.
								</td>
							</tr>
						) : (
							usuariosFiltrados.map((u) => {
								const seleccionado = usuarioSeleccionado === u.idUsuario;

								return (
									<tr key={u.idUsuario}>
										<td style={styles.td}>{u.idUsuario}</td>
										<td style={styles.tdBold}>{u.nombreEmpleado}</td>
										<td style={styles.td}>
											<button
												type="button"
												style={{
													...styles.rowButton,
													...(seleccionado ? styles.rowButtonSelected : {}),
												}}
												onClick={() => setUsuarioSeleccionado(u.idUsuario)}
											>
												{seleccionado ? "Seleccionado" : "Seleccionar"}
											</button>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

const styles: Record<string, React.CSSProperties> = {
	page: {
		display: "grid",
		gap: 12,
		padding: 16,
	},
	title: {
		margin: 0,
		fontSize: 24,
		fontWeight: 700,
		color: "#111827",
	},
	toolbar: {
		display: "flex",
		flexWrap: "wrap",
		gap: 10,
		alignItems: "center",
	},
	searchInput: {
		minWidth: 240,
		flex: "1 1 280px",
		border: "1px solid #d1d5db",
		borderRadius: 8,
		padding: "10px 12px",
		fontSize: 14,
	},
	select: {
		minWidth: 220,
		border: "1px solid #d1d5db",
		borderRadius: 8,
		padding: "10px 12px",
		fontSize: 14,
		backgroundColor: "#fff",
	},
	primaryButton: {
		border: "1px solid #166534",
		borderRadius: 8,
		padding: "10px 14px",
		color: "#fff",
		backgroundColor: "#16a34a",
		cursor: "pointer",
		fontWeight: 600,
	},
	secondaryButton: {
		border: "1px solid #374151",
		borderRadius: 8,
		padding: "10px 14px",
		color: "#111827",
		backgroundColor: "#fff",
		cursor: "pointer",
		fontWeight: 600,
	},
	errorBox: {
		border: "1px solid #fecaca",
		backgroundColor: "#fef2f2",
		color: "#991b1b",
		borderRadius: 8,
		padding: "10px 12px",
	},
	successBox: {
		border: "1px solid #bbf7d0",
		backgroundColor: "#f0fdf4",
		color: "#166534",
		borderRadius: 8,
		padding: "10px 12px",
	},
	tableWrapper: {
		border: "1px solid #e5e7eb",
		borderRadius: 10,
		overflow: "auto",
		backgroundColor: "#fff",
	},
	table: {
		width: "100%",
		borderCollapse: "collapse",
		minWidth: 640,
	},
	th: {
		textAlign: "left",
		backgroundColor: "#f9fafb",
		color: "#374151",
		fontSize: 13,
		padding: 12,
		borderBottom: "1px solid #e5e7eb",
	},
	td: {
		fontSize: 14,
		color: "#374151",
		padding: 12,
		borderBottom: "1px solid #f3f4f6",
	},
	tdBold: {
		fontSize: 14,
		color: "#111827",
		fontWeight: 600,
		padding: 12,
		borderBottom: "1px solid #f3f4f6",
	},
	rowButton: {
		border: "1px solid #9ca3af",
		borderRadius: 8,
		padding: "6px 10px",
		backgroundColor: "#fff",
		color: "#111827",
		cursor: "pointer",
		fontWeight: 600,
	},
	rowButtonSelected: {
		borderColor: "#166534",
		backgroundColor: "#dcfce7",
		color: "#166534",
	},
};
