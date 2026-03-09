# Checklist de Deployment - Bot de Llamadas

## Pre-requisitos ✅

### Credenciales y Accesos
- [ ] Cuenta de Twilio creada
- [ ] Número telefónico mexicano comprado en Twilio (+52)
- [ ] Google Cloud Project creado
- [ ] Speech-to-Text API habilitada en Google Cloud
- [ ] Text-to-Speech API habilitada en Google Cloud
- [ ] Service Account de Google Cloud creado y JSON descargado
- [ ] API Key de Gemini obtenida desde Google AI Studio
- [ ] Access Token de Loyverse disponible

### Infraestructura
- [ ] VM de Google Cloud con Windows Server corriendo
- [ ] Acceso por Tailscale funcionando
- [ ] Node.js instalado (verificar: `node --version`)
- [ ] PM2 instalado globalmente (`npm install -g pm2`)
- [ ] Puerto 3001 libre (verificar: `netstat -an | findstr 3001`)

## Instalación del Proyecto 📦

### 1. Copiar Archivos
- [ ] Carpeta `bot-llamadas` copiada a `C:\Users\gumaro_gonzalez\Desktop\`
- [ ] Archivo `.env` creado desde `.env.example`
- [ ] Dependencias instaladas (`npm install`)

### 2. Copiar Archivos del Bot WhatsApp
- [ ] `datos\instrucciones.txt` copiado desde bot-tacos
- [ ] `datos\menu.csv` copiado desde bot-tacos
- [ ] `datos\loyverse_config.json` copiado desde bot-tacos
- [ ] `loyverse_integration.js` copiado desde bot-tacos

### 3. Configurar Variables de Entorno (.env)
- [ ] `PORT=3001`
- [ ] `BASE_URL` con IP pública de la VM
- [ ] `TWILIO_ACCOUNT_SID` configurado
- [ ] `TWILIO_AUTH_TOKEN` configurado
- [ ] `TWILIO_PHONE_NUMBER` con formato +526671234567
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` con ruta completa al JSON
- [ ] `GOOGLE_CLOUD_PROJECT_ID` configurado
- [ ] `GEMINI_API_KEY` configurado
- [ ] `LOYVERSE_ACCESS_TOKEN` configurado
- [ ] `LOYVERSE_STORE_ID` configurado

## Configuración de Red 🌐

### Google Cloud Firewall
- [ ] Regla de firewall creada para puerto 3001
- [ ] Nombre de regla: `allow-twilio-webhook`
- [ ] Dirección: Ingress
- [ ] IP ranges: `0.0.0.0/0`
- [ ] Protocolo: TCP, Puerto: 3001
- [ ] IP pública de la VM confirmada (Compute Engine → VM instances)

### Twilio Configuration
- [ ] Webhook de voz configurado: `http://[IP_PUBLICA]:3001/webhook/voice`
- [ ] Método: POST
- [ ] Status callback: `http://[IP_PUBLICA]:3001/webhook/status`
- [ ] Configuración guardada en Twilio Console

## Pruebas Previas al Lanzamiento 🧪

### Pruebas de Componentes
- [ ] TTS funciona: `node test.js tts`
- [ ] Gemini responde: `node test.js gemini`
- [ ] Servidor arranca: `npm start`
- [ ] Health check responde: `http://localhost:3001/health`

### Prueba de Integración
- [ ] Servidor corriendo en PM2: `pm2 start ecosystem.config.json`
- [ ] Logs visibles: `pm2 logs bot-llamadas`
- [ ] Health check accesible desde exterior: `http://[IP_PUBLICA]:3001/health`

## Primera Llamada de Prueba 📞

### Preparación
- [ ] PM2 corriendo con el bot
- [ ] Logs abiertos en otra ventana: `pm2 logs bot-llamadas --lines 100`
- [ ] Twilio webhook configurado

### Realizar Llamada
- [ ] Llamar al número de Twilio desde un celular
- [ ] Bot contesta con saludo
- [ ] Bot entiende respuestas en español
- [ ] Conversación fluye correctamente
- [ ] Pedido se procesa correctamente
- [ ] Llamada finaliza correctamente

### Verificar Logs
- [ ] `NUEVA LLAMADA` aparece en logs
- [ ] `[STT]` muestra transcripciones
- [ ] `[Gemini]` muestra respuestas
- [ ] `[TTS]` genera audios
- [ ] Sin errores críticos en logs

## Post-Deployment ✨

### Optimización
- [ ] PM2 configurado para auto-reinicio: `pm2 startup`
- [ ] Configuración de PM2 guardada: `pm2 save`
- [ ] Carpeta `logs/` existe para PM2
- [ ] Audio cache limpiándose automáticamente

### Monitoreo
- [ ] Dashboard de PM2: `pm2 monit`
- [ ] Logs accesibles: `pm2 logs bot-llamadas`
- [ ] Health check funcional

### Documentación
- [ ] URL del webhook documentada
- [ ] Credenciales guardadas de forma segura
- [ ] Proceso de reinicio documentado
- [ ] Contacto de soporte técnico definido

## Troubleshooting Rápido 🔧

### Si el bot no contesta:
1. Verificar: `pm2 status`
2. Verificar logs: `pm2 logs bot-llamadas --err`
3. Verificar firewall: puerto 3001 abierto
4. Verificar webhook en Twilio

### Si hay errores de Google Cloud:
1. Verificar ruta de credenciales en `.env`
2. Verificar que el archivo JSON existe
3. Verificar que las APIs están habilitadas

### Si Gemini no responde:
1. Verificar API key en `.env`
2. Verificar que `instrucciones.txt` existe
3. Verificar logs de Gemini

---

## ✅ Deployment Completado

Fecha: _______________
Deployado por: _______________
Número de Twilio: _______________
IP Pública VM: _______________

**El bot está listo para recibir llamadas reales de clientes.**
