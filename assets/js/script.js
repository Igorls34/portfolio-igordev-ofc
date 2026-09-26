const BOT_WHATSAPP = "https://api.exemplo.com/wpp";
const BOT_EMAIL = "https://api.exemplo.com/email";
const SITE_URL = "https://igordev-portfolio-ofc.netlify.app";

const { escapeHtml, toWhatsAppNumber, validateContact, summarizeDeliveries } = PortfolioCore;

(function () {
    'use strict';

    /* ========== FORM HANDLER ========== */
    const REQUEST_TIMEOUT_MS = 12000;

    /* POST com timeout. Antes, se a API travasse o botao ficava preso em
       "Enviando..." para sempre, sem nenhuma forma de o usuario sair. */
    async function postToBot(baseUrl, path, payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(baseUrl + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            return Boolean(data && data.success);
        } finally {
            clearTimeout(timer);
        }
    }

    function setFormMessage(el, tone, html) {
        const colors = {
            ok: ['#22c55e', 'rgba(34,197,94,0.08)', 'rgba(34,197,94,0.3)'],
            warn: ['#f59e0b', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.3)'],
            error: ['#ef4444', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.3)']
        };
        const [fg, bg, border] = colors[tone];
        el.innerHTML = '<p style="color:' + fg + '; background:' + bg
            + '; padding:16px; border-radius:12px; border:1px solid ' + border + ';">'
            + html + '</p>';
    }

    function initForm() {
        const contactForm = document.getElementById('contact-form');
        if (!contactForm) return;

        const button = document.getElementById('submit-btn');
        const messageDiv = document.getElementById('form-message');
        const honeypot = document.getElementById('website');

        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            // Bot preencheu o campo isento: finge sucesso sem chamar a API.
            if (honeypot && honeypot.value) {
                contactForm.reset();
                return;
            }

            button.textContent = 'Enviando...';
            button.disabled = true;
            messageDiv.style.display = 'none';
            messageDiv.innerHTML = '';

            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const message = document.getElementById('message').value.trim();

            // O HTML exige os campos, mas um numero de celular invalido
            // passa pelo required do navegador e so quebrava na hora de
            // montar o envio. Valida aqui para poder avisar antes.
            const check = validateContact({ name, email, phone, message });
            if (!check.valid) {
                button.textContent = 'Enviar Proposta';
                button.disabled = false;
                messageDiv.style.display = 'block';
                const labels = {
                    email: 'E-mail invalido.',
                    emailInvalid: 'E-mail invalido.',
                    phone: 'Informe seu WhatsApp.',
                    phoneInvalid: 'Numero de WhatsApp invalido. Use DDD + numero.'
                };
                const first = check.errors.find(e => labels[e]);
                setFormMessage(messageDiv, 'error', first ? labels[first] : 'Confira os campos.');
                return;
            }

            const whatsappNumber = toWhatsAppNumber(phone);

            const whatsappMsg = `Olá *${name}*! Tudo bem?\n\nRecebi sua mensagem aqui no meu portfolio e ja te retorno em breve.\n\n*Mensagem enviada pelo site:*\n${message}\n\n— Igor Laurindo | IgorDev`;

            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f9fafb; border-radius: 16px; overflow: hidden; border: 1px solid #1f1f1f;">
                    <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Olá, ${escapeHtml(name)}!</h1>
                    </div>
                    <div style="padding: 30px;">
                        <p style="font-size: 16px; line-height: 1.7; color: #9ca3af; margin: 0 0 24px;">Recebi sua mensagem aqui no meu portfolio e vou analisar seu projeto com calma. Assim que possível te retorno pelo WhatsApp ou por aqui mesmo, beleza?</p>
                        <div style="background: #0d0d0d; border: 1px solid #1f1f1f; border-left: 3px solid #3b82f6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                            <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280;">Mensagem enviada pelo site</p>
                            <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #f9fafb; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</p>
                        </div>
                        <p style="font-size: 16px; line-height: 1.7; color: #9ca3af; margin: 0 0 16px;">Obrigado pela confiança!</p>
                        <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0;">Abraço,<br><strong style="color: #3b82f6;">Igor Laurindo</strong><br>IgorDev</p>
                        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #1f1f1f; text-align: center;">
                            <a href="${SITE_URL}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
                        </div>
                    </div>
                </div>
            `;

            // 'ok' = sucesso real. Falha NAO entra em 'ok', senao a falha
            // total caia no ramo de sucesso e o usuario via "enviado".
            const results = [];

            if (whatsappNumber) {
                try {
                    const ok = await postToBot(BOT_WHATSAPP, '/api/enviar-mensagem', {
                        numero: whatsappNumber,
                        mensagem: whatsappMsg
                    });
                    results.push({ label: 'WhatsApp', ok });
                } catch (err) {
                    results.push({ label: 'WhatsApp', ok: false });
                }
            }

            try {
                const ok = await postToBot(BOT_EMAIL, '/api/enviar-email', {
                    para: email,
                    assunto: 'Recebi sua mensagem! - IgorDev',
                    html: emailHtml
                });
                results.push({ label: 'E-mail', ok });
            } catch (err) {
                results.push({ label: 'E-mail', ok: false });
            }

            button.textContent = 'Enviar Proposta';
            button.disabled = false;
            messageDiv.style.display = 'block';

            const summary = summarizeDeliveries(results);
            setFormMessage(messageDiv, summary.tone, summary.text);

            if (summary.success) {
                contactForm.reset();
            }

            /* Avisa a camada de analytics que o envio terminou. E uma
             * dependencia opcional e de mao unica: se o arquivo de analytics
             * nao existir, ou falhar, o formulario ja foi resolvido e a
             * mensagem ja foi mostrada. Perder a telemetria e aceitavel;
             * perder o envio nao. */
            if (window.IgorAnalytics && typeof window.IgorAnalytics.reportFormResult === 'function') {
                window.IgorAnalytics.reportFormResult(summary.success, channelsSent(results));
            }
        });

        /* Rotulo curto do que de fato chegou, para o funil. "email" sozinho
         * nao diz se foi WhatsApp, e-mail ou os dois. */
        function channelsSent(results) {
            return results
                .filter(r => r.ok)
                .map(r => r.label.toLowerCase().replace(/\s+/g, '-'))
                .join('+') || 'nenhum';
        }
    }


    function safely(name, fn) {
        try { fn(); } catch (err) { console.warn('[IgorDev] ' + name + ' nao iniciou:', err); }
    }

    document.addEventListener('DOMContentLoaded', () => safely('formulario', initForm));
})();
