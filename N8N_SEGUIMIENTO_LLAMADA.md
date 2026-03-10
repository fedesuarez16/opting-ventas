# Modificación del Flujo de Seguimiento en n8n

## Objetivo
Modificar el flujo de seguimiento para que cuando un usuario **NO responda** después de recibir un mensaje de follow-up, el lead se marque automáticamente como **"llamada"** en el CRM, para que aparezca en la columna de llamadas del Kanban.

## Flujo Actual
1. **Check Seguimientos** (cada 15 minutos) → Busca registros en `seguimiento_whatsapp` donde:
   - `follow_up_sent = false`
   - `last_bot_message_at < (ahora - 15 minutos)`
2. **Preparar Follow-up** → Prepara el mensaje de seguimiento
3. **Enviar Follow-up** → Envía el mensaje por WhatsApp
4. **Marcar Follow-up Enviado** → Actualiza `follow_up_sent = true`

## Problema
Después de enviar el follow-up, si el usuario **NO responde**, el lead no se marca como "llamada" automáticamente.                                             

## Solución: Modificar el Flujo de n8n

### Opción 1: Agregar verificación después del follow-up (Recomendada)

Después del nodo **"Marcar Follow-up Enviado"**, agregar los siguientes nodos:

#### 1. **Esperar Respuesta** (Wait Node)
- **Tipo**: `n8n-nodes-base.wait`
- **Configuración**:
  - **Wait Type**: "Time"
  - **Amount**: `15`
  - **Unit**: "Minutes"
- **Propósito**: Esperar 15 minutos para ver si el usuario responde

#### 2. **Verificar si Respondió** (IF Node)      
- **Tipo**: `n8n-nodes-base.if`
- **Configuración**:
  - **Condition**: Verificar en `seguimiento_whatsapp` si `      responded = true`
  - **Operation**: "Get" desde Supabase
  - **Table**: `seguimiento_whatsapp`
  - **Filter**: `phone = {{ $json.phone }}` AND `responded = true`
- **Propósito**: Verificar si el usuario respondió durante los 15 minutos

#### 3. **Si NO Respondió → Marcar como Llamada** (HTTP Request Node)
- **Tipo**: `n8n-nodes-base.httpRequest`
- **Configuración**:
  - **Method**: `POST`
  - **URL**: `https://tu-dominio.vercel.app/api/leads/mark-as-call`
  - **Headers**:
    - `Content-Type: application/json`
  - **Body (JSON)**:
    ```json
    {
      "phone": "={{ $json.phone }}"
    }
    ```
- **Propósito**: Llamar a la API para cambiar el estado del lead a "llamada"

### Opción 2: Verificación periódica (Alternativa)

Crear un nuevo workflow que se ejecute periódicamente (cada 15-30 minutos) y verifique:

1. **Buscar Follow-ups Enviados Sin Respuesta**
   - Buscar en `seguimiento_whatsapp` registros donde:
     - `follow_up_sent = true`
     - `responded = false`
     - `last_bot_message_at < (ahora - 15 minutos)`

2. **Para cada registro encontrado**:
   - Llamar a la API `/api/leads/mark-as-call` con el `phone`
   - Opcionalmente, marcar el registro como procesado

## Pasos Detallados para Implementar (Opción 1)

### Paso 1: Agregar nodo "Wait" después de "Marcar Follow-up Enviado"

1. En n8n, abre el workflow "Opting - Agente Ventas CONSOLIDADO"
2. Después del nodo **"Marcar Follow-up Enviado"**, agrega un nodo **"Wait"**
3. Configura:
   - **Wait Type**: "Time"
   - **Amount**: `15`
   - **Unit**: "Minutes"
   - **Resume**: "When time passes"

### Paso 2: Agregar nodo "Verificar Respuesta"

1. Después del nodo "Wait", agrega un nodo **"Supabase"** (Get)
2. Configura:
   - **Operation**: "Get All"
   - **Table**: `seguimiento_whatsapp`
   - **Filters**:
     - `phone` = `{{ $('Marcar Follow-up Enviado').item.json.phone }}`
     - `responded` = `true`
   - **Return All**: `false`
   - **Limit**: `1`

### Paso 3: Agregar nodo "IF" para verificar si hay respuesta

1. Después del nodo "Verificar Respuesta", agrega un nodo **"IF"**
2. Configura:
   - **Condition**: `{{ $json.length === 0 }}` (si no hay resultados, significa que NO respondió)
   - **True Path**: Continuar al siguiente paso (marcar como llamada)
   - **False Path**: Terminar (el usuario respondió, no hacer nada)

### Paso 4: Agregar nodo HTTP Request para marcar como llamada

1. En la rama **True** del nodo IF, agrega un nodo **"HTTP Request"**
2. Configura:
   - **Method**: `POST`
   - **URL**: `https://tu-dominio.vercel.app/api/leads/mark-as-call`
     - ⚠️ **Reemplaza `tu-dominio.vercel.app` con tu dominio real de Vercel**
   - **Authentication**: None (o agrega un token si lo configuraste)
   - **Send Body**: `true`
   - **Body Content Type**: `JSON`
   - **JSON Body**:
     ```json
     {
       "phone": "={{ $('Marcar Follow-up Enviado').item.json.phone }}"
     }
     ```

### Paso 5: Agregar manejo de errores (Opcional)

1. Después del nodo HTTP Request, agrega un nodo **"Code"** para logging
2. O agrega un nodo **"Error Trigger"** para manejar errores

## Ejemplo de Flujo Completo

```
Check Seguimientos (Schedule Trigger cada 15 min)
  ↓
Buscar Pendientes (Supabase Get)
  ↓
Preparar Follow-up (Code)
  ↓
Enviar Follow-up (HTTP Request a YCloud)
  ↓
Marcar Follow-up Enviado (Supabase Update)
  ↓
[NUEVO] Wait 15 minutos
  ↓
[NUEVO] Verificar Respuesta (Supabase Get)
  ↓
[NUEVO] IF (¿Respondió?)
  ├─ NO → [NUEVO] Marcar como Llamada (HTTP Request a /api/leads/mark-as-call)
  └─ SÍ → Terminar (no hacer nada)
```

## Variables de Entorno Necesarias

Asegúrate de tener configuradas en Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (recomendado) o `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Testing

1. **Test Manual**:
   - Crea un lead de prueba
   - Envía un mensaje de seguimiento
   - Espera 15 minutos sin responder
   - Verifica que el lead cambió a estado "llamada" en el CRM

2. **Test con cURL**:
   ```bash
   curl -X POST https://tu-dominio.vercel.app/api/leads/mark-as-call \
     -H "Content-Type: application/json" \
     -d '{"phone": "+5491123456789"}'
   ```

3. **Test GET** (para verificar estado):
   ```bash
   curl "https://tu-dominio.vercel.app/api/leads/mark-as-call?phone=+5491123456789"
   ```

## Notas Importantes

1. **Timing**: El flujo espera 15 minutos después de enviar el follow-up. Ajusta este tiempo según tus necesidades.

2. **Múltiples Follow-ups**: Si envías múltiples follow-ups, considera agregar un campo `follow_up_count` o `last_follow_up_at` para evitar marcar como llamada demasiado pronto.

3. **Respuesta Tardía**: Si el usuario responde después de los 15 minutos pero antes de que se marque como llamada, el sistema debería detectarlo. Considera agregar lógica adicional si es necesario.

4. **Estado Actual**: Si el lead ya está en estado "llamada", la API no lo actualizará nuevamente (evita loops).

5. **Dominio de Vercel**: Asegúrate de usar el dominio correcto de tu deployment en Vercel. Puedes encontrarlo en el dashboard de Vercel.

## Troubleshooting

- **Error 404**: Verifica que el endpoint esté desplegado correctamente en Vercel
- **Error 500**: Revisa los logs de Vercel para ver detalles del error
- **Lead no encontrado**: Verifica que el número de teléfono coincida exactamente con el `whatsapp_id` o `telefono` en la tabla `leads`
- **Estado no cambia**: Verifica que el lead exista y que el número de teléfono esté normalizado correctamente
