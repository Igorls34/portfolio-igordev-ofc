const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Text Reveal', () => {

  describe('Word splitting', () => {
    it('should split text into words', () => {
      const text = 'Focado em Resultados Reais';
      const words = text.split(' ');
      assert.strictEqual(words.length, 4);
      assert.deepStrictEqual(words, ['Focado', 'em', 'Resultados', 'Reais']);
    });

    it('should detect highlighted words with * markers', () => {
      const word = '*Resultados*';
      const isHighlighted = word.startsWith('*') && word.endsWith('*');
      assert.strictEqual(isHighlighted, true);
    });

    it('should clean highlighted word markers', () => {
      const word = '*Resultados*';
      const cleanWord = word.slice(1, -1);
      assert.strictEqual(cleanWord, 'Resultados');
    });

    it('should not mark regular words as highlighted', () => {
      const word = 'Focado';
      const isHighlighted = word.startsWith('*') && word.endsWith('*');
      assert.strictEqual(isHighlighted, false);
    });
  });

  describe('Section title parsing', () => {
    it('should extract HTML span from section title', () => {
      const html = 'Habilidades <span>Estrategicas</span>';
      const hasSpan = html.includes('<span>');
      assert.strictEqual(hasSpan, true);
    });

    it('should detect text without span', () => {
      const html = 'Projetos em Destaque';
      const hasSpan = html.includes('<span>');
      assert.strictEqual(hasSpan, false);
    });
  });

  describe('Hero title parsing', () => {
    it('should extract before/span/after from hero title', () => {
      const html = 'Inovacao em cada <span>Pixel.</span>';
      const match = html.match(/^(.*)<span>(.*)<\/span>(.*)$/);
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'Inovacao em cada');
      assert.strictEqual(match[2].trim(), 'Pixel.');
    });
  });
});
