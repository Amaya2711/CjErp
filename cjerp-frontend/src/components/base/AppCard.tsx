import React from "react";

interface AppCardProps {
  children: React.ReactNode;
  /** Título opcional mostrado en la cabecera de la tarjeta */
  title?: string;
  /** Acciones (botones, filtros) alineadas a la derecha del título */
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Contenedor visual unificado para secciones o bloques del ERP.
 * Usar para agrupar formularios, tablas, KPIs, etc.
 *
 * Reemplaza el AppCard anterior (basado en estilos inline) por una
 * versión con Tailwind, consistente con el resto del sistema de diseño.
 */
const AppCard: React.FC<AppCardProps> = ({ children, title, actions, className = "", style }) => {
  return (
    <div
      className={`bg-surface border border-border-soft rounded-app shadow-sm mb-4 ${className}`}
      style={style}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-soft">
          {title && (
            <h3 className="text-sm font-semibold text-text-strong m-0">{title}</h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5 flex flex-col min-h-0 flex-1">{children}</div>
    </div>
  );
};

export default AppCard;
