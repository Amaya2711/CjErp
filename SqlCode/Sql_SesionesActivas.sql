
--SELECT 
--    s.login_name AS Usuario,s.host_name,
--    COUNT(*) AS TotalSesionesActivas
--FROM sys.dm_exec_sessions s
--WHERE s.is_user_process = 1
--GROUP BY s.login_name,s.host_name

--SELECT 
--    session_id, q
--    login_name,
--    host_name,
--    program_name,
--    status
--FROM sys.dm_exec_sessions
--WHERE host_name = 'DESKTOP-GK6IOAM'
--  AND session_id <> @@SPID

 -- kill 133

 SELECT TOP 20
    r.session_id,
    s.login_name AS Usuario,
    s.host_name AS Equipo,
    s.program_name AS Aplicacion,
    r.status,
    r.command,
    r.cpu_time AS CPU_ms,
    r.total_elapsed_time AS TiempoTotal_ms,
    r.reads,
    r.writes,
    r.logical_reads,
    r.blocking_session_id AS BloqueadoPor,
    DB_NAME(r.database_id) AS BaseDatos,
    st.text AS ConsultaEjecutando
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s 
    ON r.session_id = s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE s.is_user_process = 1
ORDER BY 
    r.cpu_time DESC,
    r.logical_reads DESC,
    r.total_elapsed_time DESC;