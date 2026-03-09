# 🚀 Guía Rápida de Inicio - 15 Minutos

## ✅ Lo que YA ESTÁ LISTO

- ✅ Código del bot completo
- ✅ Integración con Loyverse (mismo código del bot WhatsApp)
- ✅ Integración con Gemini (misma lógica que WhatsApp)
- ✅ Instrucciones adaptadas para VOZ
- ✅ Menú y configuración de Loyverse
- ✅ Handlers de TTS y STT

## 📋 Checklist de 15 Minutos

### 1️⃣ Copiar a tu VM (2 min)

```bash
# En tu VM Windows
cd C:\Users\gumaro_gonzalez\Desktop\
# Copia aquí toda la carpeta bot-llamadas
```

### 2️⃣ Instalar dependencias (3 min)

```bash
cd bot-llamadas
setup.bat
# O manualmente:
npm install
```

### 3️⃣ Configurar .env (5 min)

```bash
copy .env.example .env
notepad .env
```

**Edita estos valores OBLIGATORIOS:**

```env
BASE_URL=http://TU_IP_PUBLICA:3001

# Twilio (de tu consola)
TWILIO_ACCOUNT_SID=ACxxxxx...
TWILIO_AUTH_TOKEN=xxxxx...
TWILIO_PHONE_NUMBER=+526671234567

# Google Cloud (ruta completa al JSON)
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\gumaro_gonzalez\Desktop\bot-llamadas\datos\google-credentials.json
GOOGLE_CLOUD_PROJECT_ID=tu-proyecto

# Gemini (de AI Studio)
GEMINI_API_KEY=xxxxx...
```

### 4️⃣ Copiar archivo de credenciales de Google (1 min)

```bash
# Copia tu archivo de Google Cloud service account JSON a:
C:\Users\gumaro_gonzalez\Desktop\bot-llamadas\datos\google-credentials.json
```

### 5️⃣ Configurar Store ID de Loyverse (1 min)

Abre `datos\loyverse_store_id.txt` y pega tu Store ID

(Cópialo del bot de WhatsApp o de la consola de Loyverse)

### 6️⃣ Abrir puerto en Google Cloud (2 min)

1. Google Cloud Console → VPC Network → Firewall
2. CREATE FIREWALL RULE:
   - **Name:** allow-twilio-webhook
   - **Direction:** Ingress
   - **Targets:** All instances
   - **Source IP:** 0.0.0.0/0
   - **Protocols:** TCP 3001
3. CREATE

### 7️⃣ Configurar Twilio (1 min)

1. Twilio Console → Phone Numbers
2. Tu número → Configure
3. **A CALL COMES IN:**
   - Webhook: `http://TU_IP_PUBLICA:3001/webhook/voice`
   - HTTP POST
4. Save

## 🧪 Primera Prueba

```bash
# Inicia el bot
npm start

# Verifica que esté corriendo
# Deberías ver: "🚀 Servidor corriendo en puerto 3001"
```

**Llama al número de Twilio desde tu celular**

✅ Debería contestar con: "Buen día, habla a Tacos Aragón..."

## 🔥 Poner en Producción con PM2

```bash
# Detener el servidor de prueba (Ctrl+C)

# Iniciar con PM2
pm2 start index.js --name bot-llamadas

# Configurar auto-inicio
pm2 startup
pm2 save

# Ver logs
pm2 logs bot-llamadas
```

## ❓ Si algo no funciona

### El bot no contesta llamadas

```bash
# 1. Verificar que está corriendo
pm2 status

# 2. Ver logs
pm2 logs bot-llamadas --err

# 3. Verificar firewall
netstat -an | findstr 3001
```

### Error de Google Cloud

```bash
# Verificar que el archivo existe
dir datos\google-credentials.json

# Verificar que la ruta en .env es correcta
echo %GOOGLE_APPLICATION_CREDENTIALS%
```

### Error de Gemini

```bash
# Verificar API key
# Genera una nueva en: https://makersuite.google.com/app/apikey
```

## 📞 ¡Listo!

Tu bot está funcionando. Prueba haciendo un pedido completo por teléfono.

El pedido se registrará automáticamente en Loyverse igual que el bot de WhatsApp.

---

**Documentación completa:** README.md
**Checklist detallado:** DEPLOYMENT_CHECKLIST.md
