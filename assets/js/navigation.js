(function () {
    'use strict';

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


    function safely(name, fn) {
        try { fn(); } catch (err) { console.warn('[IgorDev] ' + name + ' nao iniciou:', err); }
    }

    document.addEventListener('DOMContentLoaded', () => safely('menu', initMobileMenu));
})();
