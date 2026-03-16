/**
 * Google Gemini Handler para Bot de Llamadas
 * Adaptado del bot de WhatsApp - Tacos Aragón
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// CRITICAL: Fail fast if API key is missing
if (!process.env.GEMINI_API_KEY) {
  console.error('[Gemini] FATAL: GEMINI_API_KEY no está configurada en las variables de entorno');
  process.exit(1);
}

class GeminiHandler {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Configuración igual al bot WhatsApp
    const generationConfig = {
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 4096
    };
    
    this.model = this.genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig
    });
    
    this.systemInstructions = this.loadSystemInstructions();
    this.menu = this.loadMenu();
    
    console.log('[Gemini] Handler inicializado con modelo:', process.env.GEMINI_MODEL || 'gemini-1.5-flash');
  }

  /**
   * Carga las instrucciones del sistema desde instrucciones.txt
   */
  loadSystemInstructions() {
    try {
      const instructionsPath = path.join(__dirname, 'datos', 'instrucciones.txt');
      if (fs.existsSync(instructionsPath)) {
        const instructions = fs.readFileSync(instructionsPath, 'utf-8');
        console.log('[Gemini] Instrucciones del sistema cargadas');
        return instructions;
      } else {
        console.warn('[Gemini] ⚠️ No se encontró instrucciones.txt');
        return '';
      }
    } catch (error) {
      console.error('[Gemini] Error cargando instrucciones:', error.message);
      return '';
    }
  }

  /**
   * Carga el menú desde menu.csv (con IDs de Loyverse)
   */
  loadMenu() {
    try {
      const menuPath = path.join(__dirname, 'datos', 'menu.csv');
      if (fs.existsSync(menuPath)) {
        const menuContent = fs.readFileSync(menuPath, 'utf-8');
        console.log('[Gemini] Menú cargado desde menu.csv');
        return menuContent;
      } else {
        console.warn('[Gemini] ⚠️ No se encontró menu.csv');
        return '';
      }
    } catch (error) {
      console.error('[Gemini] Error cargando menú:', error.message);
      return '';
    }
  }

  /**
   * Procesa un mensaje del usuario y genera respuesta
   * Adaptado del bot WhatsApp con timeout y reintentos
   */
  async processMessage(conversationHistory, userMessage, nombreCliente = '', numeroCliente = '') {
    try {
      console.log(`[Gemini] Procesando mensaje: "${userMessage.substring(0, 50)}..."`);

      // Construir historial en formato texto (como bot WhatsApp)
      let historialTexto = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historialTexto = conversationHistory.map(msg => {
          const role = msg.role === 'user' ? 'Cliente' : 'Bot';
          return `${role}: ${msg.parts[0].text}`;
        }).join('\n') + '\n';
      }

      // Construir prompt completo (igual que bot WhatsApp)
      const prompt = `${this.systemInstructions}

--- MENÚ ---
${this.menu}

--- DATO INTERNO ---
Nombre: "${nombreCliente}" (SOLO PARA CALCULAR ENVÍO - NO SALUDES POR NOMBRE)
Número: "${numeroCliente}"

--- REGLA CRÍTICA DE CIERRE ---
Cuando el cliente confirme su pedido (dice "sí", "correcto", "listo", "eso es todo", etc.)
DEBES responder OBLIGATORIAMENTE con el formato de ORDEN CONFIRMADA.
SIN ESE FORMATO LA LLAMADA NO TERMINA.
NO puedes despedirte sin haber enviado el formato completo primero.

--- HISTORIAL DE CONVERSACIÓN ---
${historialTexto}

--- NUEVO MENSAJE ---
Cliente: "${userMessage}"

Bot:`;

      // Llamada con timeout de 60 segundos (como bot WhatsApp)
      const TIMEOUT_IA = 60000;
      let result;
      
      try {
        result = await this.conTimeout(
          this.model.generateContent(prompt),
          TIMEOUT_IA,
          'Timeout: Gemini tardó más de 60 segundos'
        );
      } catch (timeoutError) {
        console.error('[Gemini] Timeout en primera llamada, reintentando...');
        // Reintento (como bot WhatsApp)
        await new Promise(r => setTimeout(r, 2000));
        result = await this.conTimeout(
          this.model.generateContent(prompt),
          TIMEOUT_IA,
          'Timeout en reintento'
        );
      }

      let text = '';
      try {
        text = result.response.text().trim();
      } catch (eText) {
        console.log('[Gemini] Respuesta bloqueada por filtros, reintentando...');
      }

      // Si sigue vacío, reintentar una vez (como bot WhatsApp)
      if (!text) {
        console.log('[Gemini] Respuesta vacía, reintentando...');
        await new Promise(r => setTimeout(r, 2000));
        const result2 = await this.conTimeout(
          this.model.generateContent(prompt),
          TIMEOUT_IA,
          'Timeout en segundo reintento'
        );
        try {
          text = result2.response.text().trim();
        } catch (e) {
          text = '';
        }
      }

      if (!text) {
        throw new Error('Gemini devolvió respuesta vacía después de 2 reintentos');
      }

      console.log(`[Gemini] Respuesta generada: "${text.substring(0, 100)}..."`);

      // Detectar si es orden completa
      const isOrderComplete = text.includes('ORDEN CONFIRMADA');

      // Extraer JSON estructurado si existe (como bot WhatsApp)
      let ventaJSON = null;
      const jsonMatch = text.match(/!!!VENTA_JSON_INICIO!!!([\s\S]+?)!!!VENTA_JSON_FIN!!!/);
      if (jsonMatch) {
        try {
          ventaJSON = JSON.parse(jsonMatch[1].trim());
          console.log('[Gemini] JSON estructurado extraído');
        } catch (eJson) {
          console.log('[Gemini] JSON malformado, usando parser de texto');
        }
        // Quitar bloque JSON del texto visible
        text = text.replace(/!!!VENTA_JSON_INICIO!!![\s\S]+?!!!VENTA_JSON_FIN!!!/, '').trim();
      }

      // Limpiar cualquier JSON residual
      if (text.indexOf('!!!VENTA_JSON_INICIO!!!') !== -1) {
        text = text.replace(/!!!VENTA_JSON_INICIO!!![\s\S]*?(!!!VENTA_JSON_FIN!!!|$)/, '').trim();
      }

      return {
        text,
        isOrderComplete,
        orderData: isOrderComplete ? text : null,
        ventaJSON
      };

    } catch (error) {
      console.error('[Gemini] Error procesando mensaje:', error.message);
      throw error;
    }
  }

  /**
   * Timeout wrapper (como bot WhatsApp)
   */
  conTimeout(promesa, ms, mensajeError) {
    return Promise.race([
      promesa,
      new Promise((_, reject) => setTimeout(() => reject(new Error(mensajeError)), ms))
    ]);
  }

  /**
   * Adapta respuesta para que sea más natural en voz
   * Remueve formato de texto y listas
   */
  adaptResponseForVoice(text) {
    // Remover prefijos internos
    let adapted = text.replace(/ORDEN_COMPLETA:\s*/gi, '');
    adapted = adapted.replace(/!!!VENTA_JSON_INICIO!!![\s\S]*?!!!VENTA_JSON_FIN!!!/g, '');
    
    // Remover listas con bullets o números (solo del mensaje hablado, no de la confirmación)
    // La confirmación tiene formato especial que se respeta
    if (!adapted.includes('--- ORDEN CONFIRMADA ---')) {
      adapted = adapted.replace(/^\s*[-•*]\s*/gm, '');
      adapted = adapted.replace(/^\s*\d+\.\s*/gm, '');
    }
    
    // Convertir saltos de línea múltiples en pausas breves
    adapted = adapted.replace(/\n{3,}/g, '\n\n');
    
    // Limpiar espacios
    adapted = adapted.replace(/\s+/g, ' ').trim();
    
    // Limitar longitud de respuesta para voz (máximo ~200 palabras)
    const words = adapted.split(' ');
    if (words.length > 200) {
      console.log('[Gemini] Respuesta muy larga para voz, truncando...');
      adapted = words.slice(0, 200).join(' ') + '...';
    }
    
    return adapted;
  }
}

module.exports = new GeminiHandler();
