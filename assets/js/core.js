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

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const MIN_PHONE_DIGITS = 10;
    const MAX_PHONE_DIGITS = 13;
    const CONSENT_KEY = 'igordev_consent';

    /* ---------- Consentimento (LGPD) ---------- */

    /* O storage entra como parametro para poder ser testado com um duble,
     * e para nao estourar quando o navegador bloqueia localStorage. */
    function getConsent(storage) {
        if (!storage) return null;
        try {
            const value = storage.getItem(CONSENT_KEY);
            return (value === 'granted' || value === 'denied') ? value : null;
        } catch (err) {
            return null;
        }
    }

    function setConsent(storage, value) {
        if (!storage) return false;
        try {
            storage.setItem(CONSENT_KEY, value === 'granted' ? 'granted' : 'denied');
            return true;
        } catch (err) {
            return false;
        }
    }

    /* Analytics so pode carregar com consentimento concedido. */
    function shouldLoadAnalytics(consent) {
        return consent === 'granted';
    }

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
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return null;
        return digits.length <= 11 ? '55' + digits : digits;
    }

    function validateContact(data) {
        data = data || {};
        const errors = [];

        const name = String(data.name || '').trim();
        const email = String(data.email || '').trim();
        const phone = String(data.phone || '').trim();
        const message = String(data.message || '').trim();

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
        const succeeded = results.filter(function (r) { return r.ok; });
        const failed = results.filter(function (r) { return !r.ok; });

        if (succeeded.length === 0) {
            return {
                tone: 'error',
                success: false,
                text: 'Nao consegui enviar sua mensagem agora. Por favor, use o WhatsApp como alternativa.'
            };
        }

        const sent = succeeded.map(function (r) { return r.label; }).join(' e ');

        if (failed.length === 0) {
            // "WhatsApp enviado" (um) x "WhatsApp e E-mail enviados" (dois).
            // Com os dois canais no total e sempre plural; o singular so entra
            // se um dia o formulario passar a ter um canal so.
            return {
                tone: 'ok',
                success: true,
                text: 'Mensagem enviada! ' + sent
                    + (succeeded.length > 1 ? ' enviados' : ' enviado')
                    + ' com sucesso. Em breve entro em contato.'
            };
        }

        const notSent = failed.map(function (r) { return r.label; }).join(' e ');
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
     * destaque. Aceita <em> e <span>, com ou sem atributos, e zero, um ou
     * varios destaques -- um parser guloso tratava
     * "A <em>B</em> <em>C</em>" como um unico destaque.
     *
     * O atributo importa: o HTML do site usa <em class="hl">. Um padrao que
     * exigia "<em>" exato nao casava, o texto do tag inteiro vazava para a
     * tela e o titulo aparecia com o HTML escrito a que. */
    const ANY_TAG_RE = /<\/?[a-z][^>]*>/gi;

    function parseHighlightTitle(html) {
        // Nasce dentro da funcao de proposito: um regex com flag /g guarda
        // lastIndex, e um unico objeto compartilhado entre chamadas carrega
        // estado de uma execucao para a seguinte.
        const tagRe = /<(em|span)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
        const parts = [];
        const source = String(html == null ? '' : html);
        // As tags inner do titulo viram texto puro: a animacao reconstroi o
        // conteudo com textContent, e qualquer tag que sobrasse apareceria
        // escrita na tela.
        let last = 0;
        let match;

        while ((match = tagRe.exec(source)) !== null) {
            if (match.index > last) {
                parts.push({ text: source.slice(last, match.index), highlight: false });
            }
            parts.push({ text: match[3], highlight: true });
            last = tagRe.lastIndex;
        }

        if (last < source.length) {
            parts.push({ text: source.slice(last), highlight: false });
        }

        return parts
            .filter(function (p) { return p.text.replace(ANY_TAG_RE, '').trim() !== ''; })
            .map(function (p) {
                return { text: p.text.replace(ANY_TAG_RE, ''), highlight: p.highlight };
            });
    }

    /* Achata as partes em palavras, ja com o atraso incremental de cada uma.
     * O espacamento entre as palavras vem do margin-right do .word, no CSS, e
     * nao de um espaco no texto: um no-break space travaria a quebra de linha
     * do titulo no celular. */

    function buildRevealWords(parts, delayStep) {
        const step = typeof delayStep === 'number' ? delayStep : 0.06;
        const words = [];

        (parts || []).forEach(function (part) {
            String(part.text).split(/\s+/).forEach(function (raw) {
                const word = raw.trim();
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
        buildRevealWords: buildRevealWords,
        getConsent: getConsent,
        setConsent: setConsent,
        shouldLoadAnalytics: shouldLoadAnalytics
    };
}));
