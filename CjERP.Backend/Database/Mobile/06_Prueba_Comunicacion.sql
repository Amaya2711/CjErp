SET XACT_ABORT ON;
DECLARE @IdEmpleadoCj int = 0;
DECLARE @IdUsuarioCreacion nvarchar(100) = N'PRUEBA_MOVIL';

IF @IdEmpleadoCj <= 0 THROW 51000, 'Asigne un IdEmpleadoCj existente antes de ejecutar este script.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCj WHERE IdEmpleado=@IdEmpleadoCj AND ISNULL(IdActivo,1)=1) THROW 51001, 'El empleado indicado no existe o no está activo.', 1;

BEGIN TRANSACTION;
INSERT dbo.Comunicacion(Tipo,Titulo,Mensaje,Prioridad,TipoPersistencia,IdUsuarioCreacion,PermiteConfirmacion)
VALUES(0,N'Prueba de Cj_Erp_Push',N'Comunicación de prueba para validar login, bandeja y lectura desde la aplicación móvil.',0,1,@IdUsuarioCreacion,0);

DECLARE @IdComunicacion bigint=SCOPE_IDENTITY();
INSERT dbo.ComunicacionDestinatario(IdComunicacion,IdEmpleadoCj,FechaEnvio)
VALUES(@IdComunicacion,@IdEmpleadoCj,SYSUTCDATETIME());
INSERT dbo.ComunicacionEvento(IdComunicacion,IdEmpleadoCj,TipoEvento,Detalle)
VALUES(@IdComunicacion,@IdEmpleadoCj,'ENVIADO',N'Comunicación de prueba creada manualmente.');
COMMIT TRANSACTION;

SELECT @IdComunicacion AS IdComunicacionCreada,@IdEmpleadoCj AS IdEmpleadoDestinatario;
