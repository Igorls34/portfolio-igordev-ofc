const { parseHighlightTitle, buildRevealWords } = PortfolioCore;

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
        } else if (typeof IntersectionObserver === 'function') {
            new IntersectionObserver((entries) => {
                inView = entries[0].isIntersecting;
                if (inView) start(); else stop();
            }, { threshold: 0 }).observe(hero);

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stop(); else start();
            });

            start();
        } else {
            // Sem observer nao da para pausar o canvas quando ele sai de tela,
            // mas melhor rodar sem pausa do que ficar sem particula nenhuma.
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

        // O observer e o que tira os titulos de opacity:0. Navegador sem
        // IntersectionObserver nao pode deixar a pagina em branco: nesse caso
        // revela tudo de uma vez.
        const canObserve = typeof IntersectionObserver === 'function';
        if (!canObserve) document.documentElement.classList.add('no-io');

        const observer = canObserve ? new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, { threshold: 0.3 }) : null;

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

            if (observer) observer.observe(title);
            else title.classList.add('revealed');
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
        if (!reveals.length) return;

        // Mesmo caso do initRevealTitles: sem IntersectionObserver, todo
        // .reveal ficaria preso em opacity:0 para sempre.
        const canObserve = typeof IntersectionObserver === 'function';
        if (!canObserve) document.documentElement.classList.add('no-io');

        if (!canObserve) {
            reveals.forEach(el => el.classList.add('active'));
            return;
        }

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


    function safely(name, fn) {
        try { fn(); } catch (err) { console.warn('[IgorDev] ' + name + ' nao iniciou:', err); }
    }

    document.addEventListener('DOMContentLoaded', () => {
        safely('cursor', initCursor);
        safely('scroll-progress', initScrollProgress);
        safely('header', initHeaderScroll);
        safely('particulas', initParticles);
        safely('titulos', initRevealTitles);
        safely('reveal', initScrollReveal);
        safely('tilt', initTiltCards);
        safely('parallax', initParallax);
        safely('botoes magneticos', initMagneticButtons);
    });
})();
