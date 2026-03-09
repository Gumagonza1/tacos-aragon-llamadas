/**
 * Manejo del estado de llamadas activas
 * Cada llamada mantiene su historial de conversación y estado
 */

class CallState {
  constructor() {
    this.activeCalls = new Map();
  }

  /**
   * Inicializa una nueva llamada
   */
  initCall(callSid, phoneNumber) {
    this.activeCalls.set(callSid, {
      callSid,
      phoneNumber,
      conversationHistory: [],
      orderData: null,
      stage: 'greeting', // greeting, taking_order, confirming, completed
      startTime: new Date(),
      turnCount: 0
    });
    console.log(`[CallState] Nueva llamada iniciada: ${callSid} desde ${phoneNumber}`);
  }

  /**
   * Agrega un mensaje al historial de la llamada
   */
  addMessage(callSid, role, content) {
    const call = this.activeCalls.get(callSid);
    if (!call) {
      console.error(`[CallState] Llamada no encontrada: ${callSid}`);
      return;
    }

    call.conversationHistory.push({
      role, // 'user' o 'assistant'
      content,
      timestamp: new Date()
    });

    call.turnCount++;
    console.log(`[CallState] Mensaje agregado (${role}): ${content.substring(0, 50)}...`);
  }

  /**
   * Obtiene el historial de conversación formateado para Gemini
   */
  getHistory(callSid) {
    const call = this.activeCalls.get(callSid);
    if (!call) return [];
    
    return call.conversationHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Actualiza el stage de la llamada
   */
  updateStage(callSid, newStage) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.stage = newStage;
      console.log(`[CallState] ${callSid} -> stage: ${newStage}`);
    }
  }

  /**
   * Guarda datos del pedido
   */
  setOrderData(callSid, orderData) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      call.orderData = orderData;
      console.log(`[CallState] Orden guardada para ${callSid}`);
    }
  }

  /**
   * Obtiene los datos completos de la llamada
   */
  getCall(callSid) {
    return this.activeCalls.get(callSid);
  }

  /**
   * Finaliza y limpia una llamada
   */
  endCall(callSid) {
    const call = this.activeCalls.get(callSid);
    if (call) {
      const duration = (new Date() - call.startTime) / 1000;
      console.log(`[CallState] Llamada finalizada: ${callSid} (${duration.toFixed(1)}s, ${call.turnCount} turnos)`);
      this.activeCalls.delete(callSid);
    }
  }

  /**
   * Limpia llamadas antiguas (más de 30 minutos sin actividad)
   */
  cleanupOldCalls() {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    for (const [callSid, call] of this.activeCalls.entries()) {
      const lastMessage = call.conversationHistory[call.conversationHistory.length - 1];
      const lastActivity = lastMessage ? lastMessage.timestamp : call.startTime;
      
      if (lastActivity < thirtyMinutesAgo) {
        console.log(`[CallState] Limpiando llamada antigua: ${callSid}`);
        this.activeCalls.delete(callSid);
      }
    }
  }
}

// Singleton
const callState = new CallState();

// Limpieza automática cada 10 minutos
setInterval(() => callState.cleanupOldCalls(), 10 * 60 * 1000);

module.exports = callState;
