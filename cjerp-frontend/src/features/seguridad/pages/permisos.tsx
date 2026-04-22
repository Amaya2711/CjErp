// Migrado desde src/pages/seguridad/permisos.tsx
export default function SeguridadPermisosPage() {
	return (
		<div style={styles.card}>
			<h1 style={styles.title}>Seguridad - Permisos</h1>
			<p style={styles.text}>Aquí irá la administración de permisos por rol y menú.</p>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	card: {
		background: "#fff",
		borderRadius: 12,
		padding: 24,
		boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
		borderTop: "4px solid #6E4CCB",
	},
	title: {
		marginTop: 0,
		color: "#17143A",
	},
	text: {
		color: "#4B5563",
	},
};