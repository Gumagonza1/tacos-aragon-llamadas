/**
 * Script de pruebas para validar componentes
 * Uso: node test.js [componente]
 * 
 * Componentes: tts, stt, gemini, all
 */

require('dotenv').config();

async function testTTS() {
  console.log('\n🔊 Probando Text-to-Speech...\n');
  
  try {
    const ttsHandler = require('./tts_handler');
    
    const testText = 'Buen día, habla a Tacos Aragón. ¿En qué le puedo ayudar?';
    console.log(`Texto a convertir: "${testText}"`);
    
    const result = await ttsHandler.textToSpeech(testText);
    console.log('✅ Audio generado exitosamente');
    console.log(`   Archivo: ${result.filename}`);
    console.log(`   URL: ${result.url}`);
    
  } catch (error) {
    console.error('❌ Error en TTS:', error.message);
  }
}

async function testSTT() {
  console.log('\n🎤 Probando Speech-to-Text...\n');
  
  try {
    const sttHandler = require('./stt_handler');
    const fs = require('fs');
    const path = require('path');
    
    // Buscar un archivo de audio de prueba
    const testAudioPath = path.join(__dirname, 'test_audio.wav');
    
    if (!fs.existsSync(testAudioPath)) {
      console.log('⚠️  No se encontró archivo test_audio.wav');
      console.log('   Crea un archivo de audio de prueba para probar STT');
      return;
    }
    
    console.log('Transcribiendo audio...');
    const transcription = await sttHandler.transcribeFile(testAudioPath);
    console.log('✅ Transcripción exitosa');
    console.log(`   Texto: "${transcription}"`);
    
    const cleaned = sttHandler.cleanTranscription(transcription);
    console.log(`   Limpio: "${cleaned}"`);
    
  } catch (error) {
    console.error('❌ Error en STT:', error.message);
  }
}

async function testGemini() {
  console.log('\n🤖 Probando Gemini...\n');
  
  try {
    const geminiHandler = require('./gemini_handler');
    
    const testMessage = 'Quiero ordenar 3 tacos de pastor';
    console.log(`Mensaje de prueba: "${testMessage}"`);
    
    const response = await geminiHandler.processMessage([], testMessage);
    console.log('✅ Respuesta de Gemini:');
    console.log(`   ${response.text}`);
    console.log(`   Orden completa: ${response.isOrderComplete ? 'Sí' : 'No'}`);
    
  } catch (error) {
    console.error('❌ Error en Gemini:', error.message);
  }
}

async function testAll() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Pruebas de Componentes - Bot Llamadas ║');
  console.log('╚════════════════════════════════════════╝');
  
  await testTTS();
  await testSTT();
  await testGemini();
  
  console.log('\n✅ Pruebas completadas\n');
}

// Ejecutar según argumento
const component = process.argv[2] || 'all';

switch(component.toLowerCase()) {
  case 'tts':
    testTTS();
    break;
  case 'stt':
    testSTT();
    break;
  case 'gemini':
    testGemini();
    break;
  case 'all':
    testAll();
    break;
  default:
    console.log('Uso: node test.js [tts|stt|gemini|all]');
}
