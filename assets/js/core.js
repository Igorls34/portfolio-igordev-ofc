/* Funcoes puras do portfolio.
 *
 * Nada aqui toca no DOM nem em API do browser, de proposito: e assim que
 * os testes com node --test conseguem exercitar exatamente o codigo que a
 * pagina executa, em vez de reimplementar a logica e testar a copia.
 *
 * No browser vira global PortfolioCore; no Node vira module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PortfolioCore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var MIN_PHONE_DIGITS = 10;
    var MAX_PHONE_DIGITS = 13;

    /* ---------- Seguranca ---------- */

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ---------- Contato ---------- */

    function toWhatsAppNumber(phone) {
        var digits = String(phone).replace(/\D/g, '');
        if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
        return digits.length <= 11 ? '55' + digits : digits;
    }

    function validateContact(data) {
        data = data || {};
        var errors = [];

        var name = String(data.name || '').trim();
        var email = String(data.email || '').trim();
        var phone = String(data.phone || '').trim();
        var message = String(data.message || '').trim();

        if (!name) errors.push('name');
        if (!message) errors.push('message');

        if (!email) {
            errors.push('email');
        } else if (!EMAIL_RE.test(email)) {
            errors.push('emailInvalid');
        }

        if (!phone) {
            errors.push('phone');
        } else if (toWhatsAppNumber(phone) === null) {
            errors.push('phoneInvalid');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /* Traduz o resultado dos canais em uma mensagem honesta.
     *
     * Regra que o bug antigo quebrava: falha nunca entra na contagem de
     * sucesso. Se os dois canais cairem, o usuario tem de ver o erro, e nao
     * um "Mensagem enviada!". */
    function summarizeDeliveries(results) {
        results = results || [];
        var succeeded = results.filter(function (r) { return r.ok; });
        var failed = results.filter(function (r) { return !r.ok; });

        if (succeeded.length === 0) {
            return {
                tone: 'error',
                success: false,
                text: 'Nao consegui enviar sua mensagem agora. Por favor, use o WhatsApp como alternativa.'
            };
        }

        var sent = succeeded.map(function (r) { return r.label; }).join(' e ');

        if (failed.length === 0) {
            return {
                tone: 'ok',
                success: true,
                text: 'Mensagem enviada! ' + sent + ' enviado com sucesso. Em breve entro em contato.'
            };
        }

        var notSent = failed.map(function (r) { return r.label; }).join(' e ');
        return {
            tone: 'warn',
            success: true,
            text: 'Mensagem enviada via ' + sent
                + '. Nao consegui entregar via ' + notSent
                + ', mas ja recebi seu contato e respondo em breve.'
        };
    }

    /* ---------- Animacao de titulos ---------- */

    /* Quebra o innerHTML de um titulo em partes, marcando quais vao para o
     * destaque. Aceita zero, um ou varios <em> -- o parser antigo com regex
     * gulosa tratava "A <em>B</em> <em>C</em>" como um unico destaque. */
    function parseHighlightTitle(html) {
        var parts = [];
        var re = /<em>([\s\S]*?)<\/em>/g;
        var last = 0;
        var match;

        while ((match = re.exec(html)) !== null) {
            if (match.index > last) {
                parts.push({ text: html.slice(last, match.index), highlight: false });
            }
            parts.push({ text: match[1], highlight: true });
            last = re.lastIndex;
        }

        if (last < html.length) {
            parts.push({ text: html.slice(last), highlight: false });
        }

        return parts;
    }

    /* Achata as partes em palavras, ja com o atraso incremental de cada uma.
     * O espacamento fica no margin-right do .word, entao separadores vazios
     * entre tags podem ser descartados. */
    function buildRevealWords(parts, delayStep) {
        var step = typeof delayStep === 'number' ? delayStep : 0.06;
        var words = [];

        (parts || []).forEach(function (part) {
            String(part.text).split(/\s+/).forEach(function (raw) {
                var word = raw.trim();
                if (!word) return;
                words.push({
                    word: word,
                    highlight: Boolean(part.highlight),
                    delay: Math.round(words.length * step * 1000) / 1000
                });
            });
        });

        return words;
    }

    return {
        escapeHtml: escapeHtml,
        toWhatsAppNumber: toWhatsAppNumber,
        validateContact: validateContact,
        summarizeDeliveries: summarizeDeliveries,
        parseHighlightTitle: parseHighlightTitle,
        buildRevealWords: buildRevealWords
    };
}));
