/* Funcoes compartilhadas pelas functions.
 *
 *(classifyRef e isBot) aparecem tambem em assets/js/analytics-core.js. A
 * duplicata aqui e intencional: aquele arquivo e UMD pensado para <script>, e
 * um bundle ESM de function nao consegue consumir o mesmo arquivo sem
 * gambiarra (nao existe `module` num bundle ESM, e o UMD cairia no ramo de
 * browser sem `self`).
 *
 * O risco de duas listas de bot divergirem e real, entao tests/analytics-core.test.js
 * compara as duas implementacoes contra uma amostra de User-Agent. Se uma
 * mexer e a outra nao, o teste quebra.
 */

const BOT_RE = /(bot|crawler|spider|slurp|bingpreview|headlesschrome|lighthouse|gtmetrix|pingdom|uptime|curl|wget|python-requests|httpclient|semrush|ahrefs|mj12|dotbot|petal|bytespider|yandex|baiduspider|facebookexternalhit|slackbot|discordbot|telegrambot|whatsapp)/i;

const SEARCH_ENGINES = {
    'google': 'google', 'bing': 'bing', 'duckduckgo': 'duckduckgo',
    'yahoo': 'yahoo', 'baidu': 'baidu', 'yandex': 'yandex',
    'ecosia': 'ecosia', 'brave': 'brave', 'startpage': 'startpage',
    'qwant': 'qwant', 'naver': 'naver', 'yep': 'yep'
};

const SOCIAL = {
    'linkedin.com': 'linkedin', 'instagram.com': 'instagram',
    'github.com': 'github', 'facebook.com': 'facebook',
    'l.facebook.com': 'facebook', 'l.instagram.com': 'instagram',
    't.co': 'twitter', 'twitter.com': 'twitter', 'x.com': 'twitter',
    'reddit.com': 'reddit', 'wa.me': 'whatsapp'
};

export function isBot(userAgent) {
    return BOT_RE.test(String(userAgent || ''));
}

export function hostOf(url) {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(String(url || ''));
    return match ? match[1].toLowerCase() : '';
}

/* Aceita tanto o objeto que o navegador ja classificou, quanto uma string
 * crua, para nao depender do cliente ter rodado. */
export function classifyRef(ref, selfHost) {
    if (ref && typeof ref === 'object') {
        return {
            source: String(ref.source || '').slice(0, 60),
            medium: String(ref.medium || '').slice(0, 20),
            host: String(ref.host || '').slice(0, 100)
        };
    }
    const host = hostOf(ref);
    if (!host) return { source: 'direct', medium: 'none', host: '' };
    const self = String(selfHost || '').toLowerCase();
    if (self && host === self) return { source: 'internal', medium: 'referral', host: host };
    const base = host.replace(/^www\./, '');
    if (SEARCH_ENGINES[base]) return { source: SEARCH_ENGINES[base], medium: 'organic', host: host };
    if (SOCIAL[host] || SOCIAL[base]) {
        return { source: SOCIAL[host] || SOCIAL[base], medium: 'social', host: host };
    }
    return { source: host, medium: 'referral', host: host };
}
