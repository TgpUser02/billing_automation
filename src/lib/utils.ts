import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strictly matches Arin IDs ensuring '#' and '$' IDs never merge.
 * Handles zero-padding normalization (e.g. Arin#010 matches Arin#10).
 */
export function matchesArinId(targetId: string | undefined | null, consumerId: string | undefined | null): boolean {
  if (!targetId || !consumerId) return false;
  const t = String(targetId).trim().toLowerCase();
  const c = String(consumerId).trim().toLowerCase();
  if (!t || !c || t === 'all') return false;
  if (t === c) return true;

  const tHasHash = t.includes('#');
  const tHasDollar = t.includes('$');
  const cHasHash = c.includes('#');
  const cHasDollar = c.includes('$');

  // CRITICAL: If one has '#' and the other has '$', they MUST NEVER match!
  if ((tHasHash && cHasDollar) || (tHasDollar && cHasHash)) {
    return false;
  }

  // Parse prefix, symbol (# or $), and numeric portion
  const parseArin = (str: string) => {
    const m = str.match(/^([a-z]*)\s*([#$])\s*0*(\d+)$/i) || str.match(/([#$])\s*0*(\d+)/i);
    if (m) {
      if (m.length === 4) {
        return { prefix: m[1].toLowerCase(), symbol: m[2], num: parseInt(m[3], 10) };
      }
      return { prefix: '', symbol: m[1], num: parseInt(m[2], 10) };
    }
    return null;
  };

  const parsedT = parseArin(t);
  const parsedC = parseArin(c);

  if (parsedT && parsedC) {
    if (parsedT.symbol !== parsedC.symbol) return false;
    return parsedT.num === parsedC.num;
  }

  // If one has a symbol and the other doesn't:
  if (parsedT || parsedC || tHasHash || tHasDollar || cHasHash || cHasDollar) {
    return false;
  }

  // If neither has '#' or '$', do a clean alphanumeric match
  const tClean = t.replace(/[^a-z0-9]/g, '');
  const cClean = c.replace(/[^a-z0-9]/g, '');
  return !!(tClean && cClean && tClean === cClean);
}
