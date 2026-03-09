/**
 * Bot de Llamadas Telefónicas - Tacos Aragón
 * Servidor principal con webhooks de Twilio
 */

require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const path = require('path');
const priceCalculator = require('./price_calculator');

// Módulos propios
const callState = require('./call_state');
const sttHandler = require('./stt_handler');
const ttsHandler = require('./tts_handler');
const geminiHandler = require('./gemini_handler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir archivos de audio estáticos
app.use('/audio', express.static(ttsHandler.getAudioDirectory()));

// ─────────────────────────────────────────────
// HORARIO Y ZONA HORARIA (GMT-7 Culiacán)
// ─────────────────────────────────────────────

// Números que siempre pueden llamar aunque esté cerrado (pruebas)
const NUMEROS_PRUEBA = [
  '+1XXXXXXXXXX' // Tu número de prueba TextNow, // Numero de TextNow para pruebas
  '+52XXXXXXXXXX'
];

function getHoraLocal() {
  // GMT-7 (Culiacán, Sinaloa — Tiempo del Pacífico México)
  const ahora = new Date();
  const offsetMs = -7 * 60 * 60 * 1000;
  return new Date(ahora.getTime() + ahora.getTimezoneOffset() * 60000 + offsetMs);
}

function estaAbierto() {
  const ahora = getHoraLocal();
  const dia = ahora.getDay(); // 0=domingo, 1=lunes, 2=martes...
  const hora = ahora.getHours();
  const minutos = ahora.getMinutes();
  const horaDecimal = hora + minutos / 60;

  // Lunes cerrado
  if (dia === 1) return false;

  // Martes a domingo: 18:00 a 23:30
  return horaDecimal >= 18 && horaDecimal < 23.5;
}

function puedeAtender(phoneNumber) {
  // Números de prueba siempre pueden llamar
  if (NUMEROS_PRUEBA.includes(phoneNumber)) return true;
  // El resto respeta el horario
  return estaAbierto();
}

async function generateGreeting() {
  const ahora = getHoraLocal();
  const hora = ahora.getHours();

  if (hora < 12) return 'Buenas NOCHES, GRACIAS POR LLAMAR A Tacos Aragón, ¿qué desea ordenar?';
  if (hora < 19) return 'Buenas NOCHES, GRACIAS POR LLAMAR A Tacos Aragón, ¿qué desea ordenar?';
  return 'Buenas noches, GRACIAS POR LLAMAR A Tacos Aragón, ¿qué desea ordenar?';
}

// ─────────────────────────────────────────────
// WEBHOOKS DE TWILIO
// ─────────────────────────────────────────────

/**
 * Webhook: Cuando Twilio recibe una llamada entrante
 */
app.post('/webhook/voice', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const from = req.body.From;

    console.log(`\n=== NUEVA LLAMADA ===`);
    console.log(`CallSid: ${callSid}`);
    console.log(`Desde: ${from}`);
    console.log(`Puede atender: ${puedeAtender(from)}`);
    console.log(`Número en lista: ${NUMEROS_PRUEBA.includes(from)}`);

    // Verificar horario ANTES de inicializar la llamada
    if (!puedeAtender(from)) {
      console.log('[Voice] Llamada fuera de horario — informando y colgando');
      const mensajeCierre = 'Buenas, gracias por llamar a Tacos Aragón. Por el momento estamos cerrados. Nuestro horario es de martes a domingo de 6 de la tarde a 11 y media de la noche. Con gusto le atendemos en ese horario.';
      const audio = await ttsHandler.textToSpeech(mensajeCierre);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.play(`${process.env.BASE_URL}${audio.url}`);
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Inicializar estado de la llamada
    callState.initCall(callSid, from);

    // Generar saludo inicial
    const greeting = await generateGreeting();
    callState.addMessage(callSid, 'assistant', greeting);

    // Generar audio del saludo
    const audio = await ttsHandler.textToSpeech(greeting);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${process.env.BASE_URL}${audio.url}`);

    twiml.gather({
      input: 'speech',
      action: '/webhook/gather',
      language: 'es-MX',
      speechTimeout: 'auto',
      timeout: 3,
      hints: 'tacos, pastor, asada, adobada, orden, domicilio, recoger, confirmar, sí, no'
    });

    twiml.redirect('/webhook/no-input');

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Voice Webhook] Error:', error);
    handleError(res);
  }
});

/**
 * Webhook: Procesa la respuesta del cliente (después de Gather)
 */
app.post('/webhook/gather', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult;
    const from = req.body.From;

    console.log(`\n[Gather] CallSid: ${callSid}`);
    console.log(`[Gather] Cliente dijo: "${speechResult}"`);

    if (!speechResult) {
      return handleNoInput(req, res);
    }

    // Limpiar transcripción
    const cleanedInput = sttHandler.cleanTranscription(speechResult);
    callState.addMessage(callSid, 'user', cleanedInput);

    // Obtener datos del cliente
    const call = callState.getCall(callSid);
    const phoneNumber = call ? call.phoneNumber : from;
    const nombreCliente = phoneNumber;
    const numeroCliente = phoneNumber.replace(/[^0-9]/g, '');

    // Obtener historial y procesar con Gemini
    const history = callState.getHistory(callSid);
    const geminiResponse = await geminiHandler.processMessage(
      history.slice(0, -1),
      cleanedInput,
      nombreCliente,
      numeroCliente
    );

    // Adaptar respuesta para voz solo en mensajes intermedios
    let responseText = geminiResponse.text;
    if (!geminiResponse.isOrderComplete) {
      responseText = geminiHandler.adaptResponseForVoice(responseText);
    }

    callState.addMessage(callSid, 'assistant', responseText);

        // Si la orden está completa, calcular total real y procesar
    if (geminiResponse.isOrderComplete) {
      console.log(`[Gather] Orden completa detectada`);

      // Calcular total desde el CSV (no confiar en el total de Gemini)
      let ordenFinal = geminiResponse.orderData;
      try {
        const calculo = priceCalculator.calcularTotal(ordenFinal);
        if (calculo.total > 0) {
          ordenFinal = priceCalculator.inyectarTotal(ordenFinal, calculo.total);
          console.log(`[Precios] Total calculado: $${calculo.total}`);
        }
      } catch (eCalc) {
        console.error('[Precios] Error calculando total:', eCalc.message);
      }

      return await handleOrderComplete(req, res, callSid, ordenFinal, geminiResponse.ventaJSON, numeroCliente, nombreCliente);
    }

    // Generar audio de respuesta y continuar conversación
    const audio = await ttsHandler.textToSpeech(responseText);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${process.env.BASE_URL}${audio.url}`);

    twiml.gather({
      input: 'speech',
      action: '/webhook/gather',
      language: 'es-MX',
      speechTimeout: 'auto',
      timeout: 3,
      hints: 'tacos, pastor, asada, adobada, orden, domicilio, recoger, confirmar, sí, no'
    });

    twiml.redirect('/webhook/no-input');

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Gather Webhook] Error:', error);
    handleError(res);
  }
});

/**
 * Webhook: Cuando no hay respuesta del cliente
 */
app.post('/webhook/no-input', (req, res) => {
  console.log('[No Input] Cliente no respondió');

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('¿Sigue ahí? No escuché su respuesta.', {
    language: 'es-MX',
    voice: 'woman'
  });

  twiml.gather({
    input: 'speech',
    action: '/webhook/gather',
    language: 'es-MX',
    speechTimeout: 'auto',
    timeout: 3
  });

  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Webhook: Cuando la llamada finaliza
 */
app.post('/webhook/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`[Status] ${callSid} - ${callStatus}`);

  if (callStatus === 'completed' || callStatus === 'failed') {
    callState.endCall(callSid);
  }

  res.sendStatus(200);
});

// ─────────────────────────────────────────────
// MANEJO DE ORDEN COMPLETA
// ─────────────────────────────────────────────

async function handleOrderComplete(req, res, callSid, orderData, ventaJSON, numeroCliente, nombreCliente) {
  try {
    console.log('[Order Complete] Procesando orden...');
    console.log('[Order Complete] Texto del pedido:', orderData.substring(0, 200));

    const { crearOrdenEnLoyverse } = require('./loyverse_integration');

    let ordenLoyverse = null;
    try {
      console.log('🛒 Registrando en Loyverse...');
      ordenLoyverse = await crearOrdenEnLoyverse(orderData, nombreCliente, numeroCliente, ventaJSON);

      if (ordenLoyverse) {
        console.log(`✅ Loyverse: #${ordenLoyverse.receipt_number}`);
        console.log(`💰 Total: $${ordenLoyverse.total_money}`);
      } else {
        console.log('⚠️ No se pudo crear orden en Loyverse');
      }
    } catch (eLoy) {
      console.error('❌ Error Loyverse:', eLoy.message);
    }

    let farewell;
    if (ordenLoyverse) {
      farewell = `Listo, su pedido número ${ordenLoyverse.receipt_number} quedó registrado. En breve le llegará la confirmación por WhatsApp. ¡Buen provecho!`;
    } else {
      farewell = 'Listo, su pedido quedó registrado. En breve le llegará la confirmación. ¡Buen provecho!';
    }

    const audio = await ttsHandler.textToSpeech(farewell);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${process.env.BASE_URL}${audio.url}`);
    twiml.hangup();

    callState.updateStage(callSid, 'completed');
    callState.setOrderData(callSid, {
      orderText: orderData,
      loyverseReceipt: ordenLoyverse ? ordenLoyverse.receipt_number : null,
      timestamp: new Date()
    });

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('[Order Complete] Error:', error);
    handleError(res);
  }
}

// ─────────────────────────────────────────────
// MANEJO DE ERRORES
// ─────────────────────────────────────────────

function handleError(res) {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Lo siento, hubo un error. Por favor intente llamar más tarde.', {
    language: 'es-MX',
    voice: 'woman'
  });
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
}

// ─────────────────────────────────────────────
// HEALTH CHECK Y SERVIDOR
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  const ahora = getHoraLocal();
  res.json({
    status: 'OK',
    service: 'Bot de Llamadas - Tacos Aragón',
    timestamp: new Date().toISOString(),
    horaLocal: ahora.toLocaleTimeString('es-MX'),
    abierto: estaAbierto(),
    activeCalls: callState.activeCalls.size
  });
});

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║   Bot de Llamadas - Tacos Aragón         ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📞 Webhook URL: ${process.env.BASE_URL}/webhook/voice`);
  console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});