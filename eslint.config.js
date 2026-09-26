/* Configuracao flat do ESLint.
 *
 * O projeto nao tem build: os scripts do navegador sao scripts clássicos
 * (sem import/export), e os testes sao CommonJS. */

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    self: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    console: 'readonly',
    fetch: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    IntersectionObserver: 'readonly',
    AbortController: 'readonly',
    AbortSignal: 'readonly',
    Response: 'readonly',
    // Definido por assets/js/core.js, carregado antes no index.html.
    PortfolioCore: 'readonly',
    module: 'writable'
};

module.exports = [
    {
        files: ['assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: browserGlobals
        },
        linterOptions: {
            reportUnusedDisableDirectives: true
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
            // O codebase usa "if (x) return;" de uma linha, que 'error'
            // obrigaria a chaves em ~40 pontos sem ganho de seguranca.
            // 'multi-line' mantem a exigencia onde ela importa.
            curly: ['error', 'multi-line'],
            'no-return-assign': 'error',
            'no-throw-literal': 'error'
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'writable',
                __dirname: 'readonly',
                __filename: 'readonly',
                URL: 'readonly',
                TextDecoder: 'readonly',
                process: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'prefer-const': 'error',
            curly: ['error', 'multi-line']
        }
    }
];
