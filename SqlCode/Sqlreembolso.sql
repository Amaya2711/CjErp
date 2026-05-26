--select * from Constante where valorini like '%bolso%'--52,53

--select * from constante where campo='estado'--valorini like '%TICO%'--93

--insert into constante values ('PE01','MAESTRO','ID_REEMBOLSO',52,'REEMBOLSO ENERGIA','','','')
--insert into constante values ('PE01','MAESTRO','ID_REEMBOLSO',53,'REEMBOLSO GASTOS','','','')
--insert into constante values ('PE01','MAESTRO','ID_VIATICO',93,'VIATICO','','','')
--insert into constante values ('PE01','MAESTRO','ESTADO',11,'REEMBOLSO_ENVIO','','Cuando se envia el monto de reembolso','')
--insert into constante values ('PE01','MAESTRO','ESTADO',12,'REEMBOLSO_PAGADO','','Cuando el cliente paga el reembolso','')

SELECT a.correlativo,b.nombrecliente,c.nombreproyecto,a.idsite,d.nombresite,f.valorini as Tarea,
a.subtotal,a.igv,a.total,e.valorini as Moneda,a.FechaDeposito,
CASE 
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN g_cj.nombreempleado
            ELSE g_emp.NombreEmpleado
        END AS Solicitante,
CASE 
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN h_cj.nombreempleado
            ELSE h_emp.NombreEmpleado
        END AS Responsable,i.ValorIni as Nom_Estado,
a.idcliente,a.IdProyecto,a.CorreSite,a.IdTarea,a.TipoMoneda,a.IdSolicitante,a.IdResponsable,a.Estado,
a.cuenta,a.CuentaInter,a.NombreCta,a.Detalle,a.fechaenvio,a.pagoreembolso,a.FechaPagoRe,a.obsreembolso,a.imgreembolso--,a.*
FROM PLANILLA a
left outer join cliente b on a.IdCliente=b.IdCliente
left outer join Proyecto c on a.IdProyecto=c.IdProyecto
left outer join site d on a.IdSite=d.IdSite and a.CorreSite=d.Correlativo
left outer join constante e on e.campo='tipo_moneda' and a.TipoMoneda=e.Correlativo
left outer join constante f on f.Campo='tarea' and a.IdTarea=f.Correlativo
LEFT outer JOIN Empleado g_emp ON g_emp.IdEmpleado = a.idSolicitante AND ISNULL(a.IdWeb, 0) <> 1
LEFT outer JOIN EmpleadoCj g_cj ON g_cj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) = 1
LEFT outer JOIN Empleado h_emp ON h_emp.IdEmpleado = a.IdResponsable AND ISNULL(a.IdWeb, 0) <> 1
LEFT outer JOIN EmpleadoCj h_cj ON h_cj.IdEmpleado = a.IdResponsable AND ISNULL(a.IdWeb, 0) = 1
LEFT OUTER JOIN constante i on i.Campo='ESTADO' and a.Estado=i.Correlativo
WHERE a.IDTAREA IN(52,53) AND a.ESTADO = 4 
order by a.correlativo

--select * from empleado where idempleado=3746
--select * from planilla where idtarea in(52,53) order by correlativo desc
select * from planilla where estado=4 and idtarea in(52,53) and year(fechadeposito)=2025 
update planilla set estado=12,obsreembolso='ACTUALIZAR' where estado=4 and idtarea in(52,53) and year(fechadeposito)=2025 



