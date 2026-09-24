SET XACT_ABORT ON;
DECLARE @IdEmpleadoCj int = 1160;
IF @IdEmpleadoCj <= 0 THROW 51002, 'Asigne un IdEmpleadoCj de EmpleadoCj antes de ejecutar.', 1;
BEGIN TRANSACTION;
INSERT dbo.Comunicacion(Tipo,Titulo,Mensaje,Prioridad,TipoPersistencia,IdUsuarioCreacion,PermiteConfirmacion)
VALUES(1,N'Prueba de confirmación',N'Confirme la lectura de esta comunicación desde Cj_Erp_Push.',1,2,N'PRUEBA_MOVIL',1);
DECLARE @IdComunicacion bigint=SCOPE_IDENTITY();
INSERT dbo.ComunicacionDestinatario(IdComunicacion,IdEmpleadoCj,FechaEnvio) VALUES(@IdComunicacion,@IdEmpleadoCj,SYSUTCDATETIME());
INSERT dbo.ComunicacionEvento(IdComunicacion,IdEmpleadoCj,TipoEvento,Detalle) VALUES(@IdComunicacion,@IdEmpleadoCj,'ENVIADO',N'Prueba de confirmación.');
COMMIT TRANSACTION;
SELECT @IdComunicacion AS IdComunicacionCreada;
