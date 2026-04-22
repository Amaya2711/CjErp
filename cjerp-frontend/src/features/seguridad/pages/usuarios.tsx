// Migrado desde src/pages/seguridad/usuarios.tsx
export default function SeguridadUsuariosPage() {
	return (
		<div style={styles.card}>
			<h1 style={styles.title}>Seguridad - Usuarios</h1>
			<p style={styles.text}>Aquí irá la administración de usuarios.</p>
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