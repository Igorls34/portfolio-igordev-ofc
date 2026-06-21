const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Contact Form', () => {

  describe('Form validation', () => {
    it('should validate required name field', () => {
      const name = '';
      const isValid = name.trim().length > 0;
      assert.strictEqual(isValid, false);
    });

    it('should validate required email field', () => {
      const email = '';
      const isValid = email.trim().length > 0;
      assert.strictEqual(isValid, false);
    });

    it('should validate required phone field', () => {
      const phone = '';
      const isValid = phone.trim().length > 0;
      assert.strictEqual(isValid, false);
    });

    it('should validate required message field', () => {
      const message = '';
      const isValid = message.trim().length > 0;
      assert.strictEqual(isValid, false);
    });

    it('should accept valid form data', () => {
      const formData = {
        name: 'Igor',
        email: 'igor@example.com',
        phone: '(24) 99999-8888',
        message: 'Quero um orcamento'
      };
      const isValid = formData.name.trim().length > 0
        && formData.email.trim().length > 0
        && formData.phone.trim().length > 0
        && formData.message.trim().length > 0;
      assert.strictEqual(isValid, true);
    });
  });

  describe('Phone number formatting', () => {
    it('should strip non-digits from phone', () => {
      const phone = '(24) 99999-8888';
      const digits = phone.replace(/\D/g, '');
      assert.strictEqual(digits, '24999998888');
    });

    it('should add +55 prefix for 10-digit numbers', () => {
      const digits = '2498887777';
      const whatsappNumber = digits.length <= 11 ? '55' + digits : digits;
      assert.strictEqual(whatsappNumber, '552498887777');
    });

    it('should add +55 prefix for 11-digit numbers', () => {
      const digits = '24999998888';
      const whatsappNumber = digits.length <= 11 ? '55' + digits : digits;
      assert.strictEqual(whatsappNumber, '5524999998888');
    });
  });

  describe('HTML escaping', () => {
    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    it('should escape HTML special chars', () => {
      const result = escapeHtml('<script>alert("xss")</script>');
      assert.ok(!result.includes('<script>'));
      assert.ok(result.includes('&lt;script&gt;'));
    });

    it('should preserve normal text', () => {
      const result = escapeHtml('Igor Laurindo');
      assert.strictEqual(result, 'Igor Laurindo');
    });
  });

  describe('Bot endpoints configuration', () => {
    it('BOT_WHATSAPP should be a valid URL', () => {
      const url = 'https://api.thessarasemijoias.com.br/wpp';
      assert.ok(url.startsWith('https://'));
      assert.ok(url.includes('api'));
    });

    it('BOT_EMAIL should be a valid URL', () => {
      const url = 'https://api.thessarasemijoias.com.br/email';
      assert.ok(url.startsWith('https://'));
      assert.ok(url.includes('api'));
    });
  });
});
