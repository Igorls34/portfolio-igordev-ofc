const BOT_WHATSAPP = "https://api.thessarasemijoias.com.br/wpp";
const BOT_EMAIL = "https://api.thessarasemijoias.com.br/email";
const SITE_URL = "https://igordev.netlify.app";

const {
    escapeHtml,
    toWhatsAppNumber,
    validateContact,
    summarizeDeliveries,
    parseHighlightTitle,
    buildRevealWords
} = PortfolioCore;

(function () {
    'use strict';

    /* ========== CUSTOM CURSOR ========== */
    function initCursor() {
        if (window.matchMedia('(max-width: 992px)').matches) return;
        if (window.matchMedia('(pointer: coarse)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        const dot = document.createElement('div');
        dot.className = 'cursor-dot';
        document.body.appendChild(cursor);
        document.body.appendChild(dot);

        let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
        let dotX = cursorX, dotY = cursorY;
        let circleX = cursorX, circleY = cursorY;
        let frameId = null;

        // O loop so roda enquanto o cursor esta em movimento. Sem isso o
        // requestAnimationFrame ficava ativo o tempo todo, mesmo com a
        // aba em segundo plano, gastando bateria.
        function tick() {
            dotX += (cursorX - dotX) * 0.35;
            dotY += (cursorY - dotY) * 0.35;
            circleX += (dotX - circleX) * 0.12;
            circleY += (dotY - circleY) * 0.12;
            dot.style.left = dotX + 'px';
            dot.style.top = dotY + 'px';
            cursor.style.left = circleX + 'px';
            cursor.style.top = circleY + 'px';

            const settled = Math.abs(cursorX - circleX) < 0.1
                && Math.abs(cursorY - circleY) < 0.1
                && Math.abs(cursorX - dotX) < 0.1
                && Math.abs(cursorY - dotY) < 0.1;

            if (settled) {
                frameId = null;
                return;
            }
            frameId = requestAnimationFrame(tick);
        }

        function start() {
            if (frameId === null) frameId = requestAnimationFrame(tick);
        }

        document.addEventListener('mousemove', (e) => {
            cursorX = e.clientX;
            cursorY = e.clientY;
            start();
        });

        document.addEventListener('mouseleave', () => {
            cursor.style.opacity = '0';
            dot.style.opacity = '0';
        });

        document.addEventListener('mouseenter', () => {
            cursor.style.opacity = '1';
            dot.style.opacity = '1';
        });

        const hoverTargets = document.querySelectorAll('a, button, .btn, .btn-link, .btn-submit, .project-card, .skill-item, .social-icon, .channel-item, input, textarea');
        hoverTargets.forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
        });

        // Ao voltar para a aba, o cursor pode estar deslocado do ultimo ponto.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) start();
        });
    }

    /* ========== SCROLL PROGRESS BAR ========== */
    function initScrollProgress() {
        const bar = document.querySelector('.scroll-progress');
        if (!bar) return;
        window.addEventListener('scroll', () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            bar.style.width = Math.min(progress, 100) + '%';
        });
    }

    /* ========== HEADER SCROLL EFFECT ========== */
    function initHeaderScroll() {
        const header = document.querySelector('header');
        if (!header) return;
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

    /* ========== PARTICLES CANVAS ============ */
    function initParticles() {
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) return;
        const hero = canvas.parentElement;
        const ctx = canvas.getContext('2d');

        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const particleCount = isMobile ? 40 : 90;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const LINK_DISTANCE = 100;

        let particles = [];
        let frameId = null;
        let inView = true;

        function resize() {
            canvas.width = hero.offsetWidth;
            canvas.height = hero.offsetHeight;
        }

        class Particle {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2.5 + 0.8;
                this.speedX = (Math.random() - 0.5) * 0.4;
                this.speedY = (Math.random() - 0.5) * 0.4 - 0.3;
                this.opacity = Math.random() * 0.5 + 0.1;
                this.opacitySpeed = (Math.random() - 0.5) * 0.005;
                this.hue = Math.random() > 0.5 ? 217 : 270;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.opacity += this.opacitySpeed;

                if (this.opacity <= 0.05 || this.opacity >= 0.6) {
                    this.opacitySpeed *= -1;
                }
                if (this.x < -20 || this.x > canvas.width + 20 ||
                    this.y < -20 || this.y > canvas.height + 20) {
                    this.reset();
                    this.y = canvas.height + 10;
                }
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 80%, 55%, ${this.opacity})`;
                ctx.fill();
            }
        }

        function init() {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function drawFrame() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.update();
                p.draw();
            });

            // Draw connections between nearby particles
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < LINK_DISTANCE) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        const lineOpacity = (1 - dist / LINK_DISTANCE) * 0.08;
                        ctx.strokeStyle = `rgba(59, 130, 246, ${lineOpacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        }

        function loop() {
            drawFrame();
            frameId = requestAnimationFrame(loop);
        }

        // Antes o rAF rodava para sempre, mesmo com o hero fora da tela ou a
        // aba oculta. Sao ~4000 comparacoes de distancia por frame.
        function start() {
            if (reducedMotion) return;
            if (frameId === null && inView && !document.hidden) {
                frameId = requestAnimationFrame(loop);
            }
        }

        function stop() {
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
        }

        resize();
        init();

        // Com movimento reduzido o usuario recebe um quadro estatico, sem loop.
        if (reducedMotion) {
            drawFrame();
        } else {
            new IntersectionObserver((entries) => {
                inView = entries[0].isIntersecting;
                if (inView) start(); else stop();
            }, { threshold: 0 }).observe(hero);

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stop(); else start();
            });

            start();
        }

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                resize();
                init();
                if (reducedMotion) drawFrame();
            }, 200);
        });
    }

    /* ========== REVEAL DE TITULOS (palavra a palavra) ==========
     * Substitui as tres implementacoes duplicadas que existiam antes
     * (initTextReveal, initSectionTitleReveal, initHeroTitle). Cada uma
     * reimplementava o parse do HTML do titulo a mao, e a versao do
     * .text-reveal usava marcadores de asterisco no texto em vez de tag.
     * Agora o parse mora em core.js e e testado de verdade. */

    function initRevealTitles() {
        const titles = document.querySelectorAll('.hero-title, .section-title, .text-reveal');
        if (!titles.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, { threshold: 0.3 });

        titles.forEach(title => {
            const parts = parseHighlightTitle(title.innerHTML);
            const words = buildRevealWords(parts, 0.07);

            title.textContent = '';
            words.forEach(w => {
                const word = document.createElement('span');
                word.className = w.highlight ? 'word highlight' : 'word';
                const inner = document.createElement('span');
                inner.className = 'word-inner';
                inner.style.setProperty('--word-delay', w.delay + 's');
                inner.textContent = w.word;
                word.appendChild(inner);
                title.appendChild(word);
            });

            observer.observe(title);
        });
    }

    /* ========== 3D TILT ON CARDS ========== */
    function initTiltCards() {
        if (window.matchMedia('(max-width: 992px)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // Só nos cards de projeto. Nos .skill-item o tilt escrevia transform
        // inline por cima do translateY(-14px) do hover, cancelando o
        // destaque que o CSS desenhava.
        const cards = document.querySelectorAll('.project-card');

        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -8;
                const rotateY = ((x - centerX) / centerX) * 8;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });

            card.addEventListener('mouseenter', () => {
                card.style.transition = 'transform 0.1s ease';
            });
        });
    }

    /* ========== REVEAL ON SCROLL ========== */
    function initScrollReveal() {
        const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        reveals.forEach(el => observer.observe(el));
    }

    /* ========== PARALLAX SUBTLE ========== */
    function initParallax() {
        if (window.matchMedia('(max-width: 768px)').matches) return;

        const heroImg = document.querySelector('.hero-img-wrapper');

        window.addEventListener('scroll', () => {
            if (heroImg) {
                const heroRect = document.querySelector('.hero-section').getBoundingClientRect();
                const progress = Math.max(0, Math.min(1, -heroRect.top / heroRect.height));
                heroImg.style.transform = `translateY(${progress * 40}px)`;
            }
        });
    }

    /* ========== MAGNETIC BUTTONS ========== */
    function initMagneticButtons() {
        if (window.matchMedia('(max-width: 992px)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const buttons = document.querySelectorAll('.btn-primary, .btn-submit');

        buttons.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                // O -3px preserva o translateY do :hover do CSS, que o
                // transform inline descartaria.
                btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3 - 3}px)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
            });
        });
    }

    /* ========== MOBILE MENU ========== */
    function initMobileMenu() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const navLinks = document.querySelectorAll('.nav-menu a');

        if (!menuToggle || !navMenu) return;

        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const expanded = navMenu.classList.contains('active');
            menuToggle.setAttribute('aria-expanded', expanded);
            menuToggle.setAttribute('aria-label', expanded ? 'Fechar menu' : 'Abrir menu');
            const icon = menuToggle.querySelector('i');
            if (expanded) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.setAttribute('aria-label', 'Abrir menu');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }

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
        });
    }

    /* ========== INIT ALL ========== */
    document.addEventListener('DOMContentLoaded', () => {
        initCursor();
        initScrollProgress();
        initHeaderScroll();
        initParticles();
        initRevealTitles();
        initScrollReveal();
        initTiltCards();
        initParallax();
        initMagneticButtons();
        initMobileMenu();
        initForm();
    });

})();
