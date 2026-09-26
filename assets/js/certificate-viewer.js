(function () {
    'use strict';

    const grid = document.querySelector('.certs-grid');
    if (!grid) return;

    const modal = document.getElementById('certificateViewer');
    if (!modal || !window.bootstrap || !window.bootstrap.Modal) return;

    const title = document.getElementById('certificateViewerTitle');
    const controls = modal.querySelector('.cert-viewer__controls');
    const stage = modal.querySelector('.cert-viewer__stage');
    const image = modal.querySelector('.cert-viewer__image');
    const zoomOutButton = controls.querySelector('[data-cert-zoom="out"]');
    const zoomResetButton = controls.querySelector('[data-cert-zoom="reset"]');
    const zoomInButton = controls.querySelector('[data-cert-zoom="in"]');
    const modalApi = window.bootstrap.Modal.getOrCreateInstance(modal, {
        backdrop: true,
        keyboard: true,
        focus: true
    });
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let activePointer = null;
    let dragOrigin = null;
    let opener = null;

    function render() {
        image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        image.classList.toggle('is-zoomed', scale > 1);
    }

    function zoomTo(nextScale, anchorX, anchorY) {
        const bounded = Math.min(5, Math.max(1, nextScale));
        if (bounded === scale) return;
        if (anchorX !== undefined && anchorY !== undefined) {
            const ratio = bounded / scale;
            offsetX = anchorX - (anchorX - offsetX) * ratio;
            offsetY = anchorY - (anchorY - offsetY) * ratio;
        }
        scale = bounded;
        if (scale === 1) {
            offsetX = 0;
            offsetY = 0;
        }
        render();
    }

    function resetZoom() {
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        render();
    }

    zoomOutButton.addEventListener('click', () => zoomTo(scale - 0.5));
    zoomResetButton.addEventListener('click', resetZoom);
    zoomInButton.addEventListener('click', () => zoomTo(scale + 0.5));

    modal.addEventListener('shown.bs.modal', () => zoomOutButton.focus());
    modal.addEventListener('hidden.bs.modal', () => {
        image.removeAttribute('src');
        if (opener && opener.isConnected) opener.focus();
    });

    grid.addEventListener('click', event => {
        const trigger = event.target.closest('.cert-preview');
        if (!trigger) return;

        const preview = trigger.querySelector('.cert-img');
        if (!preview) return;

        opener = trigger;
        title.textContent = preview.alt;
        image.src = preview.currentSrc || preview.src;
        image.alt = preview.alt;
        resetZoom();
        modalApi.show();
    });

    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            modalApi.hide();
            return;
        }
        if (event.key === '+' || event.key === '=') zoomTo(scale + 0.5);
        if (event.key === '-') zoomTo(scale - 0.5);
        if (event.key === 'Home') resetZoom();
        if (scale > 1 && event.key.startsWith('Arrow')) {
            const step = 40;
            if (event.key === 'ArrowLeft') offsetX += step;
            if (event.key === 'ArrowRight') offsetX -= step;
            if (event.key === 'ArrowUp') offsetY += step;
            if (event.key === 'ArrowDown') offsetY -= step;
            render();
        }
    });

    stage.addEventListener('wheel', event => {
        if (!modal.classList.contains('show')) return;
        event.preventDefault();
        const rect = stage.getBoundingClientRect();
        zoomTo(scale + (event.deltaY < 0 ? 0.25 : -0.25),
            event.clientX - rect.left - rect.width / 2,
            event.clientY - rect.top - rect.height / 2);
    }, { passive: false });

    stage.addEventListener('pointerdown', event => {
        if (scale === 1 || event.button !== 0) return;
        activePointer = event.pointerId;
        dragOrigin = { x: event.clientX, y: event.clientY, offsetX, offsetY };
        stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener('pointermove', event => {
        if (event.pointerId !== activePointer || !dragOrigin) return;
        offsetX = dragOrigin.offsetX + event.clientX - dragOrigin.x;
        offsetY = dragOrigin.offsetY + event.clientY - dragOrigin.y;
        render();
    });

    function finishDrag(event) {
        if (event.pointerId !== activePointer) return;
        activePointer = null;
        dragOrigin = null;
    }

    stage.addEventListener('pointerup', finishDrag);
    stage.addEventListener('pointercancel', finishDrag);
})();