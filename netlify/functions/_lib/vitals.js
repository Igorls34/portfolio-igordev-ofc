/* Faixas de classificacao das Core Web Vitals, espelhando
 * assets/js/analytics-core.js (VITAL_THRESHOLDS).
 *
 * Duplicado porque stats.js roda em Node e analytics-core.js e UMD de
 * <script>; ver o comentário em _lib/shared.js para o porquê de não
 * reaproveitar o arquivo. tests/analytics-core.test.js compara as duas
 * tabelas para elas não divergirem. */

export const VITAL_THRESHOLDS = {
    lcp: { good: 2500, poor: 4000 },
    inp: { good: 200, poor: 500 },
    cls: { good: 0.1, poor: 0.25 },
    ttfb: { good: 800, poor: 1800 },
    fcp: { good: 1800, poor: 3000 }
};

export function gradeVital(metric, value) {
    const range = VITAL_THRESHOLDS[metric];
    if (!range) return 'unknown';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return 'unknown';
    if (num <= range.good) return 'good';
    if (num <= range.poor) return 'needs-improvement';
    return 'poor';
}
