/**
 * Google Cloud Speech-to-Text Handler
 * Transcribe audio de Twilio a texto
 */

const speech = require('@google-cloud/speech');
const fs = require('fs');

class STTHandler {
  constructor() {
    this.client = new speech.SpeechClient();
    this.config = {
      encoding: process.env.STT_ENCODING || 'MULAW',
      sampleRateHertz: parseInt(process.env.STT_SAMPLE_RATE_HERTZ) || 8000,
      languageCode: process.env.STT_LANGUAGE_CODE || 'es-MX',
      model: 'phone_call',
      useEnhanced: true,
      enableAutomaticPunctuation: true,
      // Frases del negocio para mejorar precisión
	speechContexts: [{
  		phrases: [
    		'tacos', 'asada', 'adobada', 'quesadilla', 'combo',
    		'Combo Harinita', 'Combo Pequeñin', 'Combo Taquitos',
    		'Combo Familiar', 'Combo Mini', 'Combo del Amor',
    		'domicilio', 'recoger', 'efectivo', 'transferencia', 'tarjeta',
    		'con todo', 'natural', 'sin frijol', 'sin cebolla', 'sin picante',
    		'puro jugo', 'jamaica', 'horchata', 'cebada', 'pellizcada',
    		'planchada', 'taquito', 'vampiro', 'orden', 'confirmar',
    		'sí', 'no', 'correcto', 'listo', 'eso es todo'
  		],
  boost: 20
	}]
    };

    console.log('[STT] Handler inicializado');
  }

  /**
   * Transcribe audio desde URL (para archivos de Twilio)
   */
  async transcribeFromURL(audioURL) {
    try {
      console.log(`[STT] Descargando audio de: ${audioURL}`);
      const axios = require('axios');
      const response = await axios.get(audioURL, { responseType: 'arraybuffer' });
      const audioBytes = Buffer.from(response.data);
      return await this.transcribeBuffer(audioBytes);
    } catch (error) {
      console.error('[STT] Error descargando audio:', error.message);
      throw error;
    }
  }

  /**
   * Transcribe audio desde buffer
   */
  async transcribeBuffer(audioBuffer) {
    try {
      const audio = {
        content: audioBuffer.toString('base64')
      };

      const request = {
        audio,
        config: this.config
      };

      console.log('[STT] Enviando audio a Google Speech-to-Text...');
      const [response] = await this.client.recognize(request);

      if (!response.results || response.results.length === 0) {
        console.log('[STT] No se detectó voz en el audio');
        return '';
      }

      const result = response.results[0];

      // Descartar si la confianza es menor al 70%
      const confidence = result.alternatives[0].confidence;
      if (confidence > 0 && confidence < 0.7) {
        console.log(`[STT] Transcripción descartada por baja confianza: ${(confidence * 100).toFixed(0)}%`);
        return '';
      }

      const transcription = response.results
        .map(r => r.alternatives[0].transcript)
        .join(' ');

      console.log(`[STT] Transcripción (confianza: ${confidence ? (confidence * 100).toFixed(0) + '%' : 'N/A'}): "${transcription}"`);
      return transcription;

    } catch (error) {
      console.error('[STT] Error en transcripción:', error.message);
      throw error;
    }
  }

  /**
   * Transcribe desde archivo local
   */
  async transcribeFile(filePath) {
    try {
      const audioBytes = fs.readFileSync(filePath);
      return await this.transcribeBuffer(audioBytes);
    } catch (error) {
      console.error('[STT] Error leyendo archivo:', error.message);
      throw error;
    }
  }

  /**
   * Limpia palabras de relleno comunes en español mexicano
   */
cleanTranscription(text) {
  // 1. Quitar palabras de relleno
  const fillerWords = [
    'este', 'eh', 'mmm', 'este pues', 'o sea',
    'este como', 'verdad', 'pues sí', 'híjole', 'órale', 'ándale'
  ];

  let cleaned = text;
  fillerWords.forEach(filler => {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // 2. Correcciones de nombres del menú mal transcritos
  const correcciones = [
    // Carnes
    [/\bazada\b/gi,                    'asada'],
    [/\basadaa\b/gi,                   'asada'],
    [/\badobado\b/gi,                  'adobada'],

    // Combos mal escuchados
    [/combo\s*(niñita|arenita|herita|harinita|erita|harita|ñorita|señorita)/gi, 'Combo Harinita'],
    [/combo\s*(pequeñin|pequeñín|pequeñi|pequeño)/gi,  'Combo Pequeñin'],
    [/combo\s*(taquito|taquitos)/gi,   'Combo Taquitos'],
    [/combo\s*(familiar|familia)/gi,   'Combo Familiar'],
    [/combo\s*(mini|minis)/gi,         'Combo Mini'],
    [/combo\s*(del\s*amor|el amor|delamor)/gi, 'Combo del Amor'],

    // Productos
    [/\bquesadiyita\b/gi,              'quesadillita'],
    [/\bquesadiya\b/gi,                'quesadilla'],
    [/\bpeliscada\b/gi,                'pellizcada'],
    [/\bpeliscara\b/gi,                'pellizcada'],
    [/\bplanchara\b/gi,                'planchada'],
    [/\btaqueto\b/gi,                  'taquito'],

    // Verduras
    [/\bcon todo\b/gi,                 'con todo'],
    [/\bnatural\b/gi,                  'natural'],
    [/\bsin frijol\b/gi,               'sin frijol'],
    [/\bsin ceboya\b/gi,               'sin cebolla'],
    [/\bpuro jugo\b/gi,                'puro jugo'],

    // Bebidas
    [/\bjamaica\b/gi,                  'jamaica'],
    [/\borchata\b/gi,                  'horchata'],
    [/\bsebada\b/gi,                   'cebada'],
  ];

  correcciones.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern, replacement);
  });

  // 3. Limpiar espacios múltiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
	}
}

module.exports = new STTHandler();
