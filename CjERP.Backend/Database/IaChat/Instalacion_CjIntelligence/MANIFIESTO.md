# Manifiesto del kit de instalación

- **Versión final única:** `cj-intelligence-instalacion-final-2026-11-01-cabb4ec767af` (huella = SHA-256 de la lista «hash  archivo» ordenada, abajo)
- **Archivos:** 18 (17 scripts SQL + LEEME; el script 00 es nuevo en este kit)
- **Estado:** BLOQUE 1 COMPLETO en JC_Db (2026-11-01/02): `18`, `19`, `20`, `20c`, `22` (152/152 OK), `23` (45/45 OK), `23b`; `21` etapas 18/19/20 con 0 fallas y `21b` 10/10; limpieza en 0 filas. `20e` (contra-firma de `sp_IA_Planilla_Buscar`, autorizada) y script `24` EJECUTADOS: Veredicto OK (1,3 s, PROPIO, un empleado). Pendientes con autorización aparte: rendimiento y despliegue. Módulo deshabilitado.
- **Relación con el paquete de revisión** `cj-intelligence-r3-cierre-2026-11-01-354de8f63147` (SHA-256 del ZIP `da13de5102219197e1e7d8bd10dbbe94f25688b5712494ae696faa78487b1946`): los scripts 18–24 y sus auxiliares son idénticos a los de ese paquete **salvo `22` y `23`** (se corrigió el tamaño de una tabla temporal y, en `22`, una expectativa; columna «Relación»). Se agregan `00` y este LEEME, y el LEEME ahora exige `-I` en `sqlcmd`. Este kit **reemplaza** cualquier otra copia de los scripts 18–24.
- **Verificación:** los hashes se comprueban con `Get-FileHash -Algorithm SHA256 <archivo>` sobre los archivos reales (o el ZIP del kit). La página HTML de lectura permite revisar el contenido, no verificar estos hashes.

| SHA-256 | Archivo | Relación |
|---|---|---|
| `e3f7e913d4b5b19afafc2a4be4f4e0fbcb18b907a2fabd25861c5343b2798709` | 1_Instalacion_y_Validacion/00_CjIntelligence_Prechequeo_Log_Respaldo_SoloLectura.sql | nuevo en este kit |
| `ef15344bb1ad0a7c58df520ff7780f5492feb7a915f2e186361545693f43ab6e` | 1_Instalacion_y_Validacion/18a_CjIntelligence_Snapshot_SoloLectura.sql | idéntico al paquete de revisión |
| `c542dc33f6b906f8c2a15e9e9298314b32c8c831599500b6a556887be08945ac` | 1_Instalacion_y_Validacion/18_CjIntelligence_Esquema.sql | idéntico al paquete de revisión |
| `551d3ecc5d749fa1646be1a2cd24a60b5cc53db68731815497c28d2c4d5f2874` | 1_Instalacion_y_Validacion/19_CjIntelligence_Procedimientos.sql | idéntico al paquete de revisión |
| `7257d0acb41e4b05a572f865946df430aaaefe4ca95d6d4e8bfcd8c637ffcfee` | 1_Instalacion_y_Validacion/20_CjIntelligence_Usuario_cj_ia.sql | idéntico al paquete de revisión |
| `3eb35f42e4dc47e2185946436dc930378ac373b48a7e19252c3838063bd64b71` | 1_Instalacion_y_Validacion/20c_CjIntelligence_Firma_Certificado.sql | idéntico al paquete de revisión |
| `6e17011e9f8ec9faf315ea6271fa1a84344fa6c31a5b4bfc5b92afd9760a1452` | 1_Instalacion_y_Validacion/20e_CjIntelligence_ContraFirma_SP_Compartido.sql | nuevo en este kit |
| `df5ce105bb9c6940c5007a8db62b904ad1e1404f8962329e4951c10de2978951` | 1_Instalacion_y_Validacion/21_CjIntelligence_Validacion_SoloLectura.sql | DIFIERE del paquete de revisión |
| `dedacec68ea33d3aa7d3d4e1dd5f121f1c2393f9746b44b5f48d891c88fee070` | 1_Instalacion_y_Validacion/21b_CjIntelligence_Validacion_Firma_SoloLectura.sql | idéntico al paquete de revisión |
| `26ef0a31872b99185a201fe180e8f9df408a07724cf18ba58c479250ff386b66` | 1_Instalacion_y_Validacion/22_CjIntelligence_PruebaFuncional.sql | DIFIERE del paquete de revisión |
| `c1ceb1956f23f1c38609afe16d8d9e55e0b2baba6a0d47ba0dce7228a354e243` | 1_Instalacion_y_Validacion/23_CjIntelligence_Pruebas_cj_ia.sql | DIFIERE del paquete de revisión |
| `3c6ec506374cac372b84c6433a889249b06a91341648af05320bee3b0141d0ac` | 1_Instalacion_y_Validacion/23b_CjIntelligence_Limpieza_PorGuid.sql | idéntico al paquete de revisión |
| `037b39d2f5be03a18ddc43af65f40006920c2c9cfd8bbdda678b04e904c24f36` | 2_Consulta_Real_Pagos/24_CjIntelligence_PruebaReal_Pagos_cj_ia.sql | idéntico al paquete de revisión |
| `f687664370e88365b7e3f76a8f9ed6d1db15c1fb6d4e9f71703d4ce3c643bc54` | Reversion/18b_CjIntelligence_Reversion_PreUso.sql | idéntico al paquete de revisión |
| `37f23d9cc822d3fb25804ea33aaa5166fe55d39a41e76ec4860864a6380e8848` | Reversion/20b_CjIntelligence_Usuario_cj_ia_Reversion.sql | idéntico al paquete de revisión |
| `0eae33ce4ef34ced26cf71736801ad47bb7da966038258198309e0c36456cef8` | Reversion/20d_CjIntelligence_Firma_Certificado_Reversion.sql | idéntico al paquete de revisión |
| `8c926e298819316fea0bba680831fa3524f9eae71214ee2839e19309e60a0a91` | Reversion/20f_CjIntelligence_ContraFirma_Reversion.sql | nuevo en este kit |
| `2ae83fe2ab8ac89e358da62d42931eb6f19c6d6d1a74117e2eb15e1f3cdf910b` | LEEME.md | este documento |
