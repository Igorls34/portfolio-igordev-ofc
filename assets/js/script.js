/* Numero que recebe as propostas, em formato internacional, sem + e sem
   pontuacao. E o mesmo que ja aparece nos links wa.me do site. */
const WHATSAPP_CONTACT = "5524998574876";

const { validateContact } = PortfolioCore;

(function () {
    'use strict';

    /* ========== FORM HANDLER ==========
     *
     * O formulario nao tem back-end e nunca teve um que funcionasse: as duas
     * URLs de bot eram placeholders de exemplo.com, que nao resolve. Quem
     * preenchesse o formulario recebia erro de rede e a proposta nunca
     * chegava.
     *
     * Agora o site nao tenta enviar nada. Ele monta a conversa no WhatsApp
     * ja com o texto do visitante e abre o app. Quem decide se a mensagem
     * sai e o visitante, tocando em enviar -- e o site diz isso, em vez de
     * mostrar um "Mensagem enviada!" que seria mentira.
     *
     * Em troca: funciona sem custo de hospedagem, sem dominio de terceiro e
     * sem depender de servico de automacao que possa cair sem ninguem avisar. */

    function montarMensagem({ name, email, phone, message }) {
        return [
            `Olá Igor! Meu nome é ${name}, tudo bem?`,
            '',
            message,
            '',
            '— Enviado pelo seu portfólio',
            `E-mail: ${email}`,
            `WhatsApp: ${phone}`
        ].join('\n');
    }

    function linkDoWhatsApp(texto) {
        return `https://wa.me/${WHATSAPP_CONTACT}?text=${encodeURIComponent(texto)}`;
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

        const messageDiv = document.getElementById('form-message');
        const honeypot = document.getElementById('website');

        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();

            // Bot preencheu o campo isento: finge sucesso sem abrir nada.
            if (honeypot && honeypot.value) {
                contactForm.reset();
                return;
            }

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

            const link = linkDoWhatsApp(montarMensagem({ name, email, phone, message }));
            messageDiv.style.display = 'block';

            /* O popup so abre por causa do clique, o que e o que a maioria dos
             * navegadores exige. Quando mesmo assim volta null -- bloqueio de
             * popup, ou aviso do navegador -- o texto nao pode se perder:
             * nesse caso mostramos o link para a pessoa tocar. */
            const aberto = window.open(link, '_blank', 'noopener');

            if (aberto) {
                setFormMessage(messageDiv, 'ok',
                    'Abri o WhatsApp com a sua mensagem pronta. '
                    + 'É só tocar em <strong>enviar</strong> que ela chega até mim. '
                    + 'Se a aba não abriu, <a href="' + link + '" target="_blank" '
                    + 'rel="noopener">clique aqui</a>.');
            } else {
                setFormMessage(messageDiv, 'warn',
                    'Seu navegador bloqueou a abertura automática. '
                    + '<a href="' + link + '" target="_blank" rel="noopener">'
                    + 'Toque aqui para enviar sua mensagem pelo WhatsApp</a>.');
            }

            contactForm.reset();

            /* Para o funil, o que interessa e o formulario ter sido valido e a
             * conversa ter sido aberta. O site nao tem como saber se a pessoa
             * tocou em enviar la dentro, entao o canal vai como
             * "whatsapp-aberto" e nao como "enviado". */
            if (window.IgorAnalytics && typeof window.IgorAnalytics.reportFormResult === 'function') {
                window.IgorAnalytics.reportFormResult(true, 'whatsapp-aberto');
            }
        });
    }


    function safely(name, fn) {
        try { fn(); } catch (err) { console.warn('[IgorDev] ' + name + ' nao iniciou:', err); }
    }

    document.addEventListener('DOMContentLoaded', () => safely('formulario', initForm));
})();
