// 🔧 MÓDULO DE INTEGRACIÓN CON LOYVERSE
// Este código se agrega a tu index.js

const https = require('https');
const fs = require('fs');
const path = require('path');

// 🔑 TOKEN DE LOYVERSE — env var tiene prioridad; fallback a archivo (NO comitear el archivo)
let LOYVERSE_TOKEN = process.env.LOYVERSE_TOKEN || '';
if (!LOYVERSE_TOKEN) {
    try {
        LOYVERSE_TOKEN = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_token.txt'), 'utf8').trim();
    } catch (e) {
        // archivo no disponible; la validación de abajo forzará exit(1)
    }
}

// 🏪 ID DE TU TIENDA/SUCURSAL
let STORE_ID = process.env.LOYVERSE_STORE_ID || '';
if (!STORE_ID) {
    try {
        STORE_ID = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_store_id.txt'), 'utf8').trim();
    } catch (e) {
        // archivo no disponible
    }
}

// 💳 ID DEL TIPO DE PAGO (para órdenes pendientes/custom)
let PAYMENT_TYPE_ID = process.env.LOYVERSE_PAYMENT_TYPE_ID || null;
if (!PAYMENT_TYPE_ID) {
    try {
        const paymentTypeFile = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_payment_type_id.txt'), 'utf8').trim();
        if (paymentTypeFile && paymentTypeFile !== '') {
            PAYMENT_TYPE_ID = paymentTypeFile;
        }
    } catch (e) {
        // archivo no disponible
    }
}

// 🗺️ CONFIGURACIÓN COMPLETA (Payment Types + Domicilios + Modificadores)
let LOYVERSE_CONFIG = null;
try {
    const configFile = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_config.json'), 'utf8');
    LOYVERSE_CONFIG = JSON.parse(configFile);
    const tieneModificadores = LOYVERSE_CONFIG.modificadores ? '+ modificadores' : '(sin modificadores aún)';
    console.log(`[Loyverse] Configuración cargada (payment types + domicilios ${tieneModificadores})`);

    if (LOYVERSE_CONFIG && LOYVERSE_CONFIG.payment_types) {
        PAYMENT_TYPE_ID = PAYMENT_TYPE_ID || LOYVERSE_CONFIG.payment_types.default;
    }
} catch (e) {
    console.log('[Loyverse] No se encontró loyverse_config.json. Ejecuta: node configurar_loyverse.js');
}

// 📱 ID DEL PDV (POS Device) para asignar ventas
let POS_DEVICE_ID = process.env.LOYVERSE_POS_DEVICE_ID || null;
if (!POS_DEVICE_ID) {
    try {
        POS_DEVICE_ID = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_pos_device_id.txt'), 'utf8').trim();
    } catch (e) {
        console.log('[Loyverse] No se encontró pos_device_id. Las ventas no se asignarán a un PDV.');
    }
}

// CRITICAL: Fail fast if required Loyverse configuration is missing
if (!LOYVERSE_TOKEN) {
    console.error('[Loyverse] FATAL: LOYVERSE_TOKEN no está configurado. Establece la variable de entorno LOYVERSE_TOKEN o crea datos/loyverse_token.txt');
    process.exit(1);
}
if (!STORE_ID) {
    console.error('[Loyverse] FATAL: LOYVERSE_STORE_ID no está configurado. Establece la variable de entorno LOYVERSE_STORE_ID o crea datos/loyverse_store_id.txt');
    process.exit(1);
}
if (!PAYMENT_TYPE_ID) {
    console.error('[Loyverse] FATAL: LOYVERSE_PAYMENT_TYPE_ID no está configurado. Establece la variable de entorno LOYVERSE_PAYMENT_TYPE_ID o crea datos/loyverse_payment_type_id.txt');
    process.exit(1);
}
if (!POS_DEVICE_ID) {
    console.error('[Loyverse] FATAL: LOYVERSE_POS_DEVICE_ID no está configurado. Establece la variable de entorno LOYVERSE_POS_DEVICE_ID o crea datos/loyverse_pos_device_id.txt');
    process.exit(1);
}

// 👤 CLIENTES TIPO (DOMICILIO / RECOGER) para asignar en cada ticket
let CLIENTES_TIPO = null;
try {
    const clientesFile = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_clientes_tipo.json'), 'utf8');
    CLIENTES_TIPO = JSON.parse(clientesFile);
    console.log(`👤 Clientes tipo cargados: DOMICILIO=${CLIENTES_TIPO.domicilio.substring(0,8)}... | RECOGER=${CLIENTES_TIPO.recoger.substring(0,8)}...`);
} catch (e) {
    console.log('⚠️ No se encontró loyverse_clientes_tipo.json. Ejecuta: node obtener_clientes_tipo.js');
}

// 🎛️ MAPA DE MODIFICADORES VÁLIDOS POR PRODUCTO (item_id → modifier_ids permitidos)
let ITEM_MODIFIERS = {};
try {
    const imFile = fs.readFileSync(path.join(__dirname, 'datos', 'loyverse_item_modifiers.json'), 'utf8');
    ITEM_MODIFIERS = JSON.parse(imFile);
    console.log(`🎛️ Modificadores por producto cargados: ${Object.keys(ITEM_MODIFIERS).length} productos`);
} catch (e) {
    console.log('⚠️ No se encontró loyverse_item_modifiers.json. Ejecuta: node obtener_modificadores_por_producto.js');
}

// 🔍 HELPER: Buscar cliente en Loyverse por número de teléfono
// Retorna { id, name } si encuentra coincidencia, o null
async function buscarClientePorTelefono(numeroCliente) {
    if (!LOYVERSE_TOKEN || !numeroCliente) return null;
    try {
        // Últimos 10 dígitos (sin código de país) para buscar
        const num10 = String(numeroCliente).replace(/\D/g, '').slice(-10);
        const resultado = await loyverseRequest('GET', `/v1.0/customers?q=${num10}&limit=5`);
        const clientes = resultado.customers || [];
        
        // Buscar coincidencia exacta en los últimos 10 dígitos del teléfono guardado
        for (const c of clientes) {
            const telGuardado = (c.phone_number || '').replace(/\D/g, '').slice(-10);
            if (telGuardado === num10) {
                console.log(`[Loyverse] Cliente encontrado`);
                return { id: c.id, name: c.name };
            }
        }

        console.log(`[Loyverse] No se encontró cliente en Loyverse`);
        return null;
    } catch (e) {
        console.log(`  ⚠️ Error buscando cliente: ${e.message}`);
        return null;
    }
}

// 🎛️ HELPER: Filtrar modificadores válidos para un producto
// Retorna { validos: [...], rechazados: [...] }
// Solo pasa los modifiers que el producto realmente tiene asignados en Loyverse
function filtrarModificadoresValidos(modificadores, itemId) {
    if (!itemId || !ITEM_MODIFIERS[itemId]) {
        // Si no tenemos info del producto, pasar todo como estaba (sin validación)
        if (Object.keys(ITEM_MODIFIERS).length === 0) return { validos: modificadores, rechazados: [] };
        // Si tenemos el mapa pero el producto no está, rechazar todos
        console.log(`    ⚠️ Producto ${itemId?.substring(0,8)}... no tiene modifiers registrados`);
        return { validos: [], rechazados: modificadores };
    }
    
    const permitidos = ITEM_MODIFIERS[itemId].modifier_ids || [];
    const validos = [];
    const rechazados = [];
    
    for (const mod of modificadores) {
        if (permitidos.includes(mod.modifier_id)) {
            validos.push(mod);
        } else {
            rechazados.push(mod);
        }
    }
    
    return { validos, rechazados };
}

// 🏠 HELPER: Extraer costo de domicilio desde el nombre del cliente
// Ej: "Berenice 15" → 15 | "Juan Carlos 30" → 30 | "Pedro" → null
function extraerDomicilioDesdeNombre(nombreCliente) {
    if (!nombreCliente) return null;
    const match = nombreCliente.trim().match(/(\d+)$/);
    if (!match) return null;
    const costo = parseInt(match[1]);
    // Solo valores válidos de domicilio: 10, 15, 20, 25, 30, 35
    if ([10, 15, 20, 25, 30, 35].includes(costo)) {
        return costo;
    }
    return null;
}

// 🔧 HELPER: Buscar la MEJOR opción en un grupo (scoring por precisión)
// Score: 1000=exacto | 100+len=texto-contiene-clave (más larga gana) | 10+len=palabras-en-común
// Ej: "tortilla dorada" (score=114) gana sobre "tortilla" (score=108)
// Ej: clave "cebada de litro" → palabras ["cebada","litro"] en "agua de cebada litro" → score=15
// Devuelve { key, val } con el mejor match (o null)
// key: la clave exacta del config que ganó — usada para logging y yaEnModifier
function buscarEnGrupo(grupo, textoNorm) {
    if (!grupo) return null;
    let mejorMatch = null;
    let mejorClave = null;
    let mejorScore = 0;
    for (const [key, val] of Object.entries(grupo)) {
        if (key.startsWith('_')) continue;
        let score = 0;
        if (textoNorm === key) {
            score = 1000;
        } else if (textoNorm.includes(key)) {
            score = 100 + key.length;          // más larga gana: "tortilla dorada"(115) > "tortilla"(108)
        } else if (key.includes(textoNorm)) {
            score = 50 + textoNorm.length;
        } else {
            // Palabras del key presentes en el texto (cualquier orden)
            // "cebada de litro" → ["cebada","litro"] en "agua de cebada litro" ✅
            const palabrasKey = key.split(' ').filter(p => p.length > 2);
            if (palabrasKey.length >= 2 && palabrasKey.every(p => textoNorm.includes(p))) {
                score = 10 + key.length;
            }
        }
        if (score > mejorScore) {
            mejorScore = score;
            mejorMatch = val;
            mejorClave = key;
        }
    }
    return mejorMatch ? { key: mejorClave, val: mejorMatch } : null;
}

// 🔧 HELPER: Buscar TODOS los matches en un grupo (para bebidas que tienen múltiples grupos)
// Devuelve [{key, val}] — todos los matches únicos por modifier_id (mejor score gana)
function buscarTodosEnGrupo(grupo, textoNorm) {
    if (!grupo) return [];
    const candidatos = [];
    for (const [key, val] of Object.entries(grupo)) {
        if (key.startsWith('_')) continue;
        let score = 0;
        if (textoNorm === key)                  score = 1000;
        else if (textoNorm.includes(key))       score = 100 + key.length;
        else if (key.includes(textoNorm))       score = 50 + textoNorm.length;
        else {
            const palabrasKey = key.split(' ').filter(p => p.length > 2);
            if (palabrasKey.length >= 2 && palabrasKey.every(p => textoNorm.includes(p)))
                score = 10 + key.length;
        }
        if (score > 0) candidatos.push({ key, val, score });
    }
    // Ordenar por score desc; elegir el mejor por cada modifier_id
    candidatos.sort((a, b) => b.score - a.score);
    const yaUsados = new Set();
    const encontrados = [];
    for (const { key, val } of candidatos) {
        if (!yaUsados.has(val.modifier_id)) {
            yaUsados.add(val.modifier_id);
            encontrados.push({ key, val });
        }
    }
    return encontrados;
}

// 🥬 HELPER: Obtener TODOS los modificadores para una línea del pedido
// Retorna también un Set de palabras-clave ya cubiertas por modifiers
// para que el line_note no las duplique.
function obtenerModificadoresLoyverse(textoCompleto, nombreProducto) {
    if (!LOYVERSE_CONFIG || !LOYVERSE_CONFIG.modificadores) return { modifiers: [], yaEnModifier: new Set() };
    
    const mods = LOYVERSE_CONFIG.modificadores;
    // Normalizar: minúsculas + sin acentos (azúcar → azucar, etc.)
    const t = textoCompleto.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const prodNorm = (nombreProducto || '').toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const resultado   = [];   // [{modifier_id, modifier_option_id}, ...]
    const yaEnModifier = new Set();  // palabras que ya van como modifier (no duplicar en line_note)

    // Helper: agrega al resultado y guarda la clave en yaEnModifier
    function agregar(resultado_kv) {
        if (!resultado_kv) return;
        const { key, val } = resultado_kv;
        resultado.push({ modifier_id: val.modifier_id, modifier_option_id: val.option_id });
        if (key) yaEnModifier.add(key);
    }

    // 1. INGREDIENTES (verduras)
    const matchIng = buscarEnGrupo(mods.ingredientes, t);
    if (matchIng) agregar(matchIng);

    // 2. CARNE — orden/porcion → carne_orden | combo → carne_simple | demás → carnes
    const esOrden = prodNorm.includes('orden') || prodNorm.includes('porcion');
    const esCombo = prodNorm.includes('combo');
    const grupoCarneNombre = esOrden ? 'carne_orden' : esCombo ? 'carne_simple' : 'carnes';
    const matchCarne = buscarEnGrupo(mods[grupoCarneNombre], t);
    if (matchCarne) agregar(matchCarne);

    // 3. TIPO DE COMBO
    if (esCombo) {
        const matchCombo = buscarEnGrupo(mods.combos, t);
        if (matchCombo) agregar(matchCombo);
    }

    // 4. BEBIDAS — 3 grupos independientes: hielo | tipo | elige
    const matchesBebida = buscarTodosEnGrupo(mods.bebidas, t);
    if (matchesBebida.length > 0) {
        matchesBebida.forEach(({ key, val }) => {
            resultado.push({ modifier_id: val.modifier_id, modifier_option_id: val.option_id });
            yaEnModifier.add(key);
        });
    }

    // 5. EXTRAS
    const matchExtra = buscarEnGrupo(mods.extras, t);
    if (matchExtra) agregar(matchExtra);

    // 6. POSTRES
    const matchPostre = buscarEnGrupo(mods.postres, t);
    if (matchPostre) agregar(matchPostre);
    return { modifiers: resultado, yaEnModifier };
}

// 🗺️ MAPA DE PRODUCTOS (carga menu.csv con IDs)
let ITEMS_MAP = {};
function cargarMenuConIDs() {
    try {
        const menuCSV = fs.readFileSync(path.join(__dirname, 'datos', 'menu.csv'), 'utf8');
        const lineas = menuCSV.split('\n');
        
        // Buscar índice de columnas (robusto)
        const header = lineas[0].replace(/^\uFEFF/, '').split(','); // Quitar BOM si existe
        const idxNombre = header.indexOf('Nombre');
        const idxItemId = header.indexOf('ITEM_ID');
        const idxVariantId = header.indexOf('VARIANT_ID');
        // Precio: buscar columna que empiece con "Precio"
        const idxPrecio = header.findIndex(h => h.startsWith('Precio'));
        
        if (idxItemId === -1) {
            console.log('⚠️ El menu.csv NO tiene columna ITEM_ID. Ejecuta obtener_ids_loyverse.js primero');
            return;
        }
        
        if (idxVariantId === -1) {
            console.log('⚠️ El menu.csv NO tiene columna VARIANT_ID. Ejecuta obtener_ids_loyverse.js de nuevo');
            return;
        }
        
        for (let i = 1; i < lineas.length; i++) {
            const linea = lineas[i].trim();
            if (!linea) continue;
            
            const partes = linea.split(',');
            const nombre = partes[idxNombre]?.trim();
            const itemId = partes[idxItemId]?.trim();
            const variantId = partes[idxVariantId]?.trim();
            const precioRaw = partes[idxPrecio]?.trim();
            const precio = (precioRaw && precioRaw !== 'variable') ? parseFloat(precioRaw) || 0 : 0;
            
            if (nombre && itemId && itemId !== 'NO_ENCONTRADO' && variantId && variantId !== 'NO_ENCONTRADO') {
                const entrada = {
                    id: itemId,
                    variant_id: variantId,
                    nombre: nombre,
                    precio: precio
                };
                // Guardar con key normalizado para mejor matching
                ITEMS_MAP[nombre.toLowerCase().trim()] = entrada;
                ITEMS_MAP[normalizar(nombre)] = entrada; // También versión sin acentos
            }
        }
        
        console.log(`✅ Cargados ${Object.keys(ITEMS_MAP).length / 2} productos con IDs de Loyverse`);
    } catch (e) {
        console.log('⚠️ Error cargando menu.csv:', e.message);
    }
}

cargarMenuConIDs();

// 💳 Función helper: Detectar método de pago del texto
function detectarMetodoPago(texto) {
    if (!LOYVERSE_CONFIG || !LOYVERSE_CONFIG.payment_types) {
        return PAYMENT_TYPE_ID; // Fallback al default
    }
    
    const textoLower = texto.toLowerCase();
    
    // 🏪 PEDIDO PARA RECOGER → WhatsApp (no se pregunta método de pago)
    const esParaRecoger = textoLower.includes('recoge') || 
                          textoLower.includes('para recoger') ||
                          textoLower.includes('a recoger') ||
                          textoLower.includes('en tienda') ||
                          textoLower.includes('en local');
    
    if (esParaRecoger) {
        console.log('  🏪 Detectado: Para Recoger → WhatsApp');
        return LOYVERSE_CONFIG.payment_types.whatsapp || LOYVERSE_CONFIG.payment_types.efectivo;
    }
    
    // 🏠 PEDIDO A DOMICILIO → Detectar método explícito
    if (textoLower.includes('transferencia') || textoLower.includes('transfer')) {
        console.log('  💳 Detectado: Transferencia');
        return LOYVERSE_CONFIG.payment_types.transferencia;
    }
    
    if (textoLower.includes('link de pago') || textoLower.includes('link')) {
        console.log('  🔗 Detectado: Link de Pago');
        return LOYVERSE_CONFIG.payment_types.link;
    }
    
    if (textoLower.includes('tarjeta') || textoLower.includes('card')) {
        console.log('  💳 Detectado: Tarjeta');
        return LOYVERSE_CONFIG.payment_types.tarjeta;
    }
    
    // Default domicilio: efectivo
    console.log('  💵 Detectado: Efectivo (default)');
    return LOYVERSE_CONFIG.payment_types.efectivo || LOYVERSE_CONFIG.payment_types.default;
}

// 🚚 Función helper: Detectar domicilio y retornar item para agregar
function detectarDomicilio(texto) {
    if (!LOYVERSE_CONFIG || !LOYVERSE_CONFIG.domicilios) {
        return null;
    }
    
    // Buscar patrón: "ENVÍO: X km (Costo: $XX)" o "Domicilio: $XX"
    const patterns = [
        /costo:\s*\$?(\d+)/i,
        /envío:\s*\$?(\d+)/i,
        /domicilio:\s*\$?(\d+)/i,
        /delivery:\s*\$?(\d+)/i
    ];
    
    for (const pattern of patterns) {
        const match = texto.match(pattern);
        if (match) {
            const costo = match[1];
            const domicilio = LOYVERSE_CONFIG.domicilios[costo];
            
            if (domicilio) {
                console.log(`  🚚 Detectado domicilio: $${costo} (${domicilio.nombre})`);
                return {
                    item_id: domicilio.item_id,
                    variant_id: domicilio.variant_id,
                    quantity: 1,
                    price: parseInt(costo),
                    cost: 0,
                    line_note: `Envío ${domicilio.distancia}`,
                    taxes: []
                };
            }
        }
    }
    
    return null;
}

// 📡 Función para hacer request a Loyverse API (con reintentos para 429/5xx)
function loyverseRequest(method, endpoint, data = null, retries = 3) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.loyverse.com',
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Bearer ${LOYVERSE_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseData ? JSON.parse(responseData) : {});
                } else if ((res.statusCode === 429 || res.statusCode >= 500) && retries > 0) {
                    // Retry con backoff exponencial: 2s, 4s, 8s
                    const espera = Math.pow(2, 4 - retries) * 1000;
                    console.log(`  ⏳ Loyverse ${res.statusCode} — reintentando en ${espera/1000}s (${retries-1} intentos restantes)`);
                    setTimeout(() => {
                        loyverseRequest(method, endpoint, data, retries - 1)
                            .then(resolve).catch(reject);
                    }, espera);
                } else {
                    reject(new Error(`Error ${res.statusCode}: ${responseData}`));
                }
            });
        });

        req.on('error', (err) => {
            if (retries > 0) {
                const espera = Math.pow(2, 4 - retries) * 1000;
                console.log(`  ⏳ Error de red Loyverse — reintentando en ${espera/1000}s`);
                setTimeout(() => {
                    loyverseRequest(method, endpoint, data, retries - 1)
                        .then(resolve).catch(reject);
                }, espera);
            } else {
                reject(err);
            }
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// 🔧 HELPER: Normalizar texto (quitar acentos, minúsculas, plural→singular)
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/tacos/g, 'taco')
        .replace(/quesadillas/g, 'quesadilla')
        .replace(/pellizcadas/g, 'pellizcada')
        .replace(/planchadas/g, 'planchada')
        .replace(/supremas/g, 'suprema')
        .replace(/taquesos/g, 'taqueso')
        .replace(/taquitos/g, 'taquito')
        .replace(/combos/g, 'combo')
        .replace(/porciones/g, 'porcion')
        .replace(/tortillas/g, 'tortilla')
        .replace(/\s+/g, ' ')
        .trim();
}

// 🥩 HELPER: Detectar tipo de carne en el texto
function detectarCarne(texto) {
    const t = normalizar(texto);
    if (t.includes('adobada') || t.includes('adobado')) return 'adobada';
    if (t.includes('revuelta') || t.includes('revuelto') || t.includes('revuelta')) return 'revuelta';
    if (t.includes('ubre')) return 'ubre';
    if (t.includes('tripa')) return 'tripa';
    if (t.includes('asada') || t.includes('carne') || t.includes('normal') || t.includes('clasica')) return 'asada';
    return null;
}

// 🥬 HELPER: Extraer instrucciones de verdura del texto (dentro de paréntesis o al final)
function extraerVerduras(textoLinea) {
    // Buscar contenido entre paréntesis: "(sin cebolla, con todo)"
    const matchParen = textoLinea.match(/\(([^)]+)\)/g);
    if (matchParen) {
        return matchParen.map(p => p.replace(/[()]/g, '').trim()).join(', ');
    }
    // Buscar al final: "sin cebolla" o "con todo"
    const matchFinal = textoLinea.match(/(con todo|sin frijol|sin cebolla|sin picante|sin jugo|puro jugo|naturales|sin verdura)/i);
    if (matchFinal) return matchFinal[0];
    return null;
}

// 🥬 HELPER: Resolver si verduras van en line_note o ya están cubiertas por modifier
// Evita duplicar info: si el modifier ya cubre la instrucción, no va en line_note
function resolverLineNote(verduras, yaEnModifier) {
    if (!verduras) return null;
    const verdurasNorm = verduras.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const yaCubierta = [...yaEnModifier].some(clave =>
        clave && (verdurasNorm.includes(clave) || clave.includes(verdurasNorm))
    );
    if (!yaCubierta) {
        console.log(`  📝 line_note (no cubierto por modifier): "${verduras}"`);
        return verduras;
    }
    console.log(`  ℹ️  Verdura "${verduras}" ya está en modifier — omitida del line_note`);
    return null;
}

// 🔍 HELPER: Buscar el producto más similar en ITEMS_MAP (un solo paso de scoring)
function buscarProducto(nombreRaw) {
    const nombreNorm = normalizar(nombreRaw);
    
    // 1. Match exacto directo
    if (ITEMS_MAP[nombreNorm]) return ITEMS_MAP[nombreNorm];
    
    // 2. Un solo recorrido con scoring
    let mejorMatch = null;
    let mejorScore = 0;
    
    for (const [key, item] of Object.entries(ITEMS_MAP)) {
        const keyNorm = normalizar(key);
        let score = 0;
        
        // Exacto normalizado (máxima prioridad)
        if (nombreNorm === keyNorm) {
            return item; // Retorno inmediato
        }
        
        // Inclusión bidireccional
        if (keyNorm.includes(nombreNorm)) {
            score = 200 + nombreNorm.length;
        } else if (nombreNorm.includes(keyNorm)) {
            score = 150 + keyNorm.length;
        } else {
            // Palabras en común
            const palabrasNombre = nombreNorm.split(' ').filter(p => p.length > 2);
            const palabrasKey = keyNorm.split(' ').filter(p => p.length > 2);
            const enComun = palabrasNombre.filter(p => palabrasKey.includes(p)).length;
            const puntaje = enComun / Math.max(palabrasKey.length, 1);
            
            if (enComun >= 2 && puntaje >= 0.5) {
                score = 100 * puntaje + enComun;
            }
        }
        
        if (score > mejorScore) {
            mejorScore = score;
            mejorMatch = item;
        }
    }
    
    if (mejorMatch) return mejorMatch;
    
    // 3. Sinónimos como último recurso
    const SINONIMOS = {
        'pellizcada': 'suprema',
        'quesadilla de maiz': 'planchada',
        'orden': 'orden',
    };
    
    for (const [sinonimo, reemplazo] of Object.entries(SINONIMOS)) {
        if (nombreNorm.includes(sinonimo)) {
            const nombreCorregido = nombreNorm.replace(sinonimo, reemplazo);
            for (const [key, item] of Object.entries(ITEMS_MAP)) {
                if (normalizar(key).includes(nombreCorregido) || nombreCorregido.includes(normalizar(key))) {
                    return item;
                }
            }
        }
    }
    
    return null;
}

// 🛒 FUNCIÓN PRINCIPAL: Crear orden en Loyverse
// ventaJSON (opcional): datos estructurados de la IA { items: [{qty, name, mods}], total }
async function crearOrdenEnLoyverse(pedidoTexto, nombreCliente, numeroCliente, ventaJSON = null) {
    try {
        if (!LOYVERSE_TOKEN) {
            console.log('⚠️ Token de Loyverse no configurado');
            return null;
        }
        
        if (!STORE_ID) {
            console.log('⚠️ Store ID no configurado');
            return null;
        }
        
        console.log('🛒 Creando orden en Loyverse...');
        console.log('📋 TEXTO RECIBIDO:\n' + pedidoTexto.substring(0, 800));
        
        // 🧩 Si hay JSON estructurado de la IA, construir líneas limpias desde él
        // Esto evita errores de parseo por cambios de formato de la IA
        if (ventaJSON && ventaJSON.items && Array.isArray(ventaJSON.items) && ventaJSON.items.length > 0) {
            console.log('  🧩 Usando JSON estructurado de la IA');
            // Reconstruir sección de pedido desde JSON para que el parser lo entienda
            const lineasJSON = ventaJSON.items.map(item => {
                const mods = item.mods ? ` (${item.mods})` : '';
                return `- ${item.qty || 1} ${item.name}${mods}`;
            });
            // Reemplazar sección de pedido con la versión limpia del JSON
            const seccionLimpia = lineasJSON.join('\n');
            console.log(`  🧩 Líneas desde JSON:\n${seccionLimpia}`);
            // Inyectar al texto para que el parser lo agarre
            pedidoTexto = pedidoTexto.replace(
                /PEDIDO:\s*\n((?:[ \t]*-[^\n]+\n?)+)/i,
                `PEDIDO:\n${seccionLimpia}\n`
            );
        }
        
        // 1. PARSEAR EL PEDIDO
        // La IA puede formatear de dos maneras:
        // A) Una línea por producto: "- 2 Taco de asada\n- 1 Agua Jamaica"
        // B) Todo en una línea con comas: "2 Tacos de Asada, 1 Agua de Cebada Litro."
        // Este parser maneja ambos casos.
        
        // Extraer la sección de PEDIDO del texto
        // ⚠️ IMPORTANTE: buscar "PEDIDO:" con dos puntos para evitar capturar
        // el saludo de la IA que a veces dice "Pedido recibido y anotado..."
        let seccionPedido = pedidoTexto;
        const matchPedido = pedidoTexto.match(/PEDIDO:\s*\n((?:[ \t]*-[^\n]+\n?)+)/i);
        if (matchPedido) {
            seccionPedido = matchPedido[1];
        } else {
            // Fallback: buscar cualquier bloque de líneas con guión
            const matchOrden = pedidoTexto.match(/CONFIRMADA[\s\S]+?\n((?:[ \t]*-[^\n]+\n?)+)/i);
            if (matchOrden) seccionPedido = matchOrden[1];
        }
        
        // Detectar si la IA usó formato de una sola línea con comas
        // Señal: hay números seguidos de texto separados por comas en pocas líneas
        const lineasRaw = seccionPedido.split('\n').filter(l => l.trim());
        const hayFormatoLinea = lineasRaw.some(l => /^\s*[-•*]\s*\d/.test(l));
        const hayFormatoComa  = !hayFormatoLinea && seccionPedido.includes(',') && 
                                /\d+\s+[A-ZÁÉÍÓÚÑ]/i.test(seccionPedido);
        
        // Si es formato coma → separar por comas y tratar cada parte como una línea
        let lineas;
        if (hayFormatoComa) {
            console.log('  📝 Detectado formato coma — dividiendo por comas');
            lineas = seccionPedido
                .replace(/\.$/, '') // Quitar punto final
                .split(/,\s*/)
                .map(l => l.trim())
                .filter(l => l.length > 2);
        } else {
            lineas = lineasRaw;
        }
        
        const lineItems = [];
        let totalPedido = 0;
        
        for (const linea of lineas) {
            // Patrón flexible — captura cualquier formato:
            // "- 3 Taco de asada"  "• 2 Quesadilla"  "3x Taco"  "3 Taco de asada"
            const match = linea.match(/(?:[-•*🌮🌯🥤🍹🧃]\s*)?(\d+)\s*x?\s+([A-ZÁÉÍÓÚÑ][^\n]{3,})/i) ||
                          linea.match(/(?:[-•*]\s*)?(\d+)x?\s+(.{4,})/);
            if (!match) continue;
            // Filtrar líneas que no son productos
            const lineaLower = linea.toLowerCase();
            if (lineaLower.includes('total') || lineaLower.includes('envío') || 
                lineaLower.includes('costo') || lineaLower.includes('pago') ||
                lineaLower.includes('entrega') || lineaLower.includes('gracias')) continue;
            
            const cantidad = parseInt(match[1]);
            const textoCompleto = match[2].trim();
            
            // Separar nombre del producto de instrucciones de verdura
            // Buscar donde empiezan los paréntesis o instrucciones
            const idxParen = textoCompleto.indexOf('(');
            const nombreProducto = idxParen > -1
                ? textoCompleto.substring(0, idxParen).trim()
                : textoCompleto.replace(/\s*(con todo|sin frijol|sin cebolla|sin picante|sin jugo|puro jugo|naturales|sin verdura).*/i, '').trim();
            
            // Extraer instrucciones de verdura
            const verduras = extraerVerduras(textoCompleto);
            
            // Buscar producto en mapa
            const productoEncontrado = buscarProducto(nombreProducto);
            
            console.log(`  🔍 Línea: "${linea.trim()}" → producto: "${nombreProducto}"`);
            if (productoEncontrado) {
                const precioTotal = productoEncontrado.precio * cantidad;
                const esComboProducto = normalizar(nombreProducto).includes('combo');
                
                let modificadores = [];
                let lineNote = null;
                
                if (esComboProducto) {
                    // 🎛️ COMBOS: Detectar si las instrucciones son uniformes o mixtas
                    // Uniforme: "Combo del Amor (Planchada y taco, asada, con todo)" → modifiers
                    // Mixto: "Combo del Amor (Planchada sin frijol, taco natural)" → line_note
                    const contenidoParen = textoCompleto.match(/\(([^)]+)\)/);
                    const instrucciones = contenidoParen ? contenidoParen[1].toLowerCase() : '';
                    
                    // Contar instrucciones de verdura distintas
                    const verdurasKeys = ['con todo', 'sin frijol', 'sin cebolla', 'sin picante', 'sin jugo', 'puro jugo', 'naturales', 'natural', 'sin verdura'];
                    const verdurasEncontradas = verdurasKeys.filter(v => instrucciones.includes(v));
                    const esMixto = verdurasEncontradas.length >= 2;
                    
                    if (esMixto) {
                        // MIXTO: cada producto del combo lleva instrucciones distintas → todo a line_note
                        const contenidoParenAll = textoCompleto.match(/\(([^)]+)\)/g);
                        if (contenidoParenAll) {
                            lineNote = contenidoParenAll.map(p => p.replace(/[()]/g, '').trim()).join(' | ');
                        } else if (verduras) {
                            lineNote = verduras;
                        }
                        console.log(`  📦 Combo MIXTO → sin modifiers, line_note: "${lineNote || ''}"`);
                    } else {
                        // UNIFORME: misma instrucción para todo el combo → usar modifiers normal
                        const resultado_mods = obtenerModificadoresLoyverse(textoCompleto, nombreProducto);
                        modificadores = resultado_mods.modifiers;
                        const yaEnModifier = resultado_mods.yaEnModifier;
                        
                        if (verduras) {
                            lineNote = resolverLineNote(verduras, yaEnModifier);
                        }
                        console.log(`  📦 Combo UNIFORME → ${modificadores.length} modifier(s), note: "${lineNote || ''}"`);
                    }
                } else {
                    // 🎛️ PRODUCTOS NORMALES: Usar modificadores vía API Loyverse
                    const resultado_mods = obtenerModificadoresLoyverse(textoCompleto, nombreProducto);
                    modificadores = resultado_mods.modifiers;
                    const yaEnModifier = resultado_mods.yaEnModifier;
                    
                    // line_note: solo instrucciones de verdura que NO tienen modifier asignado
                    if (verduras) {
                        lineNote = resolverLineNote(verduras, yaEnModifier);
                    }
                    
                    if (modificadores.length > 0) {
                        console.log(`  🎛️ ${modificadores.length} modifier(s) para "${nombreProducto}"`);
                    } else {
                        console.log(`  ℹ️  Sin modifiers para "${nombreProducto}"`);
                    }
                }
                
                const lineItem = {
                    item_id: productoEncontrado.id,
                    variant_id: productoEncontrado.variant_id,
                    quantity: cantidad,
                    price: productoEncontrado.precio,
                    cost: 0,
                    taxes: []
                };
                
                // 🔒 Validar que los modificadores pertenecen a este producto
                if (modificadores.length > 0) {
                    const { validos, rechazados } = filtrarModificadoresValidos(modificadores, productoEncontrado.id);
                    
                    if (validos.length > 0) lineItem.line_modifiers = validos;
                    
                    // Rechazados → buscar su nombre y agregar al line_note
                    if (rechazados.length > 0) {
                        const nombresRechazados = rechazados.map(r => {
                            // Buscar el nombre de la opción en la config
                            if (LOYVERSE_CONFIG && LOYVERSE_CONFIG.modificadores) {
                                for (const grupo of Object.values(LOYVERSE_CONFIG.modificadores)) {
                                    if (!grupo || typeof grupo !== 'object') continue;
                                    for (const [key, val] of Object.entries(grupo)) {
                                        if (key.startsWith('_')) continue;
                                        if (val.option_id === r.modifier_option_id) return key;
                                    }
                                }
                            }
                            return null;
                        }).filter(Boolean);
                        
                        if (nombresRechazados.length > 0) {
                            const textoRechazado = nombresRechazados.join(', ');
                            lineNote = lineNote ? `${lineNote}, ${textoRechazado}` : textoRechazado;
                            console.log(`  📝 Modifiers rechazados → line_note: "${textoRechazado}"`);
                        }
                    }
                    
                    console.log(`  🔒 Modifiers: ${validos.length} válidos, ${rechazados.length} rechazados`);
                }
                if (lineNote) lineItem.line_note = lineNote;
                
                lineItems.push(lineItem);
                totalPedido += precioTotal;
                console.log(`  ✅ ${cantidad}x ${productoEncontrado.nombre} | mods=${modificadores.length} | note="${lineNote||''}" | $${precioTotal}`);
            } else {
                console.log(`  ⚠️ Sin match: "${nombreProducto}"`);
            }
        }
        
        if (lineItems.length === 0) {
            console.log('❌ No se encontraron productos válidos en el pedido');
            return null;
        }
        
        // 1.5 DETECTAR DOMICILIO
        // Prioridad: texto del ticket (ubicación real del cliente) > nombre del contacto
        let domicilioItem = detectarDomicilio(pedidoTexto);
        
        if (domicilioItem) {
            console.log(`  🚚 Domicilio desde texto del ticket: $${domicilioItem.price}`);
        } else {
            // Fallback: intentar desde el nombre del cliente (ej: "Berenice 15")
            const costoDesdNombre = extraerDomicilioDesdeNombre(nombreCliente);
            if (costoDesdNombre && LOYVERSE_CONFIG?.domicilios?.[String(costoDesdNombre)]) {
                const dom = LOYVERSE_CONFIG.domicilios[String(costoDesdNombre)];
                console.log(`  🏠 Domicilio desde nombre del cliente: $${costoDesdNombre} (${dom.nombre})`);
                domicilioItem = {
                    item_id: dom.item_id,
                    variant_id: dom.variant_id,
                    quantity: 1,
                    price: costoDesdNombre,
                    cost: 0,
                    line_note: `Envío ${dom.distancia}`,
                    taxes: []
                };
            }
        }
        
        if (domicilioItem) {
            lineItems.push(domicilioItem);
            totalPedido += domicilioItem.price;
        }
        
        // 1.6 DETECTAR MÉTODO DE PAGO
        const paymentTypeId = detectarMetodoPago(pedidoTexto);
        
        // Detectar si es domicilio o para recoger
        const esParaRecoger = /recoge|para recoger|a recoger/i.test(pedidoTexto);
        const entregaNota = esParaRecoger ? 'Para recoger' : 'Domicilio';
        
        // Extraer info de pago del texto para incluirla en la nota
        // Formatos posibles: "Efectivo (paga con $500)", "Efectivo (paga exacto)", "Efectivo (paga con $200)"
        let pagaConNota = '';
        const matchPago = pedidoTexto.match(/PAGO:\s*Efectivo\s*\(([^)]+)\)/i);
        if (matchPago) {
            pagaConNota = ` | ${matchPago[1].trim()}`;
            console.log(`  💵 Detectado pago: "${matchPago[1].trim()}"`);
        } else {
            console.log(`  💵 Sin info de "paga con" en el texto`);
        }
        
        // Hora actual para el campo order
        // Hora en formato 24h corto para que quepa en los 20 chars del campo order
        const _now = new Date();
        const horaOrden = _now.getHours().toString().padStart(2,'0') + ':' + _now.getMinutes().toString().padStart(2,'0');
        // Últimos 10 dígitos del número (sin código de país) para el campo order
        const numCorto = String(numeroCliente).replace(/\D/g,'').slice(-10);
        // dining_option: 'DOMICILIO' o 'RECOGER' — campo tipo de pedido en Loyverse
        const diningOption = esParaRecoger ? 'RECOGER' : 'DOMICILIO';

        // 1.8 BUSCAR CLIENTE POR TELÉFONO EN LOYVERSE
        // Si existe → usar su nombre real | Si no → fallback a DOMICILIO/RECOGER
        let clienteId = CLIENTES_TIPO 
            ? (esParaRecoger ? CLIENTES_TIPO.recoger : CLIENTES_TIPO.domicilio) 
            : undefined;
        
        const clienteEncontrado = await buscarClientePorTelefono(numeroCliente);
        if (clienteEncontrado) {
            clienteId = clienteEncontrado.id;
            console.log(`  👤 Asignando cliente real: "${clienteEncontrado.name}"`);
        } else {
            console.log(`  👤 Usando cliente genérico: ${diningOption}`);
        }

        // 2. CREAR LA ORDEN EN LOYVERSE
        const ordenData = {
            store_id: STORE_ID,
            line_items: lineItems,
            payments: [
                {
                    payment_type_id: paymentTypeId,
                    amount: 0
                }
            ],
            // order: aparece como "Pedido" en el ticket — número de teléfono y hora
            order: `${numCorto} ${horaOrden}`,  // máx 20 chars: 10 dígitos + espacio + HH:MM
            // dining_option: la API lo ignora, pero lo dejamos por si Loyverse lo activa en el futuro
            dining_option: diningOption,
            note: `${diningOption} | WA ${numeroCliente}${pagaConNota}`,
            receipt_email: null,
            pos_device_id: POS_DEVICE_ID || undefined,
            customer_id: clienteId
        };
        
        console.log(`[Loyverse] Enviando orden: ${lineItems.length} item(s), tipo=${diningOption}`);
        const resultado = await loyverseRequest('POST', '/v1.0/receipts', ordenData);
        
        // Verificar si los modifiers fueron aceptados en la respuesta
        if (resultado.line_items) {
            resultado.line_items.forEach((li, i) => {
                const enviados = lineItems[i]?.line_modifiers?.length || 0;
                const enResp   = li.line_modifiers?.length || 0;
                const status   = enviados > 0
                    ? (enResp > 0 ? `✅ ${enResp} aceptados` : '❌ ENVIADOS PERO NO EN RESPUESTA')
                    : 'ℹ️  sin modifiers';
                console.log(`  📦 Item[${i}] "${li.item_id?.substring(0,8)}..." → ${status}`);
            });
        } else {
            console.log('⚠️  Respuesta sin line_items — claves:', Object.keys(resultado).join(', '));
        }
        
        const receiptId = resultado.id || resultado.receipt_id || '(no encontrado)';
        console.log('══════════════════════════════════════');
        console.log('✅ ORDEN CREADA EN LOYVERSE');
        console.log(`   🧾 Ticket: ${resultado.receipt_number}`);
        console.log(`   💰 Total:  $${totalPedido}`);
        console.log(`   📦 Items:  ${lineItems.length}`);
        console.log(`   🆔 ID:     ${receiptId}`);
        console.log('══════════════════════════════════════');
        
        // Generar recibo para enviar al cliente por WhatsApp
        const textoRecibo = generarRecibo(resultado, totalPedido, numeroCliente);

        return {
            receipt_number: resultado.receipt_number,
            receipt_id: receiptId,
            total: totalPedido,
            items_count: lineItems.length,
            status: 'PENDIENTE',
            recibo: textoRecibo
        };
        
    } catch (error) {
        console.error('══════════════════════════════════════');
        console.error('❌ ERROR CREANDO ORDEN EN LOYVERSE');
        console.error(`   Mensaje: ${error.message}`);
        if (error.stack) console.error(`   Línea:   ${error.stack.split('\n')[1]?.trim()}`);
        console.error('══════════════════════════════════════');
        return null;
    }
}

// 🧾 FUNCIÓN: Generar recibo formateado para WhatsApp
function generarRecibo(resultado, totalPedido, numeroCliente) {
    const fmt    = n => '$' + Number(n).toFixed(2);
    const esEnvio = n => /domicilio|envío|envio|delivery/i.test(n || '');

    // Hora del ticket
    let horaStr = '';
    try {
        const d = new Date(resultado.receipt_date || resultado.created_at);
        horaStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {}

    // Tipo de pedido
    const dining     = (resultado.dining_option || '').toUpperCase();
    const tipoEmoji  = dining === 'DOMICILIO' ? '🛵' : dining === 'RECOGER' ? '🏪' : '🧾';

    // Separar productos de envío
    const envioItem  = resultado.line_items?.find(l => esEnvio(l.item_name));
    const costoEnvio = envioItem ? envioItem.total_money : 0;
    const subtotal   = totalPedido - costoEnvio;

    // Construir líneas de productos
    let lineasItems = '';
    for (const li of (resultado.line_items || [])) {
        if (esEnvio(li.item_name)) continue;
        const mods = (li.line_modifiers || []).map(m => m.option).join(', ');
        const nota = li.line_note ? ` _(${li.line_note})_` : '';
        lineasItems += `
  ${li.quantity}× *${li.item_name}*`;
        if (mods) lineasItems += `
   › ${mods}`;
        if (nota) lineasItems += nota;
        lineasItems += `   ${fmt(li.total_money)}`;
    }

    // Pago y cambio
    const pagoNombre = resultado.payments?.[0]?.name || 'Efectivo';
    // note con número = "paga con" (ej: "220")
    const noteNum = resultado.note ? parseFloat(resultado.note) : null;
    const pagaCon = (noteNum && !isNaN(noteNum) && noteNum > 0) ? noteNum : null;
    const cambio  = (pagaCon !== null) ? pagaCon - totalPedido : null;

    // Teléfono sin código de país para mostrar
    const telMostrar = String(numeroCliente).replace(/^521?/, '');

    const lineas = [
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🌮 *TACOS ARAGÓN*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🧾 Ticket: *#${resultado.receipt_number}*`,
        `📱 Pedido: *${telMostrar}*  ${horaStr}`,
        dining ? `${tipoEmoji} Tipo: *${dining}*` : null,
        ``,
        `*── PRODUCTOS ──*`,
        lineasItems,
        ``,
        costoEnvio > 0 ? `Subtotal:        ${fmt(subtotal)}` : null,
        costoEnvio > 0 ? `Envío:           ${fmt(costoEnvio)}` : null,
        `*TOTAL:          ${fmt(totalPedido)}*`,
        ``,
        `💳 Pago: ${pagoNombre}`,
        pagaCon !== null  ? `💵 Paga con: ${fmt(pagaCon)}`       : null,
        (cambio !== null && cambio >= 0) ? `🔄 Cambio: *${fmt(cambio)}*` : null,
        ``,
        `📌 WA ${numeroCliente}`,
        `━━━━━━━━━━━━━━━━━━━━━`,
    ].filter(l => l !== null && l !== undefined);

    return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 📤 EXPORTAR FUNCIONES
module.exports = {
    crearOrdenEnLoyverse,
    generarRecibo
};

// Si ejecutas este archivo directamente (para testing)
if (require.main === module) {
    const pedidoTest = `
✅ --- ORDEN CONFIRMADA --- ✅
🌮 PEDIDO:
- 1 Combo del Amor (Planchada y taco, asada, planchada sin frijol, taco natural)
- 1 Combo del Amor (Quesadilla y taco, adobada, quesadilla con todo, taco sin cebolla)
- 1 Combo del Amor (Pellizcada y taco, asada, con todo)
📍 ENTREGA: A domicilio (GPS recibido)
🛵 ENVÍO: 1.5 km (Costo: $20)
💰 TOTAL: $296
💳 PAGO: Efectivo (paga con $300)
------------------------------------
¡Gracias por tu compra!
    `;

    console.log('═══════════════════════════════════════════');
    console.log('🧪 PRUEBA: 3 Combos del Amor');
    console.log('  1️⃣  MIXTO: Planchada sin frijol + taco natural');
    console.log('  2️⃣  MIXTO: Quesadilla con todo + taco sin cebolla');
    console.log('  3️⃣  UNIFORME: Pellizcada y taco, asada, con todo');
    console.log('═══════════════════════════════════════════\n');

    crearOrdenEnLoyverse(pedidoTest, 'Doña Perros 20', '521XXXXXXXXXX')
        .then(resultado => {
            if (resultado) {
                console.log('\n═══════════════════════════════════════════');
                console.log('✅ PRUEBA EXITOSA');
                console.log(`  🧾 Ticket: ${resultado.receipt_number}`);
                console.log(`  💰 Total:  $${resultado.total}`);
                console.log(`  📦 Items:  ${resultado.items_count}`);
                console.log('═══════════════════════════════════════════');
            } else {
                console.log('\n❌ PRUEBA FALLÓ');
            }
        });
}