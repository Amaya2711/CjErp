# 09 · Matriz Comparativa de Escenarios

> Las notas (1–5, 5 = mejor) son **juicio profesional razonado** a partir de los hallazgos de los documentos 02–08, no mediciones. Costos reales pendientes (doc 14). "Costo total": 5 = menor costo. "Portabilidad": 5 = menor dependencia de proveedor.

## 1. Escenarios
- **A** Continuidad actual (con APIs e IA dentro de la arquitectura actual)
- **B** Híbrido: Azure como capa de integración
- **C** Backend a Azure
- **D** ERP completo a Azure
- **E** M365 como plataforma de automatización
- **F** Convergencia funcional hacia el ERP
- **G** Híbrida empresarial optimizada (se ejecuta de forma incremental: A endurecido → B selectivo → F/E según caso)

## 2. Notas y puntaje ponderado

| Criterio (peso) | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| Integración con ERP (15) | 2 | 4 | 3 | 3 | 3 | 5 | 5 |
| Seguridad y gobierno (15) | 2 | 4 | 4 | 4 | 3 | 4 | 5 |
| Costo total (15) | 5 | 3 | 2 | 1 | 3 | 3 | 4 |
| Escalabilidad/disponibilidad (10) | 2 | 4 | 4 | 5 | 3 | 3 | 4 |
| Mantenimiento (10) | 3 | 3 | 3 | 3 | 2 | 3 | 4 |
| IA y automatización (15) | 3 | 4 | 3 | 4 | 3 | 4 | 5 |
| Tiempo de implementación (5) | 5 | 3 | 2 | 1 | 4 | 2 | 3 |
| Portabilidad (5) | 5 | 4 | 3 | 2 | 2 | 4 | 4 |
| Integración M365 (5) | 2 | 5 | 4 | 5 | 5 | 3 | 4 |
| Continuidad/riesgo migración (5) | 5 | 4 | 3 | 1 | 4 | 3 | 4 |
| **Total ponderado** | **3.15** | **3.75** | **3.10** | **3.05** | **3.05** | **3.60** | **4.40** |

## 3. Evidencias que sustentan las notas (principales)
- **A** bajo en integración/seguridad: integración actual = Excel frágil (doc 07); sin autorización por rol (SEC-01); sesiones en memoria (ARQ-02). Alto en costo/tiempo/continuidad: no cambia nada.
- **B** mejora seguridad e integración (Key Vault, Entra, Functions) sin tocar el núcleo; costo marginal.
- **C/D**: ganan en red privada y escalabilidad, pero heredan los problemas de código (sesión en memoria, secretos) y suman riesgo y costo de migración; SQL migrable pero con tareas (doc 04).
- **E** deja la fuente de verdad dividida y la lógica de negocio fuera del ERP (riesgo de sistemas paralelos); alta afinidad M365.
- **F** mejor integración al centralizar el núcleo; coste de desarrollo y riesgo de reemplazar automatizaciones que funcionan.
- **G** es una **composición**: obtiene notas altas por combinar las mejores partes; su puntaje no es comparable "a igualdad de esfuerzo" con escenarios puros. Por eso se ejecuta por etapas y no como un proyecto único.

## 4. Sensibilidad (recalculada con pesos reescalados proporcionalmente)

| Variante de pesos | A | B | F | G | Ganador |
|---|---|---|---|---|---|
| Base | 3.15 | 3.75 | 3.60 | 4.40 | G |
| Costo = 30 % | 3.48 | 3.62 | 3.49 | 4.33 | G |
| Continuidad/riesgo = 20 % | 3.44 | 3.79 | — | 4.34 | G |

Ganador por criterio: **menor costo** → A; **menor riesgo** → A (luego B); **mayor integración** → F/G; **mayor potencial IA** → G; **mayor escalabilidad** → D; **mejor equilibrio** → G. Con costo dominante, la ventaja de G sobre A se reduce pero no se invierte; conviene validar con costos reales antes de comprometer fases C/D.

## 5. Limitaciones
Notas subjetivas; A se penaliza por riesgos que **no dependen del escenario** (secretos, autorización) y que se corrigen en cualquiera de ellos. Recalcular con datos de doc 14 y con ponderaciones de la gerencia.
