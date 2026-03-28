const BACKEND_URL = "https://script.google.com/macros/s/AKfycbzTUAx9ctYqkeIIBNbBJhK33K7hl4Um1gEXWEP9b9JzIHY6MYsD24OSPhARRunUdBJr/exec";

// Animação de Revelação ao Scroll
const revealElements = () => {
    const reveals = document.querySelectorAll('.reveal');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, {
        threshold: 0.1
    });

    reveals.forEach(element => {
        observer.observe(element);
    });
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    revealElements();

    // Menu Mobile
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            
            // Mudar ícone
            const icon = menuToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });

        // Fechar menu ao clicar em um link
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                const icon = menuToggle.querySelector('i');
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            });
        });
    }

    // Lógica do Formulário de Contato
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const button = document.getElementById('submit-btn');
            const messageDiv = document.getElementById('form-message');
            const form = this;
            
            button.textContent = 'Enviando...';
            button.disabled = true;
            messageDiv.innerHTML = '';
            messageDiv.style.display = 'none';

            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                whatsapp: document.getElementById('whatsapp').value,
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
                    messageDiv.innerHTML = '<p style="color:#22c55e; background:rgba(34, 197, 94, 0.1); padding:15px; border-radius:10px; border: 1px solid #22c55e;">✅ Mensagem enviada com sucesso! Em breve entrarei em contato.</p>';
                    form.reset();
                } else {
                    throw new Error(result.error || 'Erro no servidor');
                }
            } catch (err) {
                messageDiv.style.display = 'block';
                messageDiv.innerHTML = '<p style="color:#ef4444; background:rgba(239, 68, 68, 0.1); padding:15px; border-radius:10px; border: 1px solid #ef4444;">❌ Erro ao enviar. Por favor, tente novamente ou use o WhatsApp.</p>';
                console.error('Erro detalhado:', err);
            } finally {
                button.textContent = 'Enviar Mensagem';
                button.disabled = false;
            }
        });
    }
});