# Segundo Toque de Seguimiento - Instrucciones

## Resumen del flujo

El flujo "Segundo Toque" se ejecuta cada 30 minutos y busca leads que:
1. Ya recibieron el **primer follow-up** (`follow_up_sent = true`)
2. **No respondieron** (`responded = false`)
3. **No recibieron el segundo toque** (`follow_up_2_sent = false`)
4. Tienen un `follow_up_scheduled_at` con fecha/hora **ya pasada**

Luego les envía un segundo mensaje de seguimiento por WhatsApp, marca `follow_up_2_sent = true` y cambia el estado del lead a `llamada`.

---

## ⚠️ IMPORTANTE: Modificación necesaria en el flujo principal

El flujo principal ("Opting - Agente Ventas") necesita que el nodo **"Marcar Follow-up Enviado"** también setee el campo `follow_up_scheduled_at` para que el segundo toque sepa cuándo debe activarse.

### Modificar el nodo "Marcar Follow-up Enviado"

En el flujo principal, buscar el nodo **"Marcar Follow-up Enviado"** y agregar un campo más a los `fieldValues`:

**Campos actuales:**
```
follow_up_sent = true
```

**Campos que debe tener (agregar `follow_up_scheduled_at`):**
```
follow_up_sent = true
follow_up_scheduled_at = {{ new Date(Date.now() + 30 * 60 * 1000).toISOString() }}
```

Esto programa el segundo toque para **30 minutos después** de enviar el primer follow-up.

### Pasos en n8n:
1. Abrir el flujo "Opting - Agente Ventas"
2. Hacer doble clic en el nodo **"Marcar Follow-up Enviado"**
3. En la sección "Fields to Send" agregar un nuevo campo:
   - **Field Name**: `follow_up_scheduled_at`
   - **Field Value**: `{{ new Date(Date.now() + 30 * 60 * 1000).toISOString() }}`
4. Guardar el nodo y el flujo

---

## Importar el nuevo flujo

1. En n8n, ir a **Workflows** → **Import from File**
2. Seleccionar el archivo `Segundo-Toque-Seguimiento.json`
3. El flujo se importará con el nombre **"Segundo Toque - Seguimiento WhatsApp"**
4. Verificar que las credenciales de Supabase estén correctamente asignadas (debería usar "Supabase account 2")
5. **Activar** el flujo (está desactivado por defecto)

---

## Diagrama del flujo

```
Check Segundo Toque (cada 30 min, L-S 8am-8pm)
       │
       ▼
Buscar Pendientes 2do Toque
(follow_up_sent=true, responded=false, follow_up_2_sent=false, follow_up_scheduled_at < ahora)
       │
       ▼
Deduplicar por Teléfono
       │
       ▼
Verificar No Enviado (if follow_up_2_sent == false)
       │
       ▼
Preparar Segundo Toque (armar mensaje personalizado)
       │
       ▼
Enviar Segundo Toque YCloud (WhatsApp API)
       │
       ├──▶ Marcar 2do Toque Enviado (follow_up_2_sent = true)
       │
       └──▶ Marcar Lead como Llamada (leads.estado = 'llamada')
```

---

## Mensaje del segundo toque

**Con nombre:**
> Hola {nombre}, te escribo nuevamente desde Opting. Vi que no pudimos conectar antes. ¿Tenés alguna duda sobre el carnet o necesitás ayuda con algo? Estoy para ayudarte 😊

**Sin nombre:**
> Hola, te escribo nuevamente desde Opting. Vi que no pudimos conectar antes. ¿Tenés alguna duda o necesitás ayuda con algo? Estoy para ayudarte 😊

---

## Horario de ejecución

- **Frecuencia**: Cada 30 minutos
- **Días**: Lunes a Sábado
- **Horario**: 8:00 AM a 8:00 PM
- **Cron expression**: `*/30 8-20 * * 1-6`

---

## Campos de la tabla `seguimiento_whatsapp` utilizados

| Campo | Uso |
|-------|-----|
| `phone` | Número del cliente (destino del mensaje) |
| `phone_from` | Número de origen (desde donde se envía) |
| `customer_name` | Nombre para personalizar el mensaje |
| `follow_up_sent` | Filtro: debe ser `true` (ya se envió primer toque) |
| `responded` | Filtro: debe ser `false` (no respondió) |
| `follow_up_2_sent` | Se marca `true` después de enviar el segundo toque |
| `follow_up_scheduled_at` | Filtro: debe ser menor a la hora actual |
