import React from "react";

interface AppCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Contenedor visual unificado para secciones o bloques.
 * Usar para agrupar formularios, tablas, etc.
 */
const AppCard: React.FC<AppCardProps> = ({ children, style }) => {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(23,20,58,0.06)',
        padding: 20,
        marginBottom: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default AppCard;
