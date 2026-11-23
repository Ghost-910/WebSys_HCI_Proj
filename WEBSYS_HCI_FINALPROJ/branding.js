(function () {
    const FOLDER = 'Photos/'; 
    // Browser tab icon, phone home-screen icon, address-bar colour 
    document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
    const addLink = (rel, href, attrs) => { const l = document.createElement('link'); l.rel = rel; l.href = href; Object.assign(l, attrs || {}); document.head.appendChild(l); };
    addLink('icon', FOLDER + 'favicon-32.png', { type: 'image/png', sizes: '32x32' });
    addLink('icon', FOLDER + 'favicon-64.png', { type: 'image/png', sizes: '64x64' });
    addLink('apple-touch-icon', FOLDER + 'apple-touch-icon.png');
    if (!document.querySelector('meta[name="theme-color"]')) { const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#2c5b9b'; document.head.appendChild(m); }

    // Logo images (dark mode gets a slightly lighter blue so it stays easy to see) 
    const st = document.createElement('style');
    st.textContent = '.brand-logo{display:block;width:auto;object-fit:contain;user-select:none;-webkit-user-drag:none}.dark .brand-logo{filter:brightness(1.3) saturate(1.1)}';
    document.head.appendChild(st);

    // Swap an existing icon for the logo, but only once the picture has really loaded (otherwise the old icon stays)
    function swapIn(oldEl, height, alt, extraClass) {
        if (!oldEl) return;
        const img = new Image();
        img.className = 'brand-logo' + (extraClass ? ' ' + extraClass : '');
        img.style.height = height; img.alt = alt; img.draggable = false;
        if (!alt) img.setAttribute('aria-hidden', 'true');
        img.onload = () => oldEl.replaceWith(img);
        img.src = FOLDER + 'logo.png';
    }

    // Top bar: the plain book drawing next to the "EduMaxxing" name
    const headerTitle = document.querySelector('#mainAppWrapper header h1');
    const headerIcon = headerTitle && headerTitle.previousElementSibling;
    if (headerIcon && headerIcon.tagName.toLowerCase() === 'svg') swapIn(headerIcon, '36px', '');

    // Sign-in / create-account card: the blue square at the top
    swapIn(document.querySelector('#authScreen .ios-glass-card .w-16.h-16'), '84px', 'EduMaxxing logo', 'mb-4');
})();