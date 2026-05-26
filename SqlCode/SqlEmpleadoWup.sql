select * from EmpleadoCj_Wup where idactivo=1-- and idempleado=88

--update EmpleadoCj_Wup set IdActivo=1 where idempleado (1160,66,88,91,69)--in(1160,66,88)--
--update EmpleadoCj_Wup set IdActivo=0 --where idempleado in(1160,66,88,91,69)

select * from ReporteWhatsAppLog
--delete from ReporteWhatsAppLog

exec RptAsistenciaFechas_Wup
    @FechaInicio ='01/05/2026',
    @FechaFin    = '09/05/2026',
    @IdEmpleado  = 66--1160

    
exec RptAsistenciaFechas
    @FechaInicio ='01/05/2026',
    @FechaFin    = '08/05/2026'

select * from constante where campo='estado_asistencia'

select * from empleado where NombreEmpleado like '%coronado%'--3654

select * from empleadocj_wup where idcargo=50 and NombreEmpleado like '%HUAMAN%' AND IDACTIVO=1--61,69

select hora,HoraSalida,* from asistencia where IdEmpleado=17 and FechaAsistencia='05/10/2026'

--update asistencia set IdEstado=13,hora=null where IdEmpleado=17 and FechaAsistencia='05/10/2026'
--update asistencia set HoraSalida='2026-05-16 13:01:32.000' where IdEmpleado=97 and FechaAsistencia='05/16/2026'

select * from empleadocj where idactivo=1 and idcargo=50 and len(telefono)>0
and idempleado in(
select IdEmpleado from empleadocj_wup where idactivo=1 and idcargo=50 and len(telefono)<=0
)

select * from empleadocj where NombreEmpleado like '%leyva%'--94
select * from asistencia where IdEmpleado=1119

select * from constante where campo like '%asistencia_geren%'

select correlativo,valorini from constante where campo like '%asistencia_all%'

select * from asistencia where IdEmpleado=94 and FechaAsistencia='05/25/2026'
--update asistencia set hora='2026-05-25 08:01:27.630',idestado=1 where IdEmpleado=94 and FechaAsistencia='05/25/2026'

exec RptAsistenciaFechas
@Fechainicio='01/05/2026',
@fechafin='24/05/2026'
