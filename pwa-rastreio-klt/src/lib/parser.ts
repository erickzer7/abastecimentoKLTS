import type { ParsedBox } from './types';

/**
 * Parser multi-formato para QR / código de barras da caixa de origem.
 * Reconhece 3 padrões:
 *  - Changan JSON:    {"qrtype":"PTNOTE","data":{...}}
 *  - Chery novo:      10#<partNo>$11#<fornec>$17#<qty>$...
 *  - Chery antigo:    só o lote (ex: 18891-CT1820260509C023C3B22)
 */
export function parseBoxCode(input: string): ParsedBox {
  const raw = input.trim();

  // 1. Changan JSON
  if (raw.startsWith('{') && raw.includes('qrtype')) {
    try {
      const j = JSON.parse(raw);
      const d = (j as { data?: Record<string, string> }).data || {};
      return {
        format: 'changan_json',
        formatLabel: 'Changan (JSON)',
        partNo: d.partNo || null,
        qty: d.caseLv2PartQty ? parseInt(d.caseLv2PartQty, 10) : null,
        lot: d.lotNo || null,
        extra: {
          ticket: d.ptTicketNo,
          contract: d.contractNo,
          caseLv1: d.caseLv1No,
          caseLv2: d.caseLv2No
        },
        raw
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      return { format: 'unknown', formatLabel: 'JSON inválido', error: msg, raw };
    }
  }

  // 2. Chery novo: campo#valor$campo#valor$...
  if (raw.includes('#') && raw.includes('$')) {
    const segs = raw.split('$').filter(Boolean);
    const map: Record<string, string> = {};
    for (const p of segs) {
      const idx = p.indexOf('#');
      if (idx === -1) continue;
      map[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    }
    return {
      format: 'chery_v2',
      formatLabel: 'Chery (QR estruturado)',
      partNo: map['10'] || null,
      qty: map['17'] ? parseInt(map['17'], 10) : null,
      lot: map['21'] || map['22'] || null,
      supplier: map['11'] || null,
      extra: { packId: map['18'], serial: map['21'], batch: map['22'] },
      raw
    };
  }

  // 3. Chery antigo: só lote
  if (/^\d{3,6}-[A-Z0-9]+$/i.test(raw)) {
    return {
      format: 'chery_v1',
      formatLabel: 'Chery antigo (só lote)',
      partNo: null,
      qty: null,
      lot: raw,
      raw
    };
  }

  // Padrão: assume código solto (ex: KLT vazia)
  return { format: 'klt_part', formatLabel: 'Código bruto', partNo: raw, raw };
}
