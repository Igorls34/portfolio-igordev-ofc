const BACKEND_URL = "https://script.google.com/macros/s/AKfycbzTUAx9ctYqkeIIBNbBJhK33K7hl4Um1gEXWEP9b9JzIHY6MYsD24OSPhARRunUdBJr/exec";

(function () {
    'use strict';

    /* ========== CUSTOM CURSOR ========== */
    function initCursor() {
        if (window.matchMedia('(max-width: 992px)').matches) return;
        if (window.matchMedia('(pointer: coarse)').matches) return;

        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        const dot = document.createElement('div');
        dot.className = 'cursor-dot';
        document.body.appendChild(cursor);
        document.body.appendChild(dot);

        let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
        let dotX = cursorX, dotY = cursorY;
        let circleX = cursorX, circleY = cursorY;

        document.addEventListener('mousemove', (e) => {
            cursorX = e.clientX;
            cursorY = e.clientY;
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

        function animate() {
            dotX += (cursorX - dotX) * 0.35;
            dotY += (cursorY - dotY) * 0.35;
            dot.style.left = dotX + 'px';
            dot.style.top = dotY + 'px';

            circleX += (dotX - circleX) * 0.12;
            circleY += (dotY - circleY) * 0.12;
            cursor.style.left = circleX + 'px';
            cursor.style.top = circleY + 'px';

            requestAnimationFrame(animate);
        }
        animate();
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

    /* ========== PARTICLES CANVAS ========== */
    function initParticles() {
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationId;

        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const particleCount = isMobile ? 40 : 90;

        function resize() {
            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
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

        function animate() {
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
                    if (dist < 100) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        const lineOpacity = (1 - dist / 100) * 0.08;
                        ctx.strokeStyle = `rgba(59, 130, 246, ${lineOpacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            animationId = requestAnimationFrame(animate);
        }

        resize();
        init();
        animate();

        window.addEventListener('resize', () => {
            resize();
            init();
        });
    }

    /* ========== TEXT WORD-BY-WORD REVEAL ========== */
    function initTextReveal() {
        const titles = document.querySelectorAll('.text-reveal');

        titles.forEach(title => {
            const text = title.textContent.trim();
            title.textContent = '';
            const words = text.split(' ');

            words.forEach((word, i) => {
                const wordSpan = document.createElement('span');
                wordSpan.className = 'word';
                if (word.startsWith('*') && word.endsWith('*')) {
                    const cleanWord = word.slice(1, -1);
                    wordSpan.className = 'word highlight';
                    wordSpan.innerHTML = `<span class="word-inner" style="transition-delay:${i * 0.07}s">${cleanWord}&nbsp;</span>`;
                } else {
                    wordSpan.innerHTML = `<span class="word-inner" style="transition-delay:${i * 0.07}s">${word}&nbsp;</span>`;
                }
                title.appendChild(wordSpan);
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, { threshold: 0.3 });

        document.querySelectorAll('.text-reveal').forEach(el => observer.observe(el));
    }

    /* ========== SECTION TITLES - WORD REVEAL ========== */
    function initSectionTitleReveal() {
        const titles = document.querySelectorAll('.section-title');

        titles.forEach(title => {
            const html = title.innerHTML;
            const hasSpan = html.includes('<span>');

            if (hasSpan) {
                const match = html.match(/^(.*)<span>(.*)<\/span>(.*)$/);
                if (match) {
                    const before = match[1].trim();
                    const highlighted = match[2].trim();
                    const after = match[3].trim();

                    title.textContent = '';
                    const beforeWords = before.split(' ');
                    beforeWords.forEach((w, i) => {
                        const span = document.createElement('span');
                        span.className = 'word';
                        span.innerHTML = `<span class="word-inner" style="transition-delay:${i * 0.06}s">${w}&nbsp;</span>`;
                        title.appendChild(span);
                    });

                    if (highlighted) {
                        const hWords = highlighted.split(' ');
                        hWords.forEach((w, i) => {
                            const span = document.createElement('span');
                            span.className = 'word highlight';
                            span.innerHTML = `<span class="word-inner" style="transition-delay:${(beforeWords.length + i) * 0.06}s">${w}&nbsp;</span>`;
                            title.appendChild(span);
                        });
                    }

                    const afterWords = after.split(' ').filter(w => w.length > 0);
                    afterWords.forEach((w, i) => {
                        const span = document.createElement('span');
                        span.className = 'word';
                        span.innerHTML = `<span class="word-inner" style="transition-delay:${(beforeWords.length + (highlighted ? highlighted.split(' ').length : 0) + i) * 0.06}s">${w}&nbsp;</span>`;
                        title.appendChild(span);
                    });
                }
            } else {
                const words = html.trim().split(' ');
                title.textContent = '';
                words.forEach((w, i) => {
                    const span = document.createElement('span');
                    span.className = 'word';
                    span.innerHTML = `<span class="word-inner" style="transition-delay:${i * 0.06}s">${w}&nbsp;</span>`;
                    title.appendChild(span);
                });
            }
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, { threshold: 0.3 });

        document.querySelectorAll('.section-title').forEach(el => observer.observe(el));
    }

    /* ========== HERO TITLE INITIAL ANIMATION ========== */
    function initHeroTitle() {
        const heroTitle = document.querySelector('.hero-title');
        if (!heroTitle) return;

        const html = heroTitle.innerHTML;
        const match = html.match(/^(.*)<span>(.*)<\/span>(.*)$/);

        if (match) {
            const before = match[1].trim();
            const highlighted = match[2].trim();
            const after = match[3].trim();

            heroTitle.textContent = '';

            const beforeWords = before.split(' ');
            beforeWords.forEach((w, i) => {
                const span = document.createElement('span');
                span.className = 'word';
                span.innerHTML = `<span class="word-inner" style="--delay:${i * 0.12}s">${w}&nbsp;</span>`;
                heroTitle.appendChild(span);
            });

            if (highlighted) {
                const hWords = highlighted.split(' ');
                hWords.forEach((w, i) => {
                    const span = document.createElement('span');
                    span.className = 'word highlight';
                    span.innerHTML = `<span class="word-inner" style="--delay:${(beforeWords.length + i) * 0.12}s">${w}&nbsp;</span>`;
                    heroTitle.appendChild(span);
                });
            }

            const afterWords = after.split(' ').filter(w => w.length > 0);
            afterWords.forEach((w, i) => {
                const span = document.createElement('span');
                span.className = 'word';
                span.innerHTML = `<span class="word-inner" style="--delay:${(beforeWords.length + (highlighted ? highlighted.split(' ').length : 0) + i) * 0.12}s">${w}&nbsp;</span>`;
                heroTitle.appendChild(span);
            });
        }

        // Trigger animation after short delay
        setTimeout(() => {
            heroTitle.classList.add('revealed');
        }, 200);
    }

    /* ========== 3D TILT ON CARDS ========== */
    function initTiltCards() {
        if (window.matchMedia('(max-width: 992px)').matches) return;

        const cards = document.querySelectorAll('.project-card, .skill-item');

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
                card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
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

        const sections = document.querySelectorAll('.about-section, .skills-section, .projects-section');
        const heroImg = document.querySelector('.hero-img-wrapper');

        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;

            sections.forEach(section => {
                const speed = 0.03;
                const rect = section.getBoundingClientRect();
                const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
                const gradient = section.querySelector('::before');
            });

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

        const buttons = document.querySelectorAll('.btn-primary, .btn-submit');

        buttons.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translate(0, 0)';
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
            const icon = menuToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
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
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }

    /* ========== FORM HANDLER (FIXED) ========== */
    function initForm() {
        const contactForm = document.getElementById('contact-form');
        if (!contactForm) return;

        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const button = document.getElementById('submit-btn');
            const messageDiv = document.getElementById('form-message');

            button.textContent = 'Enviando...';
            button.disabled = true;
            messageDiv.innerHTML = '';
            messageDiv.style.display = 'none';

            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                message: document.getElementById('message').value
            };

            try {
                const response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    mode: 'cors',
                    body: JSON.stringify(formData),
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    }
                });

                const result = await response.json();

                if (result.success) {
                    messageDiv.style.display = 'block';
                    messageDiv.innerHTML = '<p style="color:#22c55e; background:rgba(34,197,94,0.08); padding:16px; border-radius:12px; border:1px solid rgba(34,197,94,0.3);">Mensagem enviada com sucesso! Em breve entrarei em contato.</p>';
                    contactForm.reset();
                } else {
                    throw new Error(result.error || 'Erro no servidor');
                }
            } catch (err) {
                messageDiv.style.display = 'block';
                messageDiv.innerHTML = '<p style="color:#ef4444; background:rgba(239,68,68,0.08); padding:16px; border-radius:12px; border:1px solid rgba(239,68,68,0.3);">Erro ao enviar. Por favor, use o WhatsApp como alternativa.</p>';
                console.error('Erro:', err);
            } finally {
                button.textContent = 'Enviar Proposta';
                button.disabled = false;
            }
        });
    }

    /* ========== INIT ALL ========== */
    document.addEventListener('DOMContentLoaded', () => {
        initCursor();
        initScrollProgress();
        initHeaderScroll();
        initParticles();
        initHeroTitle();
        initSectionTitleReveal();
        initTextReveal();
        initScrollReveal();
        initTiltCards();
        initParallax();
        initMagneticButtons();
        initMobileMenu();
        initForm();
    });

})();
