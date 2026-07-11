/* ═══════════════════════════════════════════════════════════════
   ConnectModa – main.js
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. NAVBAR: SOMBRA AL HACER SCROLL ────────────────────────
  const navbar = document.getElementById('navbar');

  // ── 2. NAVBAR: OCULTAR / MOSTRAR SEGÚN DIRECCIÓN ─────────────
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentY     = window.scrollY;
    const scrollingDown = currentY > lastScrollY;

    // Sombra
    navbar.classList.toggle('scrolled', currentY > 30);

    // Ocultar bajando, mostrar subiendo
    if (scrollingDown && currentY > 400) {
      navbar.style.transform = 'translateY(-100%)';
    } else {
      navbar.style.transform = 'translateY(0)';
    }

    lastScrollY = currentY;
  });


  // ── 3. HAMBURGER MENU (MÓVIL) ─────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    navLinks.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Cerrar menú al tocar un enlace
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });


  // ── 4. ENLACE ACTIVO EN NAVBAR ───────────────────────────────
  const sections = document.querySelectorAll('section[id]');
  const allLinks = document.querySelectorAll('.nav-links a');

  function updateActiveLink() {
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 140) current = sec.id;
    });
    allLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + current);
    });
  }

  window.addEventListener('scroll', updateActiveLink);
  updateActiveLink();


  // ── 5. SCROLL SUAVE ──────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - navbar.offsetHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });


  // ── 6. BOTÓN SCROLL TO TOP ───────────────────────────────────
  const scrollTopBtn = document.getElementById('scrollTopBtn');

  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('show', window.scrollY > 350);
  });

  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  // ── 7. ANIMACIONES AL HACER SCROLL ──────────────────────────
  const revealItems = document.querySelectorAll(
    '.about-card, .step, .feature, .quien-card'
  );

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealItems.forEach(el => revealObserver.observe(el));


  // ── 8. CONTADORES ANIMADOS EN STATS BAR ──────────────────────
  function parseStatValue(text) {
    const cleaned = text.trim();
    const match   = cleaned.match(/^([+]?)([0-9.,]+)([%]?)$/);
    if (!match) return null;
    return {
      prefix:   match[1] || '',
      number:   parseFloat(match[2].replace('.', '').replace(',', '.')),
      suffix:   match[3] || '',
      original: cleaned
    };
  }

  function animateCounter(el, parsed) {
    const duration = 1800;
    const start    = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current  = Math.floor(eased * parsed.number);
      el.textContent = parsed.prefix + current.toLocaleString('es-CO') + parsed.suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = parsed.original;
    }

    requestAnimationFrame(step);
  }

  const statsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const parsed = parseStatValue(entry.target.textContent);
        if (parsed) animateCounter(entry.target, parsed);
        statsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.stat-num').forEach(el => statsObserver.observe(el));


  // ── 9. CONTADOR ANIMADO EN HERO (incrementa cada 5s) ─────────
  const userCounter = document.getElementById('userCounter');
  if (userCounter) {
    let count = 500;
    setInterval(() => {
      count += Math.floor(Math.random() * 3) + 1;
      userCounter.textContent = '+' + count;
    }, 5000);
  }


  // ── 10. MODALES ───────────────────────────────────────────────
  // Abrir modales
  const registerModal = document.getElementById('registerModal');
  const buyerModal    = document.getElementById('buyerModal');

  function openModal(modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Foco al primer input
    const firstInput = modal.querySelector('input, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Botones que abren el modal de emprendedor
  ['openRegisterBtn', 'openRegisterBtn2', 'openRegisterBtn3'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => openModal(registerModal));
  });

  // Botón que abre el modal de comprador
  const openBuyerBtn = document.getElementById('openBuyerBtn');
  if (openBuyerBtn) openBuyerBtn.addEventListener('click', () => openModal(buyerModal));

  // Botones de cierre (×)
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      closeModal(document.getElementById(modalId));
    });
  });

  // Cerrar haciendo clic en el overlay
  [registerModal, buyerModal].forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // Cerrar con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      [registerModal, buyerModal].forEach(closeModal);
    }
  });


  // ── 11. FORMULARIO: REGISTRAR TIENDA ─────────────────────────
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(registerForm));

      // Validación básica
      if (!data.tienda || !data.email || !data.telefono || !data.categoria) {
        showMessage('registerMessage', 'Por favor completa todos los campos.', 'error');
        return;
      }

      // Guardar (en producción iría al servidor)
      localStorage.setItem('cm_register', JSON.stringify({ ...data, fecha: new Date().toISOString() }));
      console.log('Registro emprendedor:', data);

      showMessage('registerMessage', '¡Registro exitoso! Nos pondremos en contacto pronto.', 'success');
      registerForm.reset();
      setTimeout(() => closeModal(registerModal), 2000);
    });
  }


  // ── 12. FORMULARIO: SOY COMPRADOR ────────────────────────────
  const buyerForm = document.getElementById('buyerForm');
  if (buyerForm) {
    buyerForm.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(buyerForm));

      if (!data.empresa || !data.email || !data.interes) {
        showMessage('buyerMessage', 'Por favor completa los campos requeridos.', 'error');
        return;
      }

      localStorage.setItem('cm_buyer', JSON.stringify({ ...data, fecha: new Date().toISOString() }));
      console.log('Registro comprador:', data);

      showMessage('buyerMessage', '¡Bienvenido! Te conectaremos con los mejores emprendedores.', 'success');
      buyerForm.reset();
      setTimeout(() => closeModal(buyerModal), 2000);
    });
  }


  // ── 13. FORMULARIO: NEWSLETTER ───────────────────────────────
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(newsletterForm));

      if (!data.email) {
        showMessage('newsletterMessage', 'Por favor ingresa tu correo.', 'error');
        return;
      }

      localStorage.setItem('cm_newsletter', JSON.stringify({ email: data.email, fecha: new Date().toISOString() }));
      console.log('Newsletter suscriptor:', data.email);

      showMessage('newsletterMessage', '✓ ¡Suscrito exitosamente!', 'success');
      newsletterForm.reset();
    });
  }


  // ── 14. FORMULARIO: CONTACTO ─────────────────────────────────
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(contactForm));

      if (!data.nombre || !data.email || !data.mensaje) {
        showMessage('contactMessage', 'Por favor completa todos los campos.', 'error');
        return;
      }

      localStorage.setItem('cm_contact', JSON.stringify({ ...data, fecha: new Date().toISOString() }));
      console.log('Mensaje de contacto:', data);

      showMessage('contactMessage', '✓ Mensaje enviado. Nos pondremos en contacto pronto.', 'success');
      contactForm.reset();
    });
  }


  // ── HELPER: mostrar mensajes de feedback ─────────────────────
  function showMessage(elementId, text, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent  = text;
    el.style.color  = type === 'success' ? '#10b981' : '#ef4444';
    // Limpiar después de 4 segundos
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.textContent = ''; }, 4000);
  }

});


  // ══════════════════════════════════════════════════════════════
  //  MÓDULO DE PAGOS — Widget Wompi
  //  Se activa cuando existe el elemento #wompi-checkout en el DOM
  // ══════════════════════════════════════════════════════════════

  const API_BASE = window.CM_API_URL || 'http://localhost:3000/api';

  // ── Iniciar checkout con Wompi ────────────────────────────────

  async function iniciarCheckoutWompi(ordenId) {
    const contenedor = document.getElementById('wompi-checkout');
    if (!contenedor) return;

    try {
      // 1. Obtener referencia y datos del servidor
      const token = localStorage.getItem('cm_token');
      const resp  = await fetch(`${API_BASE}/pagos/iniciar`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ordenId }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        mostrarErrorPago(err.mensaje || 'No se pudo iniciar el pago');
        return;
      }

      const { referencia, montoCentavos, wompiPublicKey } = await resp.json();

      // 2. Renderizar el widget de Wompi
      renderizarWidgetWompi({ contenedor, wompiPublicKey, referencia, montoCentavos, ordenId });

    } catch (err) {
      console.error('[Wompi] Error al iniciar checkout:', err);
      mostrarErrorPago('Error de conexión. Intenta de nuevo.');
    }
  }

  function renderizarWidgetWompi({ contenedor, wompiPublicKey, referencia, montoCentavos, ordenId }) {
    // Limpiar contenedor
    contenedor.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://checkout.wompi.co/widget.js';
    script.setAttribute('data-render',           'button');
    script.setAttribute('data-public-key',        wompiPublicKey);
    script.setAttribute('data-currency',          'COP');
    script.setAttribute('data-amount-in-cents',   String(montoCentavos));
    script.setAttribute('data-reference',         referencia);
    script.setAttribute('data-signature:integrity', ''); // Llenar con hash SHA256 en producción
    script.setAttribute('data-redirect-url',
      `${window.location.origin}/pago-resultado?orden=${ordenId}&ref=${referencia}`
    );

    contenedor.appendChild(script);

    // Escuchar resultado del widget via postMessage
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://checkout.wompi.co') return;
      const { type, data } = event.data || {};

      if (type === 'wompi:transaction') {
        manejarResultadoWompi({ wompiTransactionId: data?.id, referencia, ordenId });
      }
    }, { once: true });
  }

  // ── Confirmar pago después del widget ─────────────────────────

  async function manejarResultadoWompi({ wompiTransactionId, referencia, ordenId }) {
    const overlay = document.getElementById('pago-overlay');
    if (overlay) overlay.classList.add('visible');

    try {
      const token = localStorage.getItem('cm_token');
      const resp  = await fetch(`${API_BASE}/pagos/confirmar`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ wompiTransactionId, referencia }),
      });

      const resultado = await resp.json();

      if (resultado.ok) {
        mostrarExitoPago(resultado.orden);
      } else {
        mostrarErrorPago(resultado.detalle || resultado.mensaje || 'Pago no aprobado');
      }
    } catch (err) {
      console.error('[Wompi] Error al confirmar pago:', err);
      mostrarErrorPago('Error al confirmar el pago. Revisa tu correo o contacta soporte.');
    } finally {
      if (overlay) overlay.classList.remove('visible');
    }
  }

  // ── Manejar redirección desde Wompi (página de resultado) ─────

  function manejarRedireccionWompi() {
    const params = new URLSearchParams(window.location.search);
    const ordenId = params.get('orden');
    const ref     = params.get('ref');
    const txId    = params.get('id');           // Wompi agrega el id de la transacción en la URL

    if (!ordenId || !ref || !txId) return;

    // Confirmar automáticamente
    manejarResultadoWompi({
      wompiTransactionId: txId,
      referencia:         ref,
      ordenId,
    });
  }

  // ── Cargar bancos PSE ─────────────────────────────────────────

  async function cargarBancosPSE(selectElement) {
    if (!selectElement) return;
    try {
      const token = localStorage.getItem('cm_token');
      const resp  = await fetch(`${API_BASE}/pagos/bancos-pse`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const { bancos } = await resp.json();
      bancos.forEach(banco => {
        const opt   = document.createElement('option');
        opt.value   = banco.financial_institution_code;
        opt.textContent = banco.name;
        selectElement.appendChild(opt);
      });
    } catch (err) {
      console.error('[Wompi] Error cargando bancos PSE:', err);
    }
  }

  // ── Feedback visual ───────────────────────────────────────────

  function mostrarExitoPago(orden) {
    const el = document.getElementById('pago-resultado');
    if (!el) return;
    el.innerHTML = `
      <div class="pago-exito">
        <span class="pago-icono">✓</span>
        <h3>¡Pago exitoso!</h3>
        <p>Orden <strong>${orden?.id || ''}</strong> — Total: <strong>${orden?.total || ''}</strong></p>
        <p>Recibirás una confirmación en tu correo.</p>
        <a href="/mis-ordenes" class="btn-primario">Ver mis órdenes</a>
      </div>`;
    el.scrollIntoView({ behavior: 'smooth' });
  }

  function mostrarErrorPago(mensaje) {
    const el = document.getElementById('pago-resultado');
    if (el) {
      el.innerHTML = `
        <div class="pago-error">
          <span class="pago-icono">✗</span>
          <h3>Pago no completado</h3>
          <p>${mensaje}</p>
          <button class="btn-secundario" onclick="location.reload()">Intentar de nuevo</button>
        </div>`;
      el.scrollIntoView({ behavior: 'smooth' });
    }
    console.warn('[Wompi] Pago fallido:', mensaje);
  }

  // ── Exponer funciones globalmente para uso desde HTML ─────────
  window.ConnectModa = window.ConnectModa || {};
  Object.assign(window.ConnectModa, {
    iniciarCheckoutWompi,
    manejarRedireccionWompi,
    cargarBancosPSE,
  });

  // ── Activar si es la página de resultado de pago ──────────────
  if (window.location.pathname.includes('pago-resultado')) {
    manejarRedireccionWompi();
  }

