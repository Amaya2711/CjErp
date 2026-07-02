/*
    Indices propuestos para mejorar dbo.sp_Planilla_Consulta_Estados
    y los endpoints que consumen /api/planilla/consulta-estados.

    Recomendacion:
    1. ejecutar en QA
    2. revisar plan de ejecucion antes/despues
    3. validar impacto de escritura en Planilla
*/

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Planilla_Estado_FecIngreso_Validador'
      AND object_id = OBJECT_ID('dbo.Planilla')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Estado_FecIngreso_Validador
    ON dbo.Planilla (Estado, FecIngreso, IdValidador, Correlativo DESC)
    INCLUDE (
        IdSolicitante,
        IdWeb,
        FechaDeposito,
        IdProyecto,
        IdResponsable,
        IdSite,
        CorreSite,
        Usuario,
        Ot,
        IdCliente,
        IdBien,
        IdComprobante,
        IdBanco,
        IdTipoPago,
        TipoMoneda,
        IdRendicion,
        IdGestor,
        HoraCreacion,
        Responsable,
        IdTipoDoc,
        Fila,
        IdTransferencia,
        IdOc,
        TotalPagar,
        IdTarea,
        imgFactura,
        idprovisional,
        serie,
        NroOperacion,
        Comentario,
        Subtotal,
        Igv,
        Total
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Planilla_Estado_FechaDeposito_Validador'
      AND object_id = OBJECT_ID('dbo.Planilla')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Estado_FechaDeposito_Validador
    ON dbo.Planilla (Estado, FechaDeposito, IdValidador, Correlativo DESC)
    INCLUDE (
        IdSolicitante,
        IdWeb,
        FecIngreso,
        IdProyecto,
        IdResponsable,
        IdSite,
        CorreSite,
        Usuario,
        Ot,
        IdCliente,
        IdBien,
        IdComprobante,
        IdBanco,
        IdTipoPago,
        TipoMoneda,
        IdRendicion,
        IdGestor,
        HoraCreacion,
        Responsable,
        IdTipoDoc,
        Fila,
        IdTransferencia,
        IdOc,
        TotalPagar,
        IdTarea,
        imgFactura,
        idprovisional,
        serie,
        NroOperacion,
        Comentario,
        Subtotal,
        Igv,
        Total
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Planilla_IdSolicitante_IdWeb'
      AND object_id = OBJECT_ID('dbo.Planilla')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_IdSolicitante_IdWeb
    ON dbo.Planilla (IdSolicitante, IdWeb, Estado, Correlativo DESC)
    INCLUDE (IdValidador, FecIngreso, FechaDeposito);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Empleado_IdEmpleadoCj'
      AND object_id = OBJECT_ID('dbo.Empleado')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Empleado_IdEmpleadoCj
    ON dbo.Empleado (IdEmpleadoCj)
    INCLUDE (IdEmpleado);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Constante_Campo_Correlativo_ValorIni'
      AND object_id = OBJECT_ID('dbo.Constante')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Constante_Campo_Correlativo_ValorIni
    ON dbo.Constante (Campo, Correlativo, ValorIni);
END;
GO
