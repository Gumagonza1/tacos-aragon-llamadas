/**
 * Google Cloud Text-to-Speech Handler
 * Convierte texto a audio MP3 para reproducir en Twilio
 */

const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class TTSHandler {
  constructor() {
    this.client = new textToSpeech.TextToSpeechClient();
    this.audioDir = path.join(__dirname, 'audio_cache');

    // Asegurar que existe el directorio
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }

    this.voice = {
      languageCode: process.env.TTS_LANGUAGE_CODE || 'es-US',
      name: process.env.TTS_VOICE_NAME || 'es-US-Neural2-A',
      ssmlGender: 'FEMALE'
    };

    this.audioConfig = {
      audioEncoding: 'MP3',
      speakingRate: parseFloat(process.env.TTS_SPEAKING_RATE) || 0.9, // Más lento para mayor claridad
      pitch: parseFloat(process.env.TTS_PITCH) || 0.0
      // Sin effectsProfileId — ese perfil comprimía el audio y cortaba palabras
    };

    console.log('[TTS] Handler inicializado con voz:', this.voice.name);
  }

  /**
   * Preprocesa el texto antes de enviarlo al TTS
   * - Convierte $ a pesos para que no diga "dólares"
   * - Limpia emojis y caracteres especiales
   * - Limpia el bloque de confirmación para voz natural
   */
  preprocessText(text) {
    let processed = text;

    // Convertir $ a pesos ANTES de cualquier otra cosa
    processed = processed.replace(/\$(\d+)/g, '$1 pesos');

    // Limpiar emojis y símbolos que no se pronuncian bien
    processed = processed.replace(/[✅🌮🏠🛵💰💳🎉]/g, '');
    processed = processed.replace(/---[^-]*---/g, ''); // Quitar líneas separadoras
    processed = processed.replace(/_{2,}/g, '');       // Quitar guiones bajos múltiples

    // Si contiene ORDEN CONFIRMADA, extraer solo el resumen hablado
    if (processed.includes('ORDEN CONFIRMADA')) {
      // Construir mensaje hablado a partir del bloque de confirmación
      const totalMatch = processed.match(/TOTAL:\s*\$?(\d+)\s*pesos?/i) ||
                         processed.match(/TOTAL:\s*(\d+)\s*pesos?/i);
      const entregaMatch = processed.match(/ENTREGA:\s*(.+?)(?:\n|$)/i);
      const tiempoMatch = processed.match(/(\d+)\s*minutos/i);

      if (totalMatch) {
        const total = totalMatch[1];
        const entrega = entregaMatch ? entregaMatch[1].trim() : '';
        const esRecoger = /recoger/i.test(entrega);
        const tiempo = tiempoMatch ? tiempoMatch[1] : (esRecoger ? '15' : '20');

        processed = `Perfecto, su pedido quedó confirmado. Su total es de ${total} pesos. ` +
          (esRecoger
            ? `Su pedido estará listo en aproximadamente ${tiempo} minutos.`
            : `El pedido llega en aproximadamente ${tiempo} minutos.`);
      }
    }

    // Limpiar espacios múltiples
    processed = processed.replace(/\s+/g, ' ').trim();

    return processed;
  }

  /**
   * Convierte texto a audio y guarda archivo MP3
   */
  async textToSpeech(text) {
    try {
      // Preprocesar texto antes de enviarlo al TTS
      const processedText = this.preprocessText(text);

      console.log(`[TTS] Generando audio para: "${processedText.substring(0, 60)}..."`);

      const request = {
        input: { text: processedText },
        voice: this.voice,
        audioConfig: this.audioConfig
      };

      const [response] = await this.client.synthesizeSpeech(request);

      // Generar nombre único para el archivo
      const filename = `tts_${uuidv4()}.mp3`;
      const filepath = path.join(this.audioDir, filename);

      // Guardar audio
      fs.writeFileSync(filepath, response.audioContent, 'binary');
      console.log(`[TTS] Audio generado: ${filename}`);

      return {
        filepath,
        filename,
        url: `/audio/${filename}`
      };

    } catch (error) {
      console.error('[TTS] Error generando audio:', error.message);
      throw error;
    }
  }

  /**
   * Convierte texto con SSML
   */
  async textToSpeechSSML(ssmlText) {
    try {
      console.log('[TTS] Generando audio con SSML');

      const request = {
        input: { ssml: ssmlText },
        voice: this.voice,
        audioConfig: this.audioConfig
      };

      const [response] = await this.client.synthesizeSpeech(request);

      const filename = `tts_${uuidv4()}.mp3`;
      const filepath = path.join(this.audioDir, filename);

      fs.writeFileSync(filepath, response.audioContent, 'binary');
      console.log(`[TTS] Audio SSML generado: ${filename}`);

      return {
        filepath,
        filename,
        url: `/audio/${filename}`
      };

    } catch (error) {
      console.error('[TTS] Error generando audio SSML:', error.message);
      throw error;
    }
  }

  /**
   * Limpia archivos de audio antiguos (más de 1 hora)
   */
  cleanupOldAudio() {
    try {
      const files = fs.readdirSync(this.audioDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      let deleted = 0;
      files.forEach(file => {
        const filepath = path.join(this.audioDir, file);
        const stats = fs.statSync(filepath);
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlinkSync(filepath);
          deleted++;
        }
      });

      if (deleted > 0) {
        console.log(`[TTS] Limpiados ${deleted} archivos de audio antiguos`);
      }
    } catch (error) {
      console.error('[TTS] Error limpiando archivos:', error.message);
    }
  }

  /**
   * Retorna el path del directorio de audio
   */
  getAudioDirectory() {
    return this.audioDir;
  }
}

// Singleton
const ttsHandler = new TTSHandler();

// Limpieza automática cada hora
setInterval(() => ttsHandler.cleanupOldAudio(), 60 * 60 * 1000);

module.exports = ttsHandler;
