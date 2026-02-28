const BACKEND_URL = "https://script.google.com/macros/s/AKfycbzTUAx9ctYqkeIIBNbBJhK33K7hl4Um1gEXWEP9b9JzIHY6MYsD24OSPhARRunUdBJr/exec";

                document.getElementById('contact-form').addEventListener('submit', async function(e) {
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
                    // Enviando como JSON real
                    const response = await fetch(BACKEND_URL, {
                      method: 'POST',
                      mode: 'cors', // Permitir leitura da resposta
                      body: JSON.stringify(formData),
                      headers: {
                        'Content-Type': 'text/plain;charset=utf-8', // Truque para evitar erro de preflight no Apps Script
                      }
                    });

                    const result = await response.json();

                    if (result.success) {
                      messageDiv.style.display = 'block';
                      messageDiv.innerHTML = '<p style="color:#28a745; background:#d4edda; padding:10px; border-radius:5px;">✅ Mensagem enviada! Salva na planilha e notificações disparadas.</p>';
                      form.reset();
                    } else {
                      throw new Error(result.error || 'Erro no servidor');
                    }
                  } catch (err) {
                    messageDiv.style.display = 'block';
                    messageDiv.innerHTML = '<p style="color:#dc3545; background:#f8d7da; padding:10px; border-radius:5px;">❌ Erro ao enviar. Tente novamente ou me chame no WhatsApp.</p>';
                    console.error('Erro detalhado:', err);
                  } finally {
                    button.textContent = 'Enviar Mensagem';
                    button.disabled = false;
                  }
                });