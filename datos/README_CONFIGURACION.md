# Configuración del Bot de Llamadas — Archivos Requeridos

Esta carpeta requiere ciertos archivos que **no están en el repositorio** por seguridad.
Créalos manualmente en tu servidor antes de iniciar el bot.

## Archivos de credenciales (crear manualmente)

| Archivo | Contenido | Cómo obtenerlo |
|---------|-----------|----------------|
| `loyverse_token.txt` | Token OAuth de Loyverse | Panel de Loyverse → Integraciones → API |
| `loyverse_store_id.txt` | UUID de tu tienda | Panel de Loyverse → Configuración |
| `loyverse_payment_type_id.txt` | UUID del tipo de pago | Usa `datos/obtener_payment_types` o el API de Loyverse |
| `google-credentials.json` | Service Account de Google Cloud | [console.cloud.google.com](https://console.cloud.google.com/iam-admin/serviceaccounts) |

## Archivos incluidos en el repositorio (no necesitas crearlos)

| Archivo | Contenido |
|---------|-----------|
| `menu.csv` | Menú del restaurante con IDs de Loyverse |
| `instrucciones.txt` | Prompt del sistema para la IA |
| `loyverse_config.json` | Configuración de modificadores y opciones |
| `loyverse_item_modifiers.json` | Mapa de modificadores de productos |

## Alternativa: Variables de entorno

En lugar de archivos `.txt`, configura todo en `.env`:

```
LOYVERSE_ACCESS_TOKEN=tu_token
LOYVERSE_STORE_ID=tu_uuid_de_tienda
```

## Google Cloud credentials

El archivo `google-credentials.json` es un Service Account de Google Cloud con permisos para:
- Cloud Speech-to-Text API
- Cloud Text-to-Speech API

Configura su ruta en `.env`:
```
GOOGLE_APPLICATION_CREDENTIALS=/ruta/completa/a/datos/google-credentials.json
```

> **Nunca** subas `google-credentials.json` al repositorio — contiene una llave privada de Google Cloud.
