# tacos-aragon-llamadas — Automated Phone Ordering Bot

Automated telephone ordering system for **Tacos Aragón** using Twilio + Google Cloud + Gemini. Customers call and place orders by voice; the bot transcribes, understands, and registers each sale in Loyverse POS.

## Architecture

```
Customer calls → Twilio → Webhook (server) → Google STT → Gemini → Loyverse
                    ↑                                       ↓
                    └──────────── Google TTS ───────────────┘
```

## Stack

- **Node.js + Express** — webhook server
- **Twilio** — phone number and call routing
- **Google Cloud STT/TTS** — speech-to-text and text-to-speech
- **Google Gemini** — natural language understanding
- **Loyverse POS** — order registration

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
pm2 start index.js --name bot-llamadas
```

## Environment Variables

```env
PORT=3001
BASE_URL=http://YOUR_PUBLIC_IP:3001

TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+526671234567

GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id

GEMINI_API_KEY=xxxxx

LOYVERSE_ACCESS_TOKEN=xxxxx
LOYVERSE_STORE_ID=xxxxx
```

## Project Structure

```
tacos-aragon-llamadas/
├── index.js                  # Main server + Twilio webhooks
├── call_state.js             # Active call state management
├── gemini_handler.js         # Gemini NLP processing
├── stt_handler.js            # Google Speech-to-Text
├── tts_handler.js            # Google Text-to-Speech
├── loyverse_integration.js   # Loyverse POS integration
├── datos/
│   ├── instrucciones.txt     # System prompt (shared with WhatsApp bot)
│   ├── menu.csv              # Product catalog
│   └── loyverse_config.json  # Loyverse IDs
└── audio_cache/              # Temporary MP3 files
```

## Estimated Monthly Cost

| Service | Approx. Cost |
|---------|--------------|
| Twilio MX number | $3 USD |
| Twilio minutes (50 calls/day × 4 min) | $15 USD |
| Google Cloud STT/TTS | $5 USD |
| Gemini API | $2 USD |
| **Total** | **~$25 USD/month** |

## Security

- Never commit the `.env` file
- Use HTTPS in production (nginx + Let's Encrypt)
- Consider rate limiting per caller

---

# tacos-aragon-llamadas — Bot de Llamadas Telefónicas

Sistema de atención telefónica automatizada para **Tacos Aragón** usando Twilio + Google Cloud + Gemini. Los clientes llaman y hacen pedidos por voz; el bot transcribe, entiende y registra cada venta en Loyverse POS.

## Arquitectura

```
Cliente llama → Twilio → Webhook (servidor) → Google STT → Gemini → Loyverse
                    ↑                                        ↓
                    └─────────── Google TTS ─────────────────┘
```

## Stack

- **Node.js + Express** — servidor de webhooks
- **Twilio** — número telefónico y enrutamiento de llamadas
- **Google Cloud STT/TTS** — reconocimiento y síntesis de voz
- **Google Gemini** — comprensión de lenguaje natural
- **Loyverse POS** — registro de órdenes

## Inicio rápido

```bash
npm install
copy .env.example .env
# Edita .env con tus credenciales
pm2 start index.js --name bot-llamadas
```

## Variables de entorno

```env
PORT=3001
BASE_URL=http://TU_IP_PUBLICA:3001

TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+526671234567

GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\a\service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=tu-proyecto-id

GEMINI_API_KEY=xxxxx

LOYVERSE_ACCESS_TOKEN=xxxxx
LOYVERSE_STORE_ID=xxxxx
```

## Estructura del proyecto

```
tacos-aragon-llamadas/
├── index.js                  # Servidor principal + webhooks Twilio
├── call_state.js             # Estado de llamadas activas
├── gemini_handler.js         # Procesamiento con Gemini
├── stt_handler.js            # Google Speech-to-Text
├── tts_handler.js            # Google Text-to-Speech
├── loyverse_integration.js   # Integración Loyverse POS
├── datos/
│   ├── instrucciones.txt     # System prompt (compartido con el bot WhatsApp)
│   ├── menu.csv              # Catálogo de productos
│   └── loyverse_config.json  # IDs de Loyverse
└── audio_cache/              # MP3s temporales
```

## Costos estimados mensuales

| Servicio | Costo aprox. |
|----------|-------------|
| Twilio número MX | $3 USD |
| Twilio minutos (50 llamadas/día × 4 min) | $15 USD |
| Google Cloud STT/TTS | $5 USD |
| Gemini API | $2 USD |
| **Total** | **~$25 USD/mes** |

## Seguridad

- **NUNCA** commitear el archivo `.env`
- Usar HTTPS en producción (nginx + Let's Encrypt)
- Considerar rate limiting por número llamante
