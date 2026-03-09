/**
 * Calculador de precios desde menu.csv
 * Calcula el total del pedido antes de enviarlo a Loyverse
 */

const fs = require('fs');
const path = require('path');

class PriceCalculator {
  constructor() {
    this.precios = {};
    this.cargarMenu();
  }

  cargarMenu() {
    try {
      const menuPath = path.join(__dirname, 'datos', 'menu.csv');
      const contenido = fs.readFileSync(menuPath, 'utf-8');
      const lineas = contenido.split('\n');

      // Saltar header
      for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;

        const cols = linea.split(',');
        if (cols.length < 5) continue;

        const nombre = cols[2].trim().toLowerCase();
        const precio = parseFloat(cols[4]);

        if (nombre && !isNaN(precio) && precio > 0) {
          this.precios[this.normalizar(nombre)] = precio;
        }
      }

      console.log(`[Precios] Menú cargado: ${Object.keys(this.precios).length} productos`);
    } catch (e) {
      console.error('[Precios] Error cargando menú:', e.message);
    }
  }

  normalizar(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buscarPrecio(nombreProducto) {
    const norm = this.normalizar(nombreProducto);

    // Búsqueda exacta
    if (this.precios[norm]) return this.precios[norm];

    // Búsqueda parcial
    for (const [key, precio] of Object.entries(this.precios)) {
      if (key.includes(norm) || norm.includes(key)) {
        return precio;
      }
    }

    // Búsqueda por palabras clave
    const palabras = norm.split(' ').filter(p => p.length > 3);
    let mejorMatch = null;
    let mejorScore = 0;

    for (const [key, precio] of Object.entries(this.precios)) {
      const palabrasKey = key.split(' ');
      const enComun = palabras.filter(p => palabrasKey.includes(p)).length;
      if (enComun > mejorScore) {
        mejorScore = enComun;
        mejorMatch = precio;
      }
    }

    return mejorMatch;
  }

  /**
   * Extrae productos del bloque ORDEN CONFIRMADA y calcula el total
   * Retorna { items, subtotal, envio, total }
   */
  calcularTotal(ordenTexto) {
    const resultado = {
      items: [],
      subtotal: 0,
      envio: 0,
      total: 0
    };

    const lineas = ordenTexto.split('\n');

    for (const linea of lineas) {
      // Buscar líneas de producto: "- 3 Taco de Asada (con todo)"
      const matchProducto = linea.match(/^\s*-\s*(\d+)\s+([^(]+?)(?:\s*\(.*\))?\s*$/);
      if (matchProducto) {
        const cantidad = parseInt(matchProducto[1]);
        const nombreProducto = matchProducto[2].trim();

        // Ignorar líneas que no son productos
        const nombreLower = nombreProducto.toLowerCase();
        if (nombreLower.includes('total') || nombreLower.includes('envío') ||
            nombreLower.includes('entrega') || nombreLower.includes('pago')) continue;

        const precio = this.buscarPrecio(nombreProducto);
        if (precio) {
          const subtotalItem = precio * cantidad;
          resultado.items.push({ nombre: nombreProducto, cantidad, precio, subtotal: subtotalItem });
          resultado.subtotal += subtotalItem;
          console.log(`[Precios] ${cantidad}x ${nombreProducto} = $${subtotalItem} ($${precio} c/u)`);
        } else {
          console.log(`[Precios] ⚠️ Sin precio para: "${nombreProducto}"`);
        }
      }

      // Detectar costo de envío
      const matchEnvio = linea.match(/costo:\s*\$?(\d+)/i) ||
                         linea.match(/envío.*\$?(\d+)/i);
      if (matchEnvio) {
        resultado.envio = parseInt(matchEnvio[1]);
      }
    }

    resultado.total = resultado.subtotal + resultado.envio;
    console.log(`[Precios] Subtotal: $${resultado.subtotal} | Envío: $${resultado.envio} | TOTAL: $${resultado.total}`);

    return resultado;
  }

  /**
   * Reemplaza el total en el texto de confirmación con el total real calculado
   */
  inyectarTotal(ordenTexto, totalCalculado) {
    // Reemplazar línea de TOTAL con el valor real
    return ordenTexto.replace(
      /💰\s*TOTAL:\s*\$[\d,]+/,
      `💰 TOTAL: $${totalCalculado}`
    ).replace(
      /TOTAL:\s*\$[\d,]+/,
      `TOTAL: $${totalCalculado}`
    );
  }
}

module.exports = new PriceCalculator();
