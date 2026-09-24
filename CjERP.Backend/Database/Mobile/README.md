# Mobile communications – deployment prerequisite

Start with `00_Auditoria_Previa_Comunicaciones.sql`. It is read-only and must be executed manually against the intended `JC_Db` environment. The new API services call these stored procedures, which must be reviewed and deployed manually before the mobile endpoints are enabled:

- `dbo.sp_Comunicacion_ListarPorEmpleado`
- `dbo.sp_Comunicacion_Obtener`
- `dbo.sp_Comunicacion_MarcarLeido`
- `dbo.sp_Comunicacion_Confirmar`
- `dbo.sp_Comunicacion_PendientesObligatorias`
- `dbo.sp_DispositivoMovil_Registrar`
- `dbo.sp_DispositivoMovil_Desactivar`

No SQL script is generated yet because the actual `JC_Db` schema has not been audited. Creating tables from assumptions could duplicate existing communications, device, employee or audit structures. The procedures must validate `IdEmpleadoCj` received from the JWT-derived API layer and never trust an employee identifier supplied by the client.

Execution order after approval: `01`, `02`, `03`, `04`. `05` is destructive rollback only.
