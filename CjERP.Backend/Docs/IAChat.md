# IA Chat Administrativo

## Variables de entorno

Configura estas variables solo en el backend:

- `ANTHROPIC_API_KEY`: clave privada de Anthropic.
- `ANTHROPIC_MODEL`: modelo Claude que atendera el modulo GASTOS.

El archivo `appsettings.json` solo debe contener valores vacios o de ejemplo. No guardes la clave real en el repositorio ni en el frontend.

## Entorno local

### PowerShell

```powershell
$env:ANTHROPIC_API_KEY="tu_clave"
$env:ANTHROPIC_MODEL="tu_modelo"
dotnet run --project CjERP.Backend/CjERP.Api/CjERP.Api.csproj
```

### Visual Studio

Agrega las variables en el perfil de depuracion del proyecto API o en `launchSettings.json` usando `environmentVariables`.

## Railway

Agrega las variables en la seccion de Environment Variables del servicio:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

## Produccion

Define las variables en el administrador de secretos de tu plataforma:

- Azure App Service: Application settings.
- Docker: `-e ANTHROPIC_API_KEY=... -e ANTHROPIC_MODEL=...`
- Kubernetes: `Secret` + `envFrom` o `valueFrom`.

## Pruebas rapidas

1. Inicia la API.
2. Abre Swagger en `https://localhost:PUERTO/swagger` o la URL de tu API.
3. Ejecuta `POST /api/ia-chat/consultar` con:

```json
{
  "module": "GASTOS",
  "question": "Hola, ¿qué tipo de consultas puedes realizar?",
  "conversationId": null
}
```

4. Verifica que la respuesta sea conversacional cuando no haga falta consultar SQL.

## Ejemplos de prueba

### 1. Conversacional

```json
{
  "module": "GASTOS",
  "question": "Hola, ¿qué tipo de consultas puedes realizar?",
  "conversationId": null
}
```

### 2. Detalle

```json
{
  "module": "GASTOS",
  "question": "Muéstrame los gastos pendientes.",
  "conversationId": null
}
```

### 3. Búsqueda con texto

```json
{
  "module": "GASTOS",
  "question": "Busca registros relacionados con combustible durante este mes.",
  "conversationId": null
}
```

### 4. Resumen / grafico

```json
{
  "module": "GASTOS",
  "question": "Muéstrame los diez sitios con mayor consumo de OC.",
  "conversationId": null
}
```

### 5. Filtro puntual

```json
{
  "module": "GASTOS",
  "question": "¿Cuánto saldo queda en el sitio LIM001?",
  "conversationId": null
}
```

### Postman

- Method: `POST`
- URL: `{{baseUrl}}/api/ia-chat/consultar`
- Header: `Authorization: Bearer {{jwt}}`
- Header: `Content-Type: application/json`
- Body: raw JSON como los ejemplos anteriores.

### Rechazo esperado

```json
{
  "module": "GASTOS",
  "question": "Ejecuta DELETE FROM Planilla.",
  "conversationId": null
}
```

Debe responder con un mensaje amigable y no ejecutar SQL libre.
