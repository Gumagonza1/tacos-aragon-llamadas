# Bot de Llamadas Telefónicas - Tacos Aragón

Sistema de atención telefónica automatizada con IA para toma de pedidos usando Twilio + Google Cloud + Gemini.

## 🏗️ Arquitectura

```
Cliente llama → Twilio → Webhook (VM) → Google STT → Gemini → Loyverse
                    ↑                                    ↓
                    └────────── Google TTS ──────────────┘
```

## 📋 Requisitos Previos

- **Node.js** 16+ instalado en la VM
- **PM2** instalado globalmente (`npm install -g pm2`)
- **Cuenta de Twilio** con número mexicano
- **Google Cloud Project** con Speech-to-Text y Text-to-Speech habilitados
- **Archivo de credenciales JSON** de Google Cloud
- **API Key de Gemini** (Google AI Studio)
- **Loyverse Access Token**

## 📦 Instalación

### 1. Clonar o copiar el proyecto en la VM

```bash
# En tu VM Windows Server
cd C:\Users\gumaro_gonzalez\Desktop\
# Copiar toda la carpeta bot-llamadas aquí
```

### 2. Instalar dependencias

```bash
cd bot-llamadas
npm install
```

### 3. Configurar variables de entorno

Crear archivo `.env` copiando de `.env.example`:

```bash
copy .env.example .env
```

Editar `.env` con tus credenciales:

```env
# Servidor
PORT=3001
BASE_URL=http://TU_IP_PUBLICA:3001

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx...
TWILIO_AUTH_TOKEN=xxxxx...
TWILIO_PHONE_NUMBER=+526671234567

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=tu-proyecto-id

# Gemini
GEMINI_API_KEY=xxxxx...

# Loyverse
LOYVERSE_ACCESS_TOKEN=xxxxx...
LOYVERSE_STORE_ID=xxxxx...
```

### 4. Copiar archivos del bot de WhatsApp

Copiar estos archivos desde `C:\Users\gumaro_gonzalez\Desktop\bot-tacos\`:

```bash
# Copiar instrucciones del sistema
copy ..\bot-tacos\datos\instrucciones.txt datos\

# Copiar menú
copy ..\bot-tacos\datos\menu.csv datos\

# Copiar configuración de Loyverse
copy ..\bot-tacos\datos\loyverse_config.json datos\

# Copiar integración de Loyverse completa
copy ..\bot-tacos\loyverse_integration.js .
```

### 5. Configurar firewall en Google Cloud

Abrir puerto 3001 en la consola de Google Cloud:

1. Ve a **VPC Network → Firewall**
2. Crear regla de entrada:
   - **Name:** allow-twilio-webhook
   - **Direction:** Ingress
   - **Targets:** All instances in the network
   - **Source IP ranges:** `0.0.0.0/0`
   - **Protocols and ports:** TCP: 3001

### 6. Configurar Twilio

1. Ir a [Twilio Console](https://console.twilio.com/)
2. **Phone Numbers → Active Numbers**
3. Seleccionar tu número mexicano
4. En **Voice & Fax → A CALL COMES IN:**
   - Webhook: `http://TU_IP_PUBLICA:3001/webhook/voice`
   - HTTP POST
5. En **Primary Handler Fails:**
   - URL: `http://TU_IP_PUBLICA:3001/webhook/status`
6. Guardar

## 🚀 Ejecución

### Desarrollo (local)

```bash
npm run dev
```

### Producción (con PM2)

```bash
# Iniciar
pm2 start index.js --name bot-llamadas

# Ver logs
pm2 logs bot-llamadas

# Reiniciar
pm2 restart bot-llamadas

# Detener
pm2 stop bot-llamadas

# Auto-iniciar al reiniciar VM
pm2 startup
pm2 save
```

## 📞 Probar el Bot

1. Llama al número de Twilio configurado
2. El bot debería contestar con el saludo
3. Haz un pedido de prueba
4. Verifica logs en consola o PM2

## 🔍 Monitoreo

### Ver logs en tiempo real

```bash
pm2 logs bot-llamadas --lines 100
```

### Health check

```bash
curl http://localhost:3001/health
```

### Ver llamadas activas

```bash
# Los logs mostrarán cada llamada con su CallSid
```

## 🛠️ Troubleshooting

### El webhook no recibe llamadas

- Verifica que el firewall de Google Cloud permite el puerto 3001
- Confirma que la IP pública es correcta en Twilio
- Revisa que el servidor esté corriendo: `pm2 status`

### Error de Google Cloud credentials

```bash
# Verifica que la ruta sea correcta
echo %GOOGLE_APPLICATION_CREDENTIALS%

# El archivo debe existir
dir "C:\path\to\service-account-key.json"
```

### Error de Gemini "API key not valid"

- Verifica que `GEMINI_API_KEY` esté en `.env`
- Crea una key en [Google AI Studio](https://makersuite.google.com/app/apikey)

### Audio no se reproduce

- Verifica que la carpeta `audio_cache` exista
- Confirma que `/audio` es accesible: `http://TU_IP:3001/audio/`

## 📁 Estructura del Proyecto

```
bot-llamadas/
├── index.js                  # Servidor principal + webhooks
├── call_state.js             # Estado de llamadas activas
├── gemini_handler.js         # Procesamiento con Gemini
├── stt_handler.js            # Google Speech-to-Text
├── tts_handler.js            # Google Text-to-Speech
├── loyverse_integration.js   # Integración con Loyverse
├── datos/
│   ├── instrucciones.txt     # Prompt del sistema
│   ├── menu.csv              # Catálogo de productos
│   └── loyverse_config.json  # IDs de Loyverse
├── audio_cache/              # MP3s temporales
├── .env                      # Variables de entorno
└── package.json
```

## 🔐 Seguridad

- **NUNCA** commitear el archivo `.env` a Git
- Mantener las API keys seguras
- Considerar implementar rate limiting
- Usar HTTPS en producción (con nginx + Let's Encrypt)

## 💰 Costos Estimados

| Servicio | Costo Mensual Aprox. |
|----------|---------------------|
| Twilio número MX | $3 USD |
| Twilio minutos (50 llamadas/día × 4 min) | $15 USD |
| Google Cloud STT/TTS | $5 USD |
| Gemini API | $2 USD |
| **Total** | **~$25 USD/mes** |

## 📝 Notas

- El bot usa las **mismas instrucciones** que el bot de WhatsApp
- La integración con Loyverse es **idéntica** al bot de WhatsApp
- Los archivos de audio se limpian automáticamente cada hora
- Las llamadas antiguas (30+ min) se limpian automáticamente

## 🆘 Soporte

Si algo no funciona:

1. Revisa los logs: `pm2 logs bot-llamadas`
2. Verifica el health check: `curl http://localhost:3001/health`
3. Confirma que todas las API keys son válidas
4. Revisa que el firewall permite el puerto 3001
