// ═══════════════════════════════════════════════════════
// THEME — Mode sombre/clair
// ═══════════════════════════════════════════════════════

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('nim_theme', next); } catch (_e) {}

  // Sync checkbox
  const checkbox = document.getElementById('checkbox');
  if (checkbox) {
    checkbox.checked = next === 'light';
  }
}

function initTheme() {
  const checkbox = document.getElementById('checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', toggleTheme);
  }

  let saved;
  try { saved = localStorage.getItem('nim_theme'); } catch (_e) {}
  let theme = 'light';
  if (saved === 'light' || saved === 'dark') {
    theme = saved;
  }
  document.documentElement.setAttribute('data-theme', theme);

  if (checkbox) {
    checkbox.checked = theme === 'light';
  }
}

// ═══════════════════════════════════════════════════════
// I18N — Traductions multilingue
// ═══════════════════════════════════════════════════════

const SUPPORTED_LANGS = ['fr', 'en', 'mg'];

function normalizeLanguage(lang) {
  if (typeof lang !== 'string') return 'fr';
  const value = lang.trim().toLowerCase();
  return SUPPORTED_LANGS.includes(value) ? value : 'fr';
}

function getStoredLanguage() {
  try {
    const saved = localStorage.getItem('nim_lang');
    if (saved) return normalizeLanguage(saved);
  } catch (_e) {}

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeLanguage(params.get('lang'));
    if (fromQuery !== 'fr') return fromQuery;
  } catch (_e) {}

  try {
    const pathLang = window.location.pathname.split('/').filter(Boolean)[0];
    if (SUPPORTED_LANGS.includes(pathLang)) return pathLang;
  } catch (_e) {}

  return 'fr';
}

function persistLanguage(lang) {
  const normalizedLang = normalizeLanguage(lang);
  currentLang = normalizedLang;
  try {
    localStorage.setItem('nim_lang', normalizedLang);
  } catch (_e) {}

  try {
    const url = new URL(window.location.href);
    if (normalizedLang === 'fr') {
      url.searchParams.delete('lang');
    } else {
      url.searchParams.set('lang', normalizedLang);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (_e) {}
}

let currentLang = getStoredLanguage();
let translations = {};

async function loadTranslations(lang) {
  const normalizedLang = normalizeLanguage(lang);

  try {
    const res = await fetch(`/locales/${normalizedLang}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Translation not found');
    translations = await res.json();
    persistLanguage(normalizedLang);
    applyTranslations();
    updateLangButtons();
    document.documentElement.lang = normalizedLang;
    document.documentElement.setAttribute('data-lang', normalizedLang);
  } catch (_e) {
    console.warn('Failed to load translations for', normalizedLang, '- falling back to fr');
    if (normalizedLang !== 'fr') {
      await loadTranslations('fr');
      return;
    }
    persistLanguage('fr');
  }
}

async function setLanguage(lang) {
  const normalizedLang = normalizeLanguage(lang);
  await loadTranslations(normalizedLang);
  await loadConfigData();
  if (typeof gtag !== 'undefined') {
    gtag('event', 'language_switch', { 'language': normalizedLang });
  }
}

function applyTranslations() {
  // Translate text content (data-i18n)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = getNestedTranslation(key);
    if (value) {
      el.textContent = value;
    }
  });

  // Translate HTML content (data-i18n-html)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const value = getNestedTranslation(key);
    if (value) {
      el.innerHTML = value;
    }
  });

  // Update blog toggle button text
  const btn = document.getElementById('blogToggleBtn');
  if (btn) {
    const expanded = btn.dataset.expanded === 'true';
    btn.textContent = expanded
      ? (getNestedTranslation('blog.showless') || 'Show less')
      : (getNestedTranslation('blog.showall') || 'See all articles');
  }
}

function getNestedTranslation(key) {
  return key.split('.').reduce((obj, i) => (obj && obj[i] !== undefined) ? obj[i] : null, translations);
}

function updateLangButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
}

// ═══════════════════════════════════════════════════════
// ACTIVE NAV LINK — highlight current section on scroll
// ═══════════════════════════════════════════════════════

const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
const sections = [];
navAnchors.forEach(a => {
  const id = a.getAttribute('href')?.replace('#', '');
  const el = document.getElementById(id);
  if (el) sections.push(el);
});
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navAnchors.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + id);
      });
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => navObserver.observe(s));

// ═══════════════════════════════════════════════════════
// MOBILE MENU
// ═══════════════════════════════════════════════════════

const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
const mobileMQ = window.matchMedia('(max-width: 768px)');
const navDropdownLinks = document.querySelectorAll('.nav-dropdown > a');

let lastFocusedEl = null;

navDropdownLinks.forEach(link => {
  link.setAttribute('aria-haspopup', 'true');
  link.setAttribute('aria-expanded', 'false');
});

function syncDropdownAria(dropdown, expanded) {
  const trigger = dropdown?.querySelector(':scope > a');
  if (trigger) trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function setMobileNavOpen(open) {
  document.body.classList.toggle('mobile-nav-open', open);
}

function closeMobileMenu() {
  if (!navLinks || !hamburger) return;
  navLinks.classList.add('closing');
  navLinks.classList.remove('active');
  hamburger.classList.remove('active');
  hamburger.setAttribute('aria-expanded', 'false');
  setMobileNavOpen(false);
  // Reset all open dropdowns
  document.querySelectorAll('.nav-dropdown.active').forEach(d => {
    d.classList.remove('active');
    syncDropdownAria(d, false);
  });
  setTimeout(() => {
    navLinks.classList.remove('closing');
  }, 300);
}

function closeOtherDropdowns(except) {
  document.querySelectorAll('.nav-dropdown.active').forEach(d => {
    if (d !== except) {
      d.classList.remove('active');
      syncDropdownAria(d, false);
    }
  });
}

if (hamburger) {
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpening = !hamburger.classList.contains('active');
    if (isOpening) {
      navLinks.classList.remove('closing');
      hamburger.classList.add('active');
      navLinks.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      setMobileNavOpen(true);
    } else {
      closeMobileMenu();
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      const parent = a.closest('.nav-dropdown');
      if (parent && a === parent.querySelector(':scope > a')) {
        // Dropdown parent link clicked - toggle submenu
        e.preventDefault();
        const willOpen = !parent.classList.contains('active');
        closeOtherDropdowns(parent);
        parent.classList.toggle('active', willOpen);
        syncDropdownAria(parent, willOpen);
        return;
      }
      if (navLinks.classList.contains('active')) {
        closeMobileMenu();
      }
    });
  });
  // Remove active on mouseleave (desktop hover cleanup)
  document.querySelectorAll('.nav-dropdown').forEach(dd => {
    dd.addEventListener('mouseleave', () => {
      dd.classList.remove('active');
      syncDropdownAria(dd, false);
    });
  });
  // Close on outside click — handles both mobile menu & desktop dropdowns
  document.addEventListener('click', (e) => {
    const isMobileMenu = navLinks.classList.contains('active');
    // Close mobile menu if click is outside
    if (isMobileMenu && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      closeMobileMenu();
    }
    // Close dropdowns if click is outside the dropdown
    const clickedDD = e.target.closest('.nav-dropdown');
    document.querySelectorAll('.nav-dropdown.active').forEach(d => {
      if (d !== clickedDD) {
        d.classList.remove('active');
        syncDropdownAria(d, false);
      }
    });
  });
  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (navLinks.classList.contains('active')) {
      closeMobileMenu();
    }
    document.querySelectorAll('.nav-dropdown.active').forEach(d => {
      d.classList.remove('active');
      syncDropdownAria(d, false);
    });
  });
  // Close on resize to desktop
  mobileMQ.addEventListener('change', (e) => {
    if (!e.matches) {
      navLinks.classList.remove('active', 'closing');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      setMobileNavOpen(false);
    }
  });
}

// ═══════════════════════════════════════════════════════
// NAV SCROLL SHADOW
// ═══════════════════════════════════════════════════════

const nav = document.querySelector('nav');
const navScrollProgress = document.getElementById('navScrollProgress');

function updateNavState() {
  const y = window.scrollY;
  if (nav) {
    nav.classList.toggle('scrolled', y > 50);
    nav.classList.toggle('nav-compact', y > 140);
  }
  if (navScrollProgress) {
    const doc = document.documentElement;
    const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
    const pct = Math.min((y / maxScroll) * 100, 100);
    navScrollProgress.style.width = `${pct}%`;
  }
  // Back to top button
  const btn = document.getElementById('backToTop');
  if (btn) btn.classList.toggle('visible', y > 400);
}

window.addEventListener('scroll', updateNavState, { passive: true });
window.addEventListener('resize', updateNavState);
updateNavState();

// Back to top
document.getElementById('backToTop')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ═══════════════════════════════════════════════════════
// LOADER — Navigation loader with logo animation
// ═══════════════════════════════════════════════════════

const loaderOverlay = document.getElementById('loader-overlay');

function showLoader(targetId) {
  loaderOverlay.classList.add('active');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navigationDelay = reduceMotion ? 0 : 250;
  setTimeout(() => {
    const target = document.getElementById(targetId);
    if (target) {
      const navHeight = document.querySelector('nav')?.offsetHeight || 70;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setTimeout(() => {
      loaderOverlay.classList.remove('active');
    }, 400);
  }, navigationDelay);
}

document.querySelectorAll('.nav-links a[href^="#"], .footer-links a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const targetId = href.replace('#', '');
    if (document.getElementById(targetId)) {
      const parent = link.closest('.nav-dropdown');
      if (parent && link === parent.querySelector(':scope > a')) {
        return; // Dropdown parent toggle — handled separately
      }
      e.preventDefault();
      hamburger?.classList.remove('active');
      navLinks?.classList.remove('active');
      setMobileNavOpen(false);
      showLoader(targetId);
    }
  });
});

// ═══════════════════════════════════════════════════════
// PRICING TABS
// ═══════════════════════════════════════════════════════

function switchTab(name) {
  const panel = document.getElementById('tab-' + name);
  if (!panel) return;

  document.querySelectorAll('.pricing-panel').forEach(p => {
    p.classList.remove('active');
    p.hidden = true;
  });
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  
  panel.classList.add('active');
  panel.hidden = false;
  
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === name) {
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
    }
  });
}

// ═══════════════════════════════════════════════════════
// CONTACT FORM AUTO-FILL
// ═══════════════════════════════════════════════════════

function fillContactForm(button) {
  const card = button.closest('.price-card');
  if (!card) return;
  const service = card.getAttribute('data-service');
  const tier = card.getAttribute('data-tier-name');
  const type = card.getAttribute('data-type');
  const price = card.getAttribute('data-price');
  const budgetRange = card.getAttribute('data-budget');

  const serviceSelect = document.getElementById('serviceType');
  const projectInput = document.getElementById('projectType');
  const budgetInput = document.getElementById('budget');
  const budgetCurrency = document.getElementById('budgetCurrency');
  const messageTextarea = document.getElementById('message');

  if (serviceSelect && service) serviceSelect.value = service;
  if (projectInput) projectInput.value = `${type} - ${tier}`;

  const budgetVal = parseInt(budgetRange, 10);
  if (budgetVal > 0 && budgetInput && budgetCurrency) {
    budgetInput.value = budgetVal;
    budgetCurrency.value = 'Ar';
    budgetCurrency.dataset.lastCurrency = 'Ar';
  }

  const priceLocale = currentLang === 'en' ? 'en-US' : currentLang === 'mg' ? 'mg-MG' : 'fr-FR';
  const fallbackTxt = getNestedTranslation('contact.quoteFallback') || 'Sur devis';
  const unitTxt = getNestedTranslation('contact.quoteUnit') || 'Ar/m²';
  const priceDisplay = price ? Number(price).toLocaleString(priceLocale) + ' ' + unitTxt : fallbackTxt;

  if (messageTextarea) {
    const intro = getNestedTranslation('contact.quoteIntro') || 'Je suis intéressé par :';
    const tierLabel = getNestedTranslation('contact.quoteTier') || 'Formule :';
    const refLabel = getNestedTranslation('contact.quoteRefPrice') || 'Tarif référence :';
    const outro = getNestedTranslation('contact.quoteOutro') || 'Merci de me contacter pour un devis détaillé.';
    messageTextarea.value = `${intro} ${type}\n${tierLabel} ${tier}\n${refLabel} ${priceDisplay}\n\n${outro}`;
  }

  const contactSection = document.getElementById('contact');
  if (contactSection) {
    contactSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// ═══════════════════════════════════════════════════════
// CONTACT FORM SUBMIT
// ═══════════════════════════════════════════════════════

function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const messageDiv = document.getElementById('formMessage');
  const form = document.getElementById('contactForm');

  btn.textContent = getNestedTranslation('contact.sending') || '⏳ Envoi en cours...';
  btn.disabled = true;
  messageDiv.style.display = 'none';

  const budgetAmount = document.getElementById('budget').value;
  const budgetCurrency = document.getElementById('budgetCurrency').value;
  const formData = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value || '',
    serviceType: document.getElementById('serviceType').value,
    projectType: document.getElementById('projectType').value,
    budget: budgetAmount ? `${Number(budgetAmount).toLocaleString('fr-FR')} ${budgetCurrency}` : '',
    message: document.getElementById('message').value
  };

  const API_BASE = window.location.origin;

  fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  })
  .then(response => response.json())
  .then(_result => {
    btn.textContent = getNestedTranslation('contact.sent') || 'Message envoyé';
    btn.style.background = '#2a7a4a';
    messageDiv.textContent = getNestedTranslation('contact.sentMessage') || 'Votre demande a été reçue.';
    messageDiv.style.display = 'block';
    messageDiv.style.color = '#2a7a4a';
    form.reset();

    if (typeof gtag !== 'undefined') {
      gtag('event', 'form_submission', {
        'service_type': formData.serviceType,
        'project_type': formData.projectType
      });
    }

    setTimeout(() => {
      btn.textContent = getNestedTranslation('contact.formSubmit') || 'Envoyer ma Demande';
      btn.style.background = '';
      btn.disabled = false;
      messageDiv.style.display = 'none';
    }, 5000);
  })
  .catch(error => {
    console.error('Error:', error);
    messageDiv.textContent = getNestedTranslation('contact.errorMessage') || 'Erreur lors de l\'envoi.';
    messageDiv.style.display = 'block';
    messageDiv.style.color = '#E8614A';
    btn.textContent = getNestedTranslation('contact.formSubmit') || 'Envoyer ma Demande';
    btn.disabled = false;
  });
}

// ═══════════════════════════════════════════════════════
// PRICING CALCULATOR
// ═══════════════════════════════════════════════════════

async function calculatePricing(serviceType, squareMeters, finishingLevel, location) {
  const API_BASE = window.location.origin;
  try {
    const response = await fetch(`${API_BASE}/api/calculate-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType, squareMeters, finishingLevel, location })
    });
    return await response.json();
  } catch (error) {
    console.error('Pricing calculation error:', error);
    return null;
  }
}

function updateCalcFields() {
  const service = document.getElementById('calc-service').value;
  const labelSurface = document.getElementById('label-surface');
  const inputSurface = document.getElementById('calc-surface');

  if (service === 'forage') {
    labelSurface.textContent = getNestedTranslation('calculator.depthLabel');
    inputSurface.value = 40;
  } else {
    labelSurface.textContent = getNestedTranslation('calculator.surfaceLabel');
    inputSurface.value = 100;
  }
}

async function runCalculation() {
  const serviceType = document.getElementById('calc-service').value;
  const squareMeters = parseFloat(document.getElementById('calc-surface').value);
  const finishingLevel = document.getElementById('calc-tier').value;
  const location = document.getElementById('calc-location').value;
  const resultPanel = document.getElementById('calc-result-panel');

  if (isNaN(squareMeters) || squareMeters <= 0) {
    alert(getNestedTranslation('calculator.alertInvalidSurface'));
    return;
  }

  const loadingText = getNestedTranslation('calculator.loading') || 'Calcul de votre estimation en cours...';
  resultPanel.innerHTML = `
    <div class="result-placeholder">
      <div class="loading-spinner"></div>
      <p class="calc-placeholder-text">${loadingText}</p>
    </div>
  `;

  const data = await calculatePricing(serviceType, squareMeters, finishingLevel, location);

  if (!data || data.error) {
    const errText = getNestedTranslation('calculator.error') || 'Erreur lors du calcul. Veuillez réessayer.';
    resultPanel.innerHTML = `
      <div class="result-placeholder">
        <p style="color: var(--rust-light);">${errText}</p>
      </div>
    `;
    return;
  }

  const priceLocale = currentLang === 'en' ? 'en-US' : 'fr-MG';
  const fmt = (val) => new Intl.NumberFormat(priceLocale).format(val);
  const formatAr = (val) => fmt(val) + ' Ar';
  const foreignTotal = data.grandTotalEUR && data.grandTotalUSD
    ? `<div class="calc-foreign">
        <div class="calc-foreign-item">
          <span class="calc-foreign-symbol">€</span>
          <span class="calc-foreign-val">${fmt(data.grandTotalEUR)}</span>
        </div>
        <div class="calc-foreign-item">
          <span class="calc-foreign-symbol">$</span>
          <span class="calc-foreign-val">${fmt(data.grandTotalUSD)}</span>
        </div>
      </div>`
    : '';

  const rTitle = getNestedTranslation('calculator.resultTitle') || 'Estimation Prévisionnelle';
  const rUnit = getNestedTranslation('calculator.resultUnit') || 'Toutes Taxes Comprises (TTC)';
  const dBase = getNestedTranslation('calculator.detailBase') || 'Base';
  const dSub = getNestedTranslation('calculator.detailSubtotal') || 'Sous-total HT';
  const contRate = data.subtotal > 0 ? Math.round((data.contingency / data.subtotal) * 100) : 10;
  const taxRate = data.estimatedTotal > 0 ? Math.round((data.tax / data.estimatedTotal) * 100) : 20;
  const dCont = (getNestedTranslation('calculator.detailContingency') || 'Marge de sécurité').replace(/\(\d+%\)/, '') + `(${contRate}%)`;
  const dTax = (getNestedTranslation('calculator.detailTax') || 'TVA').replace(/\(\d+%\)/, '') + `(${taxRate}%)`;
  const dTotal = getNestedTranslation('calculator.detailTotal') || 'Total estimé';
  const rNote = getNestedTranslation('calculator.resultNote') || '* Cette estimation est fournie à titre indicatif.';
  const rCTA = getNestedTranslation('calculator.resultCTA') || 'Demander un devis officiel';

  resultPanel.innerHTML = `
    <div class="result-header">
      <div class="result-title">${rTitle}</div>
      <div class="result-main">${formatAr(data.grandTotal)}</div>
      ${foreignTotal}
      <div class="result-unit">${rUnit}</div>
    </div>
    <div class="result-details">
      <div class="detail-item">
        <span>${dBase} (${getNestedTranslation(`pricing.tiers.${data.serviceType}.${data.finishingLevel}`) || data.finishingLevel})</span>
        <span>${formatAr(data.basePrice)} / ${data.serviceType === 'forage' ? 'ml' : 'm²'}</span>
      </div>
      <div class="detail-item">
        <span>${dSub}</span>
        <span>${formatAr(data.subtotal)}</span>
      </div>
      <div class="detail-item">
        <span>${dCont}</span>
        <span>${formatAr(data.contingency)}</span>
      </div>
      <div class="detail-item">
        <span>${dTax}</span>
        <span>${formatAr(data.tax)}</span>
      </div>
      <div class="detail-item total">
        <span>${dTotal}</span>
        <span>${formatAr(data.grandTotal)}</span>
      </div>
    </div>
    <p class="result-note">${rNote}</p>
    <a href="#contact" class="price-cta" data-i18n="calculator.resultCTA" style="margin-top:32px;" onclick="event.preventDefault();transferToForm('${serviceType}', '${finishingLevel}', ${squareMeters}, '${location}', ${data.grandTotal})">${rCTA}</a>
  `;
}

function transferToForm(service, tier, surface, location, total) {
  const serviceSelect = document.getElementById('serviceType');
  const projectInput = document.getElementById('projectType');
  const budgetInput = document.getElementById('budget');
  const budgetCurrency = document.getElementById('budgetCurrency');
  const messageTextarea = document.getElementById('message');

  const serviceDisplay = {
    construction: getNestedTranslation('pricing.tab1') || 'Construction Neuve',
    rehabilitation: getNestedTranslation('pricing.tab2') || 'Études et Conception',
    forage: getNestedTranslation('pricing.tab3') || 'Forage d\'Eau'
  }[service] || service;
  const tierDisplay = getNestedTranslation(`pricing.tiers.${service}.${tier}`) || tier;

  if (serviceSelect) serviceSelect.value = service;
  if (projectInput) projectInput.value = `${serviceDisplay} - ${tierDisplay} (${surface} ${service === 'forage' ? 'ml' : 'm²'})`;

  if (total > 0 && budgetInput && budgetCurrency) {
    budgetInput.value = total;
    budgetCurrency.value = 'Ar';
    budgetCurrency.dataset.lastCurrency = 'Ar';
  }

  const tLocale = currentLang === 'en' ? 'en-US' : 'fr-MG';
  const locationSelect = document.getElementById('calc-location');
  const locationDisplay = locationSelect ? locationSelect.options[locationSelect.selectedIndex]?.text : location;

  if (messageTextarea) {
    const simuIntro = getNestedTranslation('contact.simuIntro') || 'Bonjour, j\'ai effectué une simulation sur votre site :';
    messageTextarea.value = `${simuIntro}\n- Service : ${serviceDisplay}\n- Gamme : ${tierDisplay}\n- Surface : ${surface} ${service === 'forage' ? 'ml' : 'm²'}\n- Lieu : ${locationDisplay}\n- Estimation : ${new Intl.NumberFormat(tLocale).format(total)} Ar TTC\n\n${getNestedTranslation('contact.quoteOutro') || 'Merci de me contacter pour un devis détaillé.'}`;
  }

  const contactSection = document.getElementById('contact');
  if (contactSection) {
    contactSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// ═══════════════════════════════════════════════════════
// GALLERY / LIGHTBOX
// ═══════════════════════════════════════════════════════

let galleryImages = [];

function rebuildGallery() {
  const grid = document.getElementById('projectsGrid');
  if (!grid || !grid.querySelector('.project-card')) return;
  galleryImages = Array.from(grid.querySelectorAll('.project-card img')).map(img => ({
    src: img.src,
    alt: img.alt
  }));
}

let galleryIndex = 0;

function openGallery(index) {
  lastFocusedEl = document.activeElement;
  rebuildGallery();
  galleryIndex = index;
  const modal = document.getElementById('galleryModal');
  const img = document.getElementById('galleryImg');
  const caption = document.getElementById('galleryCaption');
  const counter = document.getElementById('galleryCounter');
  if (!modal || !img || !caption) return;
  
  img.src = galleryImages[index].src;
  img.alt = galleryImages[index].alt;
  caption.textContent = galleryImages[index].alt;
  if (counter) counter.textContent = `${index + 1} / ${galleryImages.length}`;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.gallery-close')?.focus({ preventScroll: true });
}

function closeGallery(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('galleryModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
  if (lastFocusedEl) { lastFocusedEl.focus(); lastFocusedEl = null; }
}

function changeGallery(dir) {
  galleryIndex = (galleryIndex + dir + galleryImages.length) % galleryImages.length;
  const img = document.getElementById('galleryImg');
  const caption = document.getElementById('galleryCaption');
  const counter = document.getElementById('galleryCounter');
  if (!img || !caption) return;
  
  img.style.opacity = '0';
  setTimeout(() => {
    img.src = galleryImages[galleryIndex].src;
    img.alt = galleryImages[galleryIndex].alt;
    caption.textContent = galleryImages[galleryIndex].alt;
    if (counter) counter.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
    img.style.opacity = '1';
  }, 150);
}

// Touch/swipe support for gallery
(function initGalleryTouch() {
  const galleryContent = document.getElementById('galleryImg');
  if (!galleryContent) return;
  let touchStartX = 0;
  let touchStartY = 0;
  galleryContent.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  galleryContent.addEventListener('touchend', (e) => {
    const deltaX = e.changedTouches[0].screenX - touchStartX;
    const deltaY = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      changeGallery(deltaX < 0 ? 1 : -1);
    }
  }, { passive: true });
})();

// Keyboard support for gallery
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('galleryModal');
  if (!modal || !modal.classList.contains('active')) return;
  if (e.key === 'Escape') closeGallery();
  if (e.key === 'ArrowLeft') changeGallery(-1);
  if (e.key === 'ArrowRight') changeGallery(1);
});

// ═══════════════════════════════════════════════════════
// ANALYTICS TRACKING
// ═══════════════════════════════════════════════════════

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pricing_tab_view', { 'tab_name': this.textContent });
    }
  });
});

document.querySelectorAll('.btn-primary, .nav-cta').forEach(btn => {
  btn.addEventListener('click', function() {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'cta_click', { 'button_text': this.textContent });
    }
  });
});

// ═══════════════════════════════════════════════════════
// ANIMATED COUNTERS with progress bar
// ═══════════════════════════════════════════════════════

function animateCounters() {
  const progressBar = document.getElementById('counterProgressBar');
  const countItems = document.querySelectorAll('#numbers .num-val');

  countItems.forEach(el => {
    const text = el.textContent.trim();
    const suffix = text.includes('+') ? '+' : '';
    const target = parseInt(text.replace('+', '').replace(/\s/g, ''), 10);
    if (isNaN(target)) return;
    const duration = 1800;
    const start = performance.now();
    el.innerHTML = `<span class="num-count">0</span>${suffix}`;
    const countEl = el.querySelector('.num-count');
    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      countEl.textContent = current;
      if (progressBar) {
        progressBar.style.width = `${eased * 100}%`;
      }
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCounters();
      counterObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.3 });

const numbersSection = document.getElementById('numbers');
if (numbersSection) counterObserver.observe(numbersSection);

// ═══════════════════════════════════════════════════════
// NEWSLETTER
// ═══════════════════════════════════════════════════════

async function handleNewsletter(e) {
  e.preventDefault();
  const email = document.getElementById('newsletterEmail').value;
  const consent = document.getElementById('newsletterConsent');
  const msg = document.getElementById('newsletterMsg');
  const btn = document.getElementById('newsletterBtn');
  if (!email) return;
  if (consent && !consent.checked) {
    msg.textContent = getNestedTranslation('newsletter.consentRequired');
    msg.className = 'newsletter-msg error show';
    return;
  }
  btn.classList.add('sending');
  btn.disabled = true;
  msg.className = 'newsletter-msg';
  const API_BASE = window.location.origin;
  try {
    const res = await fetch(`${API_BASE}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, consent: true })
    });
    const data = await res.json();
    btn.classList.remove('sending');
    btn.disabled = false;
    if (data.success) {
      msg.textContent = getNestedTranslation('newsletter.success') || 'Merci pour votre inscription !';
      msg.className = 'newsletter-msg success show';
      document.getElementById('newsletterForm').reset();
    } else {
      msg.textContent = data.error || getNestedTranslation('newsletter.error') || 'Erreur';
      msg.className = 'newsletter-msg error show';
    }
  } catch {
    btn.classList.remove('sending');
    btn.disabled = false;
    msg.textContent = getNestedTranslation('newsletter.errorGeneric') || 'Erreur de connexion. Réessayez.';
    msg.className = 'newsletter-msg error show';
  }
}

// ═══════════════════════════════════════════════════════
// HERO MOUSE PARALLAX
// ═══════════════════════════════════════════════════════

(function initHeroParallax() {
  const heroRight = document.querySelector('.hero-right[data-parallax]');
  if (!heroRight) return;
  const heroBadge = heroRight.querySelector('.hero-badge');
  const shapes = heroRight.querySelectorAll('.shape');

  const getActiveImage = () => heroRight.querySelector('.hero-slide.is-active');
  const resetParallax = () => {
    const heroImg = getActiveImage();
    if (heroImg) heroImg.style.transform = '';
    if (heroBadge) heroBadge.style.transform = '';
    shapes.forEach(shape => shape.style.transform = '');
  };

  heroRight.addEventListener('mousemove', (e) => {
    const rect = heroRight.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const heroImg = getActiveImage();

    if (heroImg) {
      heroImg.style.transform = `scale(1.08) translate(${x * -35}px, ${y * -35}px)`;
    }
    if (heroBadge) {
      heroBadge.style.transform = `translate(${x * 25}px, ${y * 25}px)`;
    }
    shapes.forEach((shape, i) => {
      const depth = (i + 1) * 18;
      shape.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  });

  heroRight.addEventListener('mouseleave', () => {
    resetParallax();
  });

  heroRight.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = heroRight.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width - 0.5;
    const y = (touch.clientY - rect.top) / rect.height - 0.5;
    const heroImg = getActiveImage();
    if (heroImg) {
      heroImg.style.transform = `scale(1.05) translate(${x * -20}px, ${y * -20}px)`;
    }
    if (heroBadge) {
      heroBadge.style.transform = `translate(${x * 15}px, ${y * 15}px)`;
    }
    shapes.forEach((shape, i) => {
      const depth = (i + 1) * 10;
      shape.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  }, { passive: true });

  heroRight.addEventListener('touchend', () => {
    resetParallax();
  });
})();

// ═══════════════════════════════════════════════════════
// SCROLL REVEAL (IntersectionObserver)
// ═══════════════════════════════════════════════════════

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-stagger').forEach(el => observer.observe(el));

// ═══════════════════════════════════════════════════════
// IMAGE REVEAL ON SCROLL
// ═══════════════════════════════════════════════════════

const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('img-visible');
      imgObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

function initImageReveal() {
  document.querySelectorAll('.img-reveal:not(.img-visible)').forEach(el => imgObserver.observe(el));
}

// ═══════════════════════════════════════════════════════
// IMAGE SLOT SWAP — Replace SVG placeholders with uploaded images
// ═══════════════════════════════════════════════════════

async function loadImageSlots() {
  try {
    const res = await fetch('/api/images/slots', { cache: 'no-store' });
    if (!res.ok) return;
    const slots = await res.json();
    if (!Array.isArray(slots)) return;
    slots.forEach(slot => {
      if (!slot.uploadedFile && !slot.cloudinaryUrl) return;
      if (!slot.currentUrl || slot.currentUrl.endsWith('placeholder.svg')) return;
      const el = document.querySelector(`[data-image-slot="${slot.id}"]`);
      if (!el) return;
      if (el.tagName === 'IMG') {
        el.src = slot.currentUrl;
        el.dataset.originalSrc = slot.originalFile ? `/images/${slot.section}/${slot.originalFile}` : '';
      } else {
        el.style.backgroundImage = `url('${slot.currentUrl}')`;
        el.dataset.originalSrc = slot.originalFile ? `/images/${slot.section}/${slot.originalFile}` : '';
      }
    });
    initHeroSwap();
    rebuildGallery();
  } catch (_err) {
    // Silent fail — SVGs remain as fallbacks
  }
}

// ═══════════════════════════════════════════════════════
// HERO IMAGE SWAP — swap left bg and right img every 5s
// ═══════════════════════════════════════════════════════

let heroSwapTimer = null;

function initHeroSwap() {
  const hero = document.getElementById('hero');
  const heroRight = hero?.querySelector('.hero-right');
  const slides = heroRight ? Array.from(heroRight.querySelectorAll('.hero-slide')) : [];
  const nav = heroRight?.querySelector('.hero-slider-nav');
  if (!heroRight || !nav || slides.length < 2) return;

  if (heroSwapTimer) clearInterval(heroSwapTimer);
  let activeIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  nav.innerHTML = '';
  const controls = slides.map((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-slider-dot';
    button.setAttribute('aria-label', `Afficher l’image ${index + 1}`);
    nav.appendChild(button);
    return button;
  });

  function showSlide(nextIndex) {
    activeIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', String(!isActive));
      controls[index].classList.toggle('is-active', isActive);
      controls[index].setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  }

  function stopSlideshow() {
    if (heroSwapTimer) clearInterval(heroSwapTimer);
    heroSwapTimer = null;
  }

  function startSlideshow() {
    stopSlideshow();
    if (reduceMotion || document.hidden) return;
    heroSwapTimer = setInterval(() => showSlide(activeIndex + 1), 6000);
  }

  controls.forEach((button, index) => {
    button.addEventListener('click', () => {
      showSlide(index);
      startSlideshow();
    });
  });

  heroRight.onmouseenter = stopSlideshow;
  heroRight.onmouseleave = startSlideshow;
  heroRight.onfocusin = stopSlideshow;
  heroRight.onfocusout = startSlideshow;

  showSlide(activeIndex);
  startSlideshow();
}

// ═══════════════════════════════════════════════════════
// DYNAMIC CONTENT LOADER — Fetch from API and render
// ═══════════════════════════════════════════════════════

const API_BASE = window.location.origin;

async function fetchJsonArray(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_err) {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Expected an array response');
  }
  return data;
}

async function loadTeam() {
  try {
    const team = await fetchJsonArray(`${API_BASE}/api/team`);
    const grid = document.getElementById('teamGrid');
    if (!grid) return;
    const categories = [
      { id: 'office', label: 'Équipe de bureau', intro: 'Études, conception et coordination de vos projets.' },
      { id: 'field', label: 'Équipe sur le terrain', intro: 'Des professionnels engagés au plus près de chaque chantier.' }
    ];
    const memberCard = (m) => {
      const hasOwnImg = m.image && (m.image.startsWith('http') || m.image.startsWith('/'));
      const slot = m.image_slot || m.imageSlot || '';
      return `<article class="team-card team-card--photo">
        <div class="team-avatar-wrap"><img src="${hasOwnImg ? m.image : '/images/placeholder.svg'}" alt="Photo de l'équipe Nord Invest Madagascar" class="team-avatar" loading="lazy"${!hasOwnImg ? ` data-image-slot="${escapeHtml(slot)}"` : ''}></div>
      </article>`;
    };
    const teamCarouselGroup = (members, category) => {
      if (!members.length) return '';
      const repeatedCards = [...members, ...members].map(memberCard).join('');
      return `<div class="team-group">
        <div class="team-group-heading"><span class="team-group-kicker">${category.id === 'office' ? '01' : '02'}</span><div><h3>${category.label}</h3><p>${category.intro}</p></div></div>
        <div class="team-showcase" aria-label="${category.label}">
          <div class="team-track">${repeatedCards}</div>
        </div>
      </div>`;
    };
    grid.innerHTML = categories.map(category => teamCarouselGroup(team.filter(m => (m.group_type || m.groupType || 'office') === category.id), category)).join('') || '<p class="team-empty">Notre équipe sera bientôt présentée ici.</p>';
    loadImageSlots();
    applyGlobalMotionOrder(grid);
    initTeamReveal();
    initTeamTilt();
  } catch (err) { console.warn('Team load error:', err); showSectionError('teamGrid', getNestedTranslation('dossiers.error') || 'Unable to load.'); }
}

function initTeamReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('spotlight-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.team-card').forEach(el => observer.observe(el));
}

function initTeamTilt() {
  document.querySelectorAll('.team-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      if (!card.classList.contains('spotlight-visible')) return;
      card.style.transition = 'transform 0.1s ease-out';
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotateX = ((y - rect.height / 2) / rect.height * 2) * -6;
      const rotateY = ((x - rect.width / 2) / rect.width * 2) * 6;
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      card.classList.add('tilt-active');
    });
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.5s ease, background 0.3s, border-color 0.3s';
      card.style.transform = '';
      card.classList.remove('tilt-active');
    });
  });
}

function initTeamLightbox() {
  const lightbox = document.getElementById('teamLightbox');
  if (!lightbox) return;
  const media = lightbox.querySelector('.team-lightbox-media');
  const img = lightbox.querySelector('.team-lightbox-media img');
  let lastFocus = null;

  function open(src) {
    if (!src) return;
    lastFocus = document.activeElement;
    img.src = src;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lightbox.classList.remove('is-open');
    img.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.team-card--photo');
    if (!card) return;
    const avatar = card.querySelector('.team-avatar');
    if (avatar && avatar.currentSrc) open(avatar.currentSrc);
  });

  lightbox.querySelector('.team-lightbox-close').addEventListener('click', close);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || !media.contains(e.target)) close();
  });
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('is-open')) close();
  });
}

async function loadServices() {
  try {
    const services = await fetchJsonArray(`${API_BASE}/api/services`);
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    const serviceCards = [...services, ...services].map((s, i) => {
      const hasOwnImg = s.image && (s.image.startsWith('http') || s.image.startsWith('/'));
      const slot = s.image_slot || s.imageSlot || '';
      const index = i % services.length;
      const service = { ...s, title: s.title || 'Service', description: s.description || '' };
      return `<article class="service-card">
        <div class="service-media">
          <img src="${hasOwnImg ? service.image : '/images/placeholder.svg'}" alt="${escapeHtml(service.title)}" loading="lazy"${!hasOwnImg ? ` data-image-slot="${escapeHtml(slot)}"` : ''}>
          <span class="service-media-shade"></span>
        </div>
        <div class="service-content">
        <div class="service-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="service-title" data-i18n="services.card${index + 1}Title">${escapeHtml(service.title)}</div>
        <p class="service-desc" data-i18n="services.card${index + 1}Desc">${escapeHtml(service.description)}</p>
        </div>
      </article>`;
    }).join('');
    grid.innerHTML = `<div class="services-showcase"><div class="services-track">${serviceCards}</div></div>`;
    loadImageSlots();
    applyGlobalMotionOrder(grid);
    initImageReveal();
  } catch (err) { console.warn('Services load error:', err); showSectionError('servicesGrid', getNestedTranslation('dossiers.error') || 'Unable to load.'); }
}

async function loadProjects() {
  try {
    const projects = await fetchJsonArray(`${API_BASE}/api/projects`, { cache: 'no-store' });
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;
    grid.innerHTML = projects.map((p, i) => {
      const hasOwnImg = p.image && (p.image.startsWith('http') || p.image.startsWith('/'));
      const projectTitle = escapeHtml(p.title);
      return `
      <div class="project-card" role="button" tabindex="0" aria-label="Voir le projet ${projectTitle}" style="--project-delay: ${i * 80}ms">
        <img src="${hasOwnImg ? p.image : '/images/placeholder.svg'}" alt="${projectTitle}" class="project-img img-reveal" loading="lazy"${!hasOwnImg ? ` data-image-slot="${p.image_slot || ''}"` : ''}>
        <div class="project-overlay">
          <div class="project-cat">${escapeHtml(p.category || '')}</div>
          <div class="project-name">${projectTitle}</div>
          <div class="project-loc">${escapeHtml(p.location || '')}</div>
        </div>
      </div>
    `;}).join('');
    initProjectCardMotion();
    applyGlobalMotionOrder(grid);
    loadImageSlots();
    initImageReveal();
  } catch (err) { console.warn('Projects load error:', err); showSectionError('projectsGrid', getNestedTranslation('dossiers.error') || 'Unable to load.'); }
}

async function loadProducts() {
  try {
    const products = await fetchJsonArray(`${API_BASE}/api/products`, { cache: 'no-store' });
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = products.map((p, i) => {
      const media = p.mediaUrl || p.image || '/images/placeholder.svg';
      const isVideo = p.mediaType === 'video';
      const mediaTag = isVideo
        ? `<video class="product-media" muted playsinline loop controls preload="metadata"><source src="${media}" type="video/mp4"></video>`
        : `<img src="${media}" alt="${escapeHtml(p.name || 'Produit')}" class="product-media img-reveal" loading="lazy">`;
      const priceValue = Number(p.price || 0);
      const price = priceValue.toLocaleString('fr-FR');
      const priceEur = Math.round(priceValue / (exchangeRates.EUR || 5000)).toLocaleString('fr-FR');
      const priceUsd = Math.round(priceValue / (exchangeRates.USD || 4600)).toLocaleString('fr-FR');
      return `
        <article class="product-card" data-product-media="${escapeHtml(media)}" data-product-media-type="${isVideo ? 'video' : 'image'}" data-product-name="${escapeHtml(p.name || 'Produit')}" style="--project-delay: ${i * 80}ms">
          <div class="product-media-wrap" role="button" tabindex="0" aria-label="Agrandir ${escapeHtml(p.name || 'Produit')}">
            ${mediaTag}
            <div class="product-price" aria-label="Prix : ${price} Ariary, ${priceEur} euros, ${priceUsd} dollars">
              <span class="product-price-line product-price-main"><b>Ar</b> ${price}</span>
              <span class="product-price-line"><b>€</b> ${priceEur}</span>
              <span class="product-price-line"><b>$</b> ${priceUsd}</span>
            </div>
          </div>
          <div class="product-content">
            <h3>${escapeHtml(p.name || 'Produit')}</h3>
            <p>${escapeHtml(p.description || '')}</p>
          </div>
        </article>
      `;
    }).join('') || '<p class="empty-state-inline">Aucun produit disponible pour le moment.</p>';
    grid.querySelectorAll('.product-media-wrap').forEach(mediaWrap => {
      const open = () => {
        const card = mediaWrap.closest('.product-card');
        if (card) openProductLightbox(card.dataset.productMedia, card.dataset.productMediaType, card.dataset.productName);
      };
      mediaWrap.addEventListener('click', event => {
        if (event.target.closest('video') && event.target.closest('video').controls) return;
        open();
      });
      mediaWrap.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
    });
    initProductsCarousel();
    initImageReveal();
  } catch (err) {
    console.warn('Products load error:', err);
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<p class="empty-state-inline">Impossible de charger les produits.</p>';
  }
}

function initProductsCarousel() {
  const grid = document.getElementById('productsGrid');
  const carousel = grid?.closest('.products-carousel');
  const previousButton = carousel?.querySelector('.products-carousel-prev');
  const nextButton = carousel?.querySelector('.products-carousel-next');
  if (!grid || !carousel || !previousButton || !nextButton) return;

  const cards = [...grid.querySelectorAll('.product-card')];
  if (cards.length < 2) {
    carousel.classList.add('is-static');
    return;
  }

  const getScrollAmount = () => {
    const card = cards[0];
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  };

  previousButton.addEventListener('click', () => {
    grid.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
  });
  nextButton.addEventListener('click', () => {
    grid.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
  });

  const updateButtons = () => {
    const maxScroll = grid.scrollWidth - grid.clientWidth - 1;
    previousButton.disabled = grid.scrollLeft <= 1;
    nextButton.disabled = grid.scrollLeft >= maxScroll;
  };

  grid.addEventListener('scroll', updateButtons, { passive: true });
  window.addEventListener('resize', updateButtons);
  updateButtons();
}

function openProductLightbox(src, mediaType, name) {
  const modal = document.getElementById('productLightbox');
  const media = document.getElementById('productLightboxMedia');
  if (!modal || !media || !src) return;
  media.innerHTML = mediaType === 'video'
    ? `<video src="${escapeHtml(src)}" controls autoplay playsinline></video>`
    : `<img src="${escapeHtml(src)}" alt="${escapeHtml(name || 'Produit')}" />`;
  modal.querySelector('.product-lightbox-title').textContent = name || 'Produit';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.product-lightbox-close')?.focus({ preventScroll: true });
}

function closeProductLightbox(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('productLightbox');
  const media = document.getElementById('productLightboxMedia');
  if (media) media.innerHTML = '';
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

function initProjectCardMotion() {
  const cards = document.querySelectorAll('.project-card');
  if (!cards.length) return;

  const canUseFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  cards.forEach((card, index) => {
    card.addEventListener('click', () => openGallery(index));
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openGallery(index);
    });

    if (!canUseFinePointer || reduceMotion) return;

    let raf = 0;
    const resetMotion = () => {
      card.style.setProperty('--pointer-x', '50%');
      card.style.setProperty('--pointer-y', '50%');
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    };

    card.addEventListener('pointermove', (e) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const clampedX = Math.max(0, Math.min(1, x));
        const clampedY = Math.max(0, Math.min(1, y));

        card.style.setProperty('--pointer-x', `${(clampedX * 100).toFixed(1)}%`);
        card.style.setProperty('--pointer-y', `${(clampedY * 100).toFixed(1)}%`);
        card.style.setProperty('--tilt-x', `${((0.5 - clampedY) * 5).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${((clampedX - 0.5) * 6).toFixed(2)}deg`);
      });
    }, { passive: true });

    card.addEventListener('pointerleave', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      resetMotion();
    });
  });
}

let BLOG_CATEGORIES = {};
let blogSvgs = {};

async function loadBlogCategories() {
  try {
    const cats = await fetchJsonArray('/api/blog-categories');
    const map = {};
    const svgMap = {};
    cats.forEach(c => {
      map[c.id] = { label: c.label, icon: c.icon, color: c.color, image: c.image || '' };
      if (c.svg) svgMap[c.id] = c.svg;
    });
    BLOG_CATEGORIES = map;
    blogSvgs = svgMap;
  } catch (err) {
    console.warn('Failed to load blog categories:', err);
    BLOG_CATEGORIES = {
      'blog-construction': { label: 'Construction', icon: '', color: 'var(--rust)', image: '' },
      'blog-forage': { label: 'Forage', icon: '', color: 'var(--blue, #2563eb)', image: '' },
      'blog-immobilier': { label: 'Immobilier', icon: '', color: 'var(--green, #16a34a)', image: '' }
    };
    blogSvgs = { 'blog-construction': 'construction.svg', 'blog-forage': 'forage.svg', 'blog-immobilier': 'immobilier.svg' };
  }
}

function readingTime(html) {
  if (!html) return 1;
  const text = html.replace(/<[^>]*>/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

async function loadBlog() {
  try {
    const posts = await fetchJsonArray(`${API_BASE}/api/blog`);
    const container = document.getElementById('blogTimeline');
    if (!container) return;
    window._allPosts = posts;
    const showAll = document.getElementById('blogFooter');
    if (posts.length <= 3) {
      if (showAll) showAll.style.display = 'none';
    } else {
      if (showAll) showAll.style.display = '';
    }
    container.innerHTML = posts.map((p, i) => {
      const date = new Date(p.date);
      const dateLocale = currentLang === 'mg' ? 'mg-MG' : currentLang === 'en' ? 'en-US' : 'fr-FR';
      const dateStr = date.toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' });
      const blogSvg = blogSvgs[p.image_slot] || 'construction.svg';
      const cat = BLOG_CATEGORIES[p.image_slot] || {};
      const catImg = cat.image || '';
      const postImg = p.image && !p.image.startsWith('http') && !p.image.startsWith('/') ? `/images/blog/${p.image}` : p.image;
      const hasOwnImg = !!postImg;
      const imgUrl = postImg || catImg || `/images/blog/${blogSvg}`;
      const rt = readingTime(p.content);
      const slotAttr = hasOwnImg ? '' : (p.image_slot || '');
      const isHidden = i >= 3 && posts.length > 3;
      return `
      <div class="timeline-entry${i === 0 ? ' timeline-visible' : ''}${isHidden ? ' hidden' : ''}" role="button" tabindex="0" aria-label="${escapeHtml(p.title)}" data-index="${escapeHtml(String(p.index || ''))}" data-id="${escapeHtml(p.id)}" data-title="${escapeHtml(p.title)}" data-date="${dateStr}" data-content="${escapeHtml(p.content || '')}" data-img="${escapeHtml(imgUrl)}" data-slug="${escapeHtml(p.slug || '')}" data-image-slot="${slotAttr}"${isHidden ? ' style="display:none"' : ''}>
        <div class="timeline-marker"></div>
        <div class="timeline-card" style="--card-accent: ${cat.color || 'var(--rust)'}">
          <div class="timeline-img-wrap">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.title)}" loading="lazy"${slotAttr ? ` data-image-slot="${slotAttr}"` : ''}>
            ${cat.label ? `<span class="timeline-badge" style="--badge-color: ${cat.color}">${cat.label}</span>` : ''}
          </div>
          <div class="timeline-body">
            <div class="timeline-meta">
              <span class="timeline-date">${dateStr}</span>
              <span class="timeline-readtime">${rt} min</span>
            </div>
            <h3 class="timeline-title">${escapeHtml(p.title)}</h3>
            <p class="timeline-excerpt">${escapeHtml(p.excerpt)}</p>
            <a href="#" class="timeline-link" data-i18n="blog.readmore">${getNestedTranslation('blog.readmore') || 'Lire l\'article'}</a>
          </div>
        </div>
      </div>`;
    }).join('');
    applyGlobalMotionOrder(container);
    container.querySelectorAll('.timeline-entry').forEach(entry => {
      entry.addEventListener('click', (e) => {
        if (e.target.closest('.timeline-link')) e.preventDefault();
        openBlogPost(
          entry.dataset.title, entry.dataset.date, entry.dataset.content,
          entry.dataset.img, entry.dataset.slug, entry.dataset.imageSlot, entry.dataset.id
        );
      });
      entry.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        entry.click();
      });
    });
    const entries = container.querySelectorAll('.timeline-entry:not(.hidden):not(.timeline-visible)');
    if (entries.length) initBlogReveal();
    loadImageSlots();

    // Set up blog toggle button after HTML is in DOM
    if (posts.length > 3) {
      const btn = document.getElementById('blogToggleBtn');
      if (btn) {
        const hiddenEntries = container.querySelectorAll('.timeline-entry.hidden');
        btn.textContent = getNestedTranslation('blog.showall') || 'Voir tous les articles';
        btn.onclick = () => {
          const expanded = btn.dataset.expanded === 'true';
          btn.dataset.expanded = expanded ? 'false' : 'true';
          btn.textContent = expanded
            ? (getNestedTranslation('blog.showall') || 'Voir tous les articles')
            : (getNestedTranslation('blog.showless') || 'Voir moins');
          hiddenEntries.forEach(el => {
            if (expanded) {
              el.classList.add('hidden');
              el.style.display = 'none';
              el.classList.remove('timeline-visible');
            } else {
              el.classList.remove('hidden');
              el.style.display = '';
              el.classList.add('timeline-visible');
            }
          });
        };
      }
    }
  } catch (err) { console.warn('Blog load error:', err); showSectionError('blogTimeline', getNestedTranslation('dossiers.error') || 'Unable to load.'); }
}

function openBlogPost(title, date, content, imgUrl, slug, imageSlot, postId) {
  lastFocusedEl = document.activeElement;
  const modal = document.getElementById('blogModal');
  const contentEl = document.getElementById('blogModalContent');
  const titleEl = document.getElementById('blogModalTitle');
  const dateEl = document.getElementById('blogModalDate');
  const bodyEl = document.getElementById('blogModalBody');
  const authorEl = document.getElementById('blogModalAuthor');
  const shareBtns = document.getElementById('blogShare');
  const relatedEl = document.getElementById('blogRelated');
  const progressEl = document.getElementById('blogProgress');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  dateEl.textContent = date;
  if (authorEl) authorEl.textContent = getNestedTranslation('blog.publishedBy') || 'Publié par Nord Invest Madagascar';
  if (contentEl) {
    if (imgUrl) {
      contentEl.style.backgroundImage = `url('${imgUrl}')`;
      contentEl.classList.add('has-cover');
    } else {
      contentEl.style.backgroundImage = 'none';
      contentEl.classList.remove('has-cover');
    }
  }
  bodyEl.innerHTML = sanitizeHtml(content);
  bodyEl.scrollTop = 0;
  const pageUrl = slug ? `${window.location.origin}/blog/${encodeURIComponent(slug)}` : window.location.href;
  const shareText = `${title} — Nord Invest Madagascar`;
  if (shareBtns) {
    shareBtns.innerHTML = `
      <span class="blog-share-label">${getNestedTranslation('blog.share') || 'Partager'}</span>
      <a href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + pageUrl)}" target="_blank" rel="noopener" class="blog-share-btn share-wa" title="WhatsApp">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener" class="blog-share-btn share-fb" title="Facebook">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>
      <button class="blog-share-btn share-copy" onclick="copyShareLink('${encodeURIComponent(pageUrl)}')" title="Copier le lien">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </button>
    `;
  }
  if (relatedEl && window._allPosts) {
    const others = window._allPosts.filter(p => p.id !== postId);
    if (others.length > 0) {
      relatedEl.innerHTML = `
        <div class="blog-related-title">${getNestedTranslation('blog.related') || 'Articles similaires'}</div>
        <div class="blog-related-grid">${others.slice(0, 2).map(p => {
          const d = new Date(p.date);
          const dl = currentLang === 'mg' ? 'mg-MG' : currentLang === 'en' ? 'en-US' : 'fr-FR';
          const ds = d.toLocaleDateString(dl, { day: '2-digit', month: 'long', year: 'numeric' });
          const cat2 = BLOG_CATEGORIES[p.image_slot] || {};
          const svg = blogSvgs[p.image_slot] || 'construction.svg';
          const pImg = p.image && !p.image.startsWith('http') && !p.image.startsWith('/') ? `/images/blog/${p.image}` : p.image;
          const relatedImg = pImg || cat2.image || `/images/blog/${svg}`;
          return `<div class="blog-related-card" onclick="openBlogPost('${escapeHtml(p.title)}', '${ds}', '${escapeHtml(p.content || '')}', '${escapeHtml(relatedImg)}', '${escapeHtml(p.slug || '')}', '${p.image_slot || ''}', '${p.id}')">
            <div class="blog-related-img" style="background-image: url('${escapeHtml(relatedImg)}')"></div>
            <div class="blog-related-body">
              <div class="blog-related-date">${ds}</div>
              <div class="blog-related-title-text">${escapeHtml(p.title)}</div>
            </div>
          </div>`;
        }).join('')}</div>`;
      relatedEl.style.display = '';
    } else {
      relatedEl.style.display = 'none';
    }
  }
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.querySelector('nav')?.classList.add('hidden');
  if (progressEl) {
    progressEl.style.width = '0%';
    bodyEl.onscroll = () => {
      const maxScroll = Math.max(bodyEl.scrollHeight - bodyEl.clientHeight, 1);
      const pct = bodyEl.scrollTop / maxScroll * 100;
      progressEl.style.width = Math.min(pct, 100) + '%';
    };
  }
  contentEl?.focus({ preventScroll: true });
}

function copyShareLink(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.querySelector('.share-copy');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => btn.innerHTML = orig, 2000);
      }
    });
  }
}

function closeBlogPost(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('blogModal');
  const contentEl = document.getElementById('blogModalContent');
  const bodyEl = document.getElementById('blogModalBody');
  const progressEl = document.getElementById('blogProgress');
  if (modal) modal.classList.remove('active');
  if (modal) modal.setAttribute('aria-hidden', 'true');
  if (contentEl) contentEl.classList.remove('has-cover');
  if (bodyEl) bodyEl.onscroll = null;
  if (progressEl) progressEl.style.width = '0%';
  document.body.style.overflow = '';
  document.querySelector('nav')?.classList.remove('hidden');
  if (lastFocusedEl) { lastFocusedEl.focus(); lastFocusedEl = null; }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const modal = document.querySelector('.blog-modal.active, .pdf-modal.active, .gallery-modal.active, .team-lightbox.active');
    if (modal) {
      const focusable = Array.from(modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    return;
  }
  if (e.key === 'Escape') {
    const blogModal = document.getElementById('blogModal');
    const pdfModal = document.getElementById('pdfModal');
    const galleryModal = document.getElementById('galleryModal');
    const productLightbox = document.getElementById('productLightbox');
    if (blogModal?.classList.contains('active')) closeBlogPost();
    else if (pdfModal?.classList.contains('active')) closePdfViewer();
    else if (galleryModal?.classList.contains('active')) closeGallery();
    else if (productLightbox?.classList.contains('active')) closeProductLightbox();
  }
});

let exchangeRates = {};

async function loadPricingData() {
  try {
    const res = await fetch(`${API_BASE}/api/pricing`);
    const data = await res.json();
    const pricing = data.pricing || {};
    exchangeRates = data.exchange_rates || {};
    const categories = ['construction', 'rehabilitation', 'forage'];
    categories.forEach(cat => {
      const container = document.getElementById(`pricingGrid-${cat}`);
      if (!container) return;
      const tiers = pricing[cat] || {};
      const tierKeys = Object.keys(tiers);
      const defaultProjectSize = cat === 'forage' ? 12 : 100;
      const catLabels = {
        construction: { unit: 'm²' },
        rehabilitation: { unit: 'm²' },
        forage: { unit: 'ml' }
      };
      const isFlat = tierKeys.length <= 1;
      container.innerHTML = tierKeys.map((tier, ti) => {
        const t = tiers[tier];
        const price = t.pricePerM2 || t.pricePerML || t.price || 0;
        const unit = t.unit || catLabels[cat]?.unit || 'm²';
        const budget = Math.round(price * defaultProjectSize);
        const type = getNestedTranslation(`pricing.tiers.${cat}.${tier}`) || t.name;
        const isFeatured = ti === 1;
        const priceLocale = currentLang === 'en' ? 'en-US' : 'fr-MG';
        const priceStr = price.toLocaleString(priceLocale);
        const priceEUR = exchangeRates.EUR ? Math.round(price / exchangeRates.EUR).toLocaleString(priceLocale) : null;
        const priceUSD = exchangeRates.USD ? Math.round(price / exchangeRates.USD).toLocaleString(priceLocale) : null;
        const badgeKey = cat === 'construction' && tier === 'standard' ? 'popular'
          : cat === 'rehabilitation' && tier === 'standard' ? 'recommended'
          : cat === 'forage' && tier === 'standard' ? 'allInclusive' : '';
        const badge = badgeKey ? getNestedTranslation(`pricing.badge.${badgeKey}`) : '';
        const foreignHtml = priceEUR && priceUSD ? `
          <div class="price-foreign">
            <div class="price-foreign-item">
              <span class="price-foreign-symbol">€</span>
              <span class="price-foreign-val">${priceEUR}</span>
            </div>
            <div class="price-foreign-item">
              <span class="price-foreign-symbol">$</span>
              <span class="price-foreign-val">${priceUSD}</span>
            </div>
          </div>` : '';
        return `
        <div class="price-card${isFeatured ? ' featured' : ''}${isFlat ? ' price-card--flat' : ''}" data-service="${cat}" data-tier="${tier}" data-tier-name="${escapeHtml(t.name)}" data-type="${escapeHtml(type)}" data-price="${price}" data-budget="${budget}">
          ${!isFlat && badge ? `<div class="price-badge" data-i18n="pricing.badge.${badgeKey}">${badge}</div>` : ''}
          ${!isFlat ? `<div class="price-tier">${escapeHtml(t.name)}</div>` : ''}
          <div class="price-val">
            <div class="price-main">
              <span class="price-num">${priceStr}</span>
              <span class="price-currency">Ar</span>
            </div>
            <div class="price-unit">/ ${unit}</div>
            ${foreignHtml}
          </div>
          <hr class="price-divider">
          <ul class="price-features">
            ${(t.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
          <div class="price-note" data-i18n="pricing.priceNote">${getNestedTranslation('pricing.priceNote') || ''}</div>
           <a href="#contact" class="price-cta" data-i18n="pricing.cta" onclick="event.preventDefault();fillContactForm(this)">${getNestedTranslation('pricing.cta') || ''}</a>
        </div>`;
      }).join('');
      applyGlobalMotionOrder(container);
    });
  } catch (err) { console.warn('Pricing load error:', err); ['construction', 'rehabilitation', 'forage'].forEach(cat => showSectionError('pricingGrid-' + cat, getNestedTranslation('dossiers.error') || 'Unable to load.')); }
}

async function loadConfigData() {
  try {
    const res = await fetch(`${API_BASE}/api/config?lang=${currentLang}`, { cache: 'no-store' });
    const cfg = await res.json();

    // Hero stats
    const heroExp = document.getElementById('heroExpYears');
    if (cfg.experience_years && heroExp) heroExp.textContent = cfg.experience_years;
    const heroStaff = document.getElementById('heroStaff');
    if (cfg.team_stats?.total_staff && heroStaff) heroStaff.textContent = cfg.team_stats.total_staff;
    const heroEng = document.getElementById('heroEngineers');
    if (cfg.team_stats?.civil_engineers && heroEng) heroEng.textContent = cfg.team_stats.civil_engineers;

    // Vision & Mission: use admin-edited content when provided, otherwise fall back to translations
    const visionEl = document.getElementById('visionText');
    if (visionEl) {
      if (cfg.vision && currentLang === 'fr') {
        visionEl.textContent = `"${cfg.vision}"`;
      } else {
        const fb = getNestedTranslation('vision.text');
        if (fb) visionEl.textContent = fb;
      }
    }
    const missionEl = document.getElementById('missionText');
    if (missionEl) {
      if (cfg.mission && currentLang === 'fr') {
        missionEl.textContent = `"${cfg.mission}"`;
      } else {
        const fb = getNestedTranslation('mission.text');
        if (fb) missionEl.textContent = fb;
      }
    }

    // Contact info
    const phoneEl = document.getElementById('contactPhone');
    if (phoneEl) {
      if (cfg.contact?.phone) {
        phoneEl.textContent = cfg.contact.phone;
      } else {
        const fb = getNestedTranslation('contact.phoneVal');
        if (fb) phoneEl.textContent = fb;
      }
    }
    const emailEl = document.getElementById('contactEmail');
    if (cfg.contact?.email && emailEl) emailEl.textContent = cfg.contact.email;
    const addrEl = document.getElementById('contactAddress');
    if (cfg.contact?.address && addrEl) addrEl.innerHTML = cfg.contact.address.replace(/\n/g, '<br>');

    // Numbers section
    const numExp = document.getElementById('numExpYears');
    if (cfg.experience_years && numExp) numExp.textContent = cfg.experience_years;
    const numStaff = document.getElementById('numStaff');
    if (cfg.team_stats?.total_staff && numStaff) numStaff.textContent = cfg.team_stats.total_staff;
    const numEng = document.getElementById('numEngineers');
    if (cfg.team_stats?.civil_engineers && numEng) numEng.textContent = cfg.team_stats.civil_engineers;

    // Social media links
    const socialContainer = document.getElementById('footerSocial');
    if (socialContainer && cfg.social) {
      let html = '';
      if (cfg.social.facebook) html += `<a href="${cfg.social.facebook}" target="_blank" rel="noopener" class="social-link" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`;
      if (cfg.social.instagram) html += `<a href="${cfg.social.instagram}" target="_blank" rel="noopener" class="social-link" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg></a>`;
      if (html) socialContainer.innerHTML = html;
    }

    // Apply dynamic section content (overrides i18n defaults for current language)
    applySectionContent(cfg);
  } catch (err) { console.warn('Config load error:', err); }
}

// ─── DYNAMIC SECTION CONTENT ───
function applySectionContent(cfg) {
  if (!cfg.sections) return;

  const s = cfg.sections;

  // Hero
  if (s.hero) {
    setElText('.hero-tag', s.hero.tag);
    setElHtml('#hero h1', s.hero.title);
    setElText('.hero-sub', s.hero.subtitle);
    setElText('.hero-badge-label', s.hero.badge);
    setElText('.hero-badge-year', s.hero.badgeYear);
    setElText('.hero-stats > div:nth-child(1) .stat-label', s.hero.stat1Label);
    setElText('.hero-stats > div:nth-child(2) .stat-label', s.hero.stat2Label);
    setElText('.hero-stats > div:nth-child(3) .stat-label', s.hero.stat3Label);
    setElText('.hero-stats > div:nth-child(4) .stat-label', s.hero.stat4Label);
    setElText('.hero-btns .btn-primary', s.hero.btnPricing);
    setElText('.hero-btns .btn-outline', s.hero.btnContact);
  }

  // About
  if (s.about) {
    setElText('#about .section-tag', s.about.tag);
    setElHtml('#about h2', s.about.title);
    setElText('#about .section-lead', s.about.lead);
    setElText('.about-features > .feat:nth-child(1) .feat-title', s.about.feat1Title);
    setElText('.about-features > .feat:nth-child(1) .feat-desc', s.about.feat1Desc);
    setElText('.about-features > .feat:nth-child(2) .feat-title', s.about.feat2Title);
    setElText('.about-features > .feat:nth-child(2) .feat-desc', s.about.feat2Desc);
    setElText('.about-features > .feat:nth-child(3) .feat-title', s.about.feat3Title);
    setElText('.about-features > .feat:nth-child(3) .feat-desc', s.about.feat3Desc);
  }

  // Standards
  if (s.standards) {
    setElText('#technical-standards .section-tag', s.standards.tag);
    setElHtml('#technical-standards h2', s.standards.title);
    setElText('#technical-standards .section-lead', s.standards.lead);
    setElText('.standards-grid > .standard-item:nth-child(1) h3', s.standards.item1Title);
    setElText('.standards-grid > .standard-item:nth-child(1) p', s.standards.item1Desc);
    setElText('.standards-grid > .standard-item:nth-child(2) h3', s.standards.item2Title);
    setElHtml('.standards-grid > .standard-item:nth-child(2) p', s.standards.item2Desc);
    setElText('.standards-grid > .standard-item:nth-child(2) .vex-badge', s.standards.item2Badge);
    setElText('.standards-grid > .standard-item:nth-child(3) h3', s.standards.item3Title);
    setElHtml('.standards-grid > .standard-item:nth-child(3) p', s.standards.item3Desc);
    setElText('.standards-grid > .standard-item:nth-child(4) h3', s.standards.item4Title);
    setElText('.standards-grid > .standard-item:nth-child(4) p', s.standards.item4Desc);
  }

  // Values: admin content overrides translations when present
  if (s.values) {
    const valueCards = document.querySelectorAll('#values .vm-card');
    if (valueCards.length >= 3) {
      const t1 = valueCards[0].querySelector('.vm-label');
      const d1 = valueCards[0].querySelector('.vm-text');
      if (t1 && s.values.title1) t1.textContent = s.values.title1;
      if (d1 && s.values.desc1) d1.textContent = s.values.desc1;
    }
    if (valueCards.length >= 3) {
      const t2 = valueCards[1].querySelector('.vm-label');
      const d2 = valueCards[1].querySelector('.vm-text');
      if (t2 && s.values.title2) t2.textContent = s.values.title2;
      if (d2 && s.values.desc2) d2.textContent = s.values.desc2;
    }
    if (valueCards.length >= 3) {
      const t3 = valueCards[2].querySelector('.vm-label');
      const d3 = valueCards[2].querySelector('.vm-text');
      if (t3 && s.values.title3) t3.textContent = s.values.title3;
      if (d3 && s.values.desc3) d3.textContent = s.values.desc3;
    }
  }

  // Team
  if (s.team) {
    setElText('#team .section-tag', s.team.tag);
    setElHtml('#team h2', s.team.title);
    setElText('#team .section-lead', s.team.lead);
  }

  // Services
  if (s.services) {
    setElText('#services .section-tag', s.services.tag);
    setElHtml('#services h2', s.services.title);
    setElText('#services .section-lead', s.services.lead);
  }

  // Pricing
  if (s.pricing) {
    setElText('#pricing .section-tag', s.pricing.tag);
    setElHtml('#pricing h2', s.pricing.title);
    setElText('#pricing .section-lead', s.pricing.lead);
    setElText('.pricing-tabs > .tab-btn:nth-child(1) .pricing-tab-label', s.pricing.tab1);
    setElText('.pricing-tabs > .tab-btn:nth-child(2) .pricing-tab-label', s.pricing.tab2);
    setElText('.pricing-tabs > .tab-btn:nth-child(3) .pricing-tab-label', s.pricing.tab3);
    if (s.pricing.note) {
      const note = document.querySelector('.pricing-footer');
      if (note) note.innerHTML = sanitizeHtml(s.pricing.note);
    }
  }

  // Calculator
  if (s.calculator) {
    setElText('#calculator .section-tag', s.calculator.tag);
    setElHtml('#calculator h2', s.calculator.title);
    setElText('#calculator .section-lead', s.calculator.lead);
  }

  // Projects
  if (s.projects) {
    setElText('#projects .section-tag', s.projects.tag);
    setElHtml('#projects h2', s.projects.title);
    setElText('#projects .section-lead', s.projects.lead);
  }

  // Dossiers
  if (s.dossiers) {
    setElText('#dossiers .section-tag', s.dossiers.tag);
    setElHtml('#dossiers h2', s.dossiers.title);
    setElText('#dossiers .section-lead', s.dossiers.lead);
  }

  // Blog
  if (s.blog) {
    setElText('#blog .section-tag', s.blog.tag);
    setElHtml('#blog h2', s.blog.title);
    setElText('#blog .section-lead', s.blog.lead);
  }

  // Contact
  if (s.contact) {
    setElText('#contact .section-tag', s.contact.tag);
    setElHtml('#contact h2', s.contact.title);
    setElText('#contact .section-lead', s.contact.lead);
    setElText('#contactPhone', s.contact.phone);
    setElText('#contactEmail', s.contact.email);
    setElHtml('#contactAddress', s.contact.address);
    setElText('#contactOffice', s.contact.office);
    setElText('.map-title', s.contact.mapTitle);
    setElText('.project-map-title', s.contact.mapProjectsTitle);
  }

  // Numbers: admin content overrides translations when present
  if (s.numbers) {
    const numLabels = document.querySelectorAll('#numbers .num-label');
    if (numLabels.length >= 4) {
      if (s.numbers.exp) numLabels[0].textContent = s.numbers.exp;
      if (s.numbers.tech) numLabels[1].textContent = s.numbers.tech;
      if (s.numbers.engineers) numLabels[2].textContent = s.numbers.engineers;
      if (s.numbers.sites) numLabels[3].textContent = s.numbers.sites;
    }
  }

  // Vision & Mission
  if (s.visionMission) {
    setElText('#visionMissionGrid > .vm-card:nth-child(1) .vm-label', s.visionMission.visionTitle);
    setElText('#visionText', s.visionMission.visionText);
    setElText('#visionMissionGrid > .vm-card:nth-child(2) .vm-label', s.visionMission.missionTitle);
    setElText('#missionText', s.visionMission.missionText);
  }

  // Newsletter
  if (s.newsletter) {
    setElText('.newsletter-title', s.newsletter.title);
    setElText('.newsletter-desc', s.newsletter.desc);
    setElText('.newsletter-btn', s.newsletter.btn);
  }
}

function setElText(selector, text) {
  if (!text) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = text;
}

function setElHtml(selector, html) {
  if (!html) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = sanitizeHtml(html);
}

function showSectionError(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-muted)"><p>${message}</p></div>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function sanitizeHtml(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  const bannedTags = ['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta'];
  bannedTags.forEach(tag => {
    el.querySelectorAll(tag).forEach(node => node.remove());
  });
  el.querySelectorAll('*').forEach(node => {
    const attrs = node.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const name = attrs[i].name;
      if (name.startsWith('on')) {
        node.removeAttribute(name);
      }
    }
    if (node.hasAttribute('href') && node.getAttribute('href').toLowerCase().startsWith('javascript:')) {
      node.removeAttribute('href');
    }
  });
  return el.innerHTML;
}

// ═══════════════════════════════════════════════════════
// DOSSIERS — Vente de Terrains (Cloudinary)
// ═══════════════════════════════════════════════════════

let currentPdfId = '';
let currentPdfUrl = '';

function formatFileSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(0) + (getNestedTranslation('format.kb') || ' Ko');
  return (kb / 1024).toFixed(1) + (getNestedTranslation('format.mb') || ' Mo');
}

function openPdfViewer(id, name, url) {
  lastFocusedEl = document.activeElement;
  currentPdfId = id;
  currentPdfUrl = url;
  const modal = document.getElementById('pdfModal');
  const content = document.getElementById('pdfModalContent');
  const viewer = document.getElementById('pdfViewer');
  const title = document.getElementById('pdfModalTitle');
  const loading = document.getElementById('pdfLoading');
  const errorEl = document.getElementById('pdfError');
  if (!modal || !viewer) return;
  const label = name || 'Document PDF';
  if (title) title.textContent = label;
  viewer.title = label;
  if (loading) loading.classList.remove('hidden');
  if (errorEl) errorEl.classList.remove('active');

  viewer.onload = () => {
    if (loading) loading.classList.add('hidden');
  };

  viewer.onerror = () => {
    if (loading) loading.classList.add('hidden');
    if (errorEl) errorEl.classList.add('active');
  };

  viewer.src = url ? `${url}${url.includes('#') ? '' : '#toolbar=1&navpanes=0&view=FitH'}` : '';
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.querySelector('nav')?.classList.add('hidden');
  content?.focus({ preventScroll: true });

  setTimeout(() => {
    if (loading && !loading.classList.contains('hidden')) {
      if (errorEl) errorEl.classList.add('active');
    }
  }, 15000);
}

function closePdfViewer(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('pdfModal');
  const viewer = document.getElementById('pdfViewer');
  const errorEl = document.getElementById('pdfError');
  if (modal) modal.classList.remove('active');
  if (modal) modal.setAttribute('aria-hidden', 'true');
  if (viewer) { viewer.onload = null; viewer.onerror = null; viewer.src = ''; }
  if (errorEl) errorEl.classList.remove('active');
  document.body.style.overflow = '';
  document.querySelector('nav')?.classList.remove('hidden');
  if (lastFocusedEl) { lastFocusedEl.focus(); lastFocusedEl = null; }
}

function downloadCurrentPdf() {
  if (!currentPdfUrl) return;
  const a = document.createElement('a');
  if (currentPdfUrl.includes('/upload/')) {
    a.href = currentPdfUrl.replace('/upload/', '/upload/fl_attachment/');
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    fetch(currentPdfUrl)
      .then(r => r.blob())
      .then(blob => {
        a.href = URL.createObjectURL(blob);
        a.download = document.getElementById('pdfModalTitle')?.textContent || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => { window.open(currentPdfUrl, '_blank'); });
  }
}

function openPdfInTab() {
  if (currentPdfUrl) window.open(currentPdfUrl, '_blank');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('pdfModal');
    if (modal && modal.classList.contains('active')) closePdfViewer();
  }
});

/* ── Mobile swipe-to-close ── */
let pdfTouchStartY = 0;
let pdfTouchDelta = 0;
let pdfIsDragging = false;

document.addEventListener('touchstart', (e) => {
  const content = document.getElementById('pdfModalContent');
  if (!content || !content.closest('.pdf-modal.active')) return;
  const touch = e.touches[0];
  pdfTouchStartY = touch.clientY;
  pdfTouchDelta = 0;
  pdfIsDragging = false;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const content = document.getElementById('pdfModalContent');
  if (!content || !content.closest('.pdf-modal.active')) return;
  const touch = e.touches[0];
  const delta = touch.clientY - pdfTouchStartY;
  if (delta < 5) { pdfTouchStartY = touch.clientY; return; }
  pdfTouchDelta = delta;
  pdfIsDragging = true;
  content.classList.add('is-dragging');
  const translate = Math.min(delta * 0.6, 200);
  content.style.transform = 'translateY(' + translate + 'px)';
}, { passive: true });

document.addEventListener('touchend', () => {
  const content = document.getElementById('pdfModalContent');
  if (!content || !pdfIsDragging) return;
  content.classList.remove('is-dragging');
  content.style.transform = '';
  if (pdfTouchDelta > 80) closePdfViewer();
  pdfIsDragging = false;
  pdfTouchDelta = 0;
}, { passive: true });

async function loadDossiers() {
  const grid = document.getElementById('dossiersGrid');
  if (!grid) return;
  try {
    const dossiers = await fetchJsonArray('/api/dossiers');
    if (!dossiers.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <p style="font-size:1.1rem">${getNestedTranslation('dossiers.empty') || 'Aucun document disponible pour le moment.'}</p>
        <p style="font-size:0.85rem;margin-top:8px">${getNestedTranslation('dossiers.emptySub') || 'Revenez bientôt pour découvrir nos nouvelles offres.'}</p>
      </div>`;
      return;
    }
    function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function formatDate(iso) {
      if (!iso) return '';
      try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch { return ''; }
    }
    function getDownloadUrl(url) {
      if (url && url.includes('/upload/')) return url.replace('/upload/', '/upload/fl_attachment/');
      return url;
    }
    const downloadSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    grid.innerHTML = dossiers.map(d => {
      const thumbUrl = d.thumbnail_url || '';
      const dateStr = formatDate(d.created_at);
      const dlUrl = getDownloadUrl(d.cloudinary_url || '');
      const videoUrl = d.video_url || '';
      return `
      <div class="dossier-card" role="button" tabindex="0" aria-label="Ouvrir ${escAttr(d.name)}" data-id="${escAttr(d.id)}" data-name="${escAttr(d.name)}" data-url="${escAttr(d.cloudinary_url || '')}">
        <div class="dossier-thumb">
          <img src="${escAttr(thumbUrl)}" alt="${escAttr(d.name)}" class="img-reveal" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="dossier-thumb-fallback" style="display:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <button class="dossier-download-btn" title="${getNestedTranslation('pdf.download') || 'Télécharger'}" data-dl-url="${escAttr(dlUrl)}">${downloadSvg}</button>
        </div>
        <div class="dossier-name">${escHtml(d.name.replace(/\.pdf$/i, ''))}</div>
        <div class="dossier-meta">
          <span class="dossier-size">${formatFileSize(d.size)}</span>
          ${dateStr ? `<span class="dossier-date">${escHtml(dateStr)}</span>` : ''}
        </div>
        <div class="dossier-actions">
          <button type="button" class="dossier-action dossier-action-pdf" data-dl-url="${escAttr(dlUrl)}" title="${getNestedTranslation('pdf.download') || 'Télécharger le PDF'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>${getNestedTranslation('pdf.download') || 'PDF'}</span>
          </button>
          ${videoUrl ? `
          <button type="button" class="dossier-action dossier-action-video" data-video="${escAttr(videoUrl)}" title="${getNestedTranslation('dossiers.videoButton') || 'Voir la vidéo'}">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            <span>${getNestedTranslation('dossiers.videoButton') || 'Vidéo'}</span>
          </button>` : ''}
        </div>
      </div>`;
    }).join('');
    applyGlobalMotionOrder(grid);
grid.querySelectorAll('.dossier-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.dossier-download-btn, .dossier-action, .dossier-video-wrap, .dossier-video')) return;
        openPdfViewer(card.dataset.id, card.dataset.name, card.dataset.url);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('.dossier-download-btn, .dossier-action, .dossier-video-wrap, .dossier-video')) return;
        e.preventDefault();
        card.click();
      });
    });
    grid.querySelectorAll('.dossier-download-btn, .dossier-action-pdf').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.dlUrl;
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });
    const setVideoButtonState = (button, isOpen) => {
      if (!button) return;
      button.classList.toggle('is-open', isOpen);
      const label = isOpen ? (getNestedTranslation('dossiers.closeVideo') || 'Fermer') : (getNestedTranslation('dossiers.videoButton') || 'Vidéo');
      const icon = isOpen ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      button.innerHTML = `${icon}<span>${label}</span>`;
    };

    const closeVideoModal = (activeButton = null) => {
      const modalVideo = videoModal.querySelector('video');
      if (modalVideo) modalVideo.pause();
      videoModal.classList.remove('active');

      if (activeButton) {
        setVideoButtonState(activeButton, false);
        return;
      }

      const openButtons = grid.querySelectorAll('.dossier-action-video.is-open');
      openButtons.forEach((button) => setVideoButtonState(button, false));
    };

    const videoModal = (() => {
      let modal = document.getElementById('dossierVideoModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dossierVideoModal';
        modal.className = 'dossier-video-modal';
        modal.innerHTML = `
          <div class="dossier-video-modal-frame">
            <button type="button" class="dossier-video-modal-close" aria-label="Fermer la vidéo">×</button>
            <video controls playsinline autoplay></video>
          </div>
        `;
        modal.addEventListener('click', (event) => {
          if (event.target === modal) {
            closeVideoModal();
          }
        });
        modal.querySelector('.dossier-video-modal-close').addEventListener('click', () => {
          closeVideoModal();
        });
        document.body.appendChild(modal);
      }
      return modal;
    })();

    grid.querySelectorAll('.dossier-action-video').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const modalVideo = videoModal.querySelector('video');
        const isOpen = videoModal.classList.contains('active');
        const activeButton = grid.querySelector('.dossier-action-video.is-open');

        if (activeButton && activeButton !== btn) {
          setVideoButtonState(activeButton, false);
        }

        if (isOpen && activeButton === btn) {
          closeVideoModal(btn);
          return;
        }

        if (!modalVideo.src || modalVideo.src !== btn.dataset.video) {
          modalVideo.src = btn.dataset.video;
        }
        videoModal.classList.add('active');
        setVideoButtonState(btn, true);
        const playPromise = modalVideo.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
      });
    });
    // Staggered reveal animation
    const cards = grid.querySelectorAll('.dossier-card');
    cards.forEach((card, i) => {
      setTimeout(() => card.classList.add('revealed'), 80 * (i + 1));
    });
    initImageReveal();
  } catch (err) {
    console.warn('Dossiers load error:', err);
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
      <p>${getNestedTranslation('dossiers.error') || 'Erreur de chargement.'}</p>
    </div>`;
  }
  initDossiersCarousel();
}

function initDossiersCarousel() {
  if (window.innerWidth >= 1024) return;
  const grid = document.getElementById('dossiersGrid');
  const nav = document.querySelector('.dossiers-carousel-nav');
  if (!grid || !nav) return;
  const cards = grid.querySelectorAll('.dossier-card');
  nav.style.display = cards.length < 2 ? 'none' : '';

  const dotsContainer = nav.querySelector('.carousel-dots');
  const prevBtn = nav.querySelector('.carousel-prev');
  const nextBtn = nav.querySelector('.carousel-next');
  if (!dotsContainer) return;

  dotsContainer.innerHTML = '';
  let autoTimer = null;
  let _touchStartX = 0;
  let _touchStartY = 0;
  let _isDragging = false;

  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => {
      scrollToIndex(i);
    });
    dotsContainer.appendChild(dot);
  });

  function getActiveIndex() {
    const scrollLeft = grid.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((c, i) => {
      const dist = Math.abs(c.offsetLeft - scrollLeft);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
  }

  function updateDots() {
    const idx = getActiveIndex();
    dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  }

  function scrollToIndex(idx) {
    if (idx < 0 || idx >= cards.length) return;
    const target = cards[idx].offsetLeft;
    grid.scrollTo({ left: target, behavior: 'smooth' });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => scrollToIndex(getActiveIndex() - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => scrollToIndex(getActiveIndex() + 1));

  grid.addEventListener('scroll', () => {
    updateDots();
    resetAutoTimer();
  }, { passive: true });

  grid.addEventListener('touchstart', (e) => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
    _isDragging = true;
    resetAutoTimer();
  }, { passive: true });

  grid.addEventListener('touchend', () => {
    _isDragging = false;
    startAutoTimer();
  }, { passive: true });

  nav.addEventListener('mouseenter', () => clearAutoTimer());
  nav.addEventListener('mouseleave', () => startAutoTimer());

  function clearAutoTimer() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function startAutoTimer() {
    clearAutoTimer();
    if (cards.length < 2) return;
    autoTimer = setInterval(() => {
      const next = getActiveIndex() + 1;
      if (next >= cards.length) {
        grid.scrollTo({ left: cards[0].offsetLeft, behavior: 'smooth' });
      } else {
        scrollToIndex(next);
      }
    }, 5000);
  }

  function resetAutoTimer() {
    clearAutoTimer();
    startAutoTimer();
  }

  startAutoTimer();
}

function filterBlogPosts(query) {
  const container = document.getElementById('blogTimeline');
  if (!container) return;
  const q = query.toLowerCase().trim();
  const btn = document.getElementById('blogToggleBtn');
  let visibleCount = 0;
  container.querySelectorAll('.timeline-entry').forEach(entry => {
    const title = (entry.dataset.title || '').toLowerCase();
    const match = !q || title.includes(q);
    if (!match) {
      entry.style.display = 'none';
    } else {
      visibleCount++;
      entry.style.display = '';
      if (q && entry.classList.contains('hidden')) {
        entry.dataset.searchRevealed = 'true';
        entry.classList.remove('hidden');
        entry.classList.add('timeline-visible');
      } else if (!q && entry.dataset.searchRevealed === 'true') {
        entry.dataset.searchRevealed = '';
        if (btn && btn.dataset.expanded !== 'true') {
          entry.classList.add('hidden');
          entry.style.display = 'none';
          entry.classList.remove('timeline-visible');
        }
      }
      if (!entry.classList.contains('timeline-visible')) {
        entry.classList.add('timeline-visible');
      }
    }
  });
  let noResult = container.querySelector('.blog-search-noresult');
  if (q && visibleCount === 0) {
    if (!noResult) {
      noResult = document.createElement('div');
      noResult.className = 'blog-search-noresult';
      container.appendChild(noResult);
    }
    noResult.textContent = getNestedTranslation('blog.noresults') || 'Aucun article trouvé.';
  } else if (noResult) {
    noResult.remove();
  }
  const footer = document.getElementById('blogFooter');
  if (footer) {
    footer.style.display = q ? 'none' : '';
  }
}

function initBlogReveal() {
  const entries = document.querySelectorAll('.timeline-entry:not(.timeline-visible)');
  if (!entries.length) return;
  const observer = new IntersectionObserver((entries_) => {
    entries_.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('timeline-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  entries.forEach(el => observer.observe(el));
}

// ═══════════════════════════════════════════════════════
// INTERACTIVE MAPS (Leaflet)
// ═══════════════════════════════════════════════════════

const CITY_COORDS = {
  'antsiranana': [-12.2833, 49.2833],
  'diego': [-12.2833, 49.2833],
  'diegosuarez': [-12.2833, 49.2833],
  'nosybe': [-13.3167, 48.2667],
  'sambava': [-14.2667, 50.1667],
  'antalaha': [-14.8833, 50.2667],
  'ramena': [-12.3333, 49.3667],
  'mahalina': [-12.4167, 49.4667],
  'nosyhara': [-12.2333, 49.0],
  'anjianjia': [-12.3833, 49.3],
  'djabala': [-13.4167, 48.3],
  'mahatsinjo': [-13.35, 48.25],
  'antananarivo': [-18.9333, 47.5167],
  'toamasina': [-18.1667, 49.3833],
  'fianarantsoa': [-21.45, 47.0833],
  'mahajanga': [-15.7167, 46.3167],
  'toliara': [-23.35, 43.6667],
  'antsirabe': [-19.8667, 47.0333],
  'morondava': [-20.2833, 44.2833],
  'taolagnaro': [-25.0333, 46.9833],
  'antsohihy': [-14.8833, 47.9833],
  'ambatondrazaka': [-17.8333, 48.4167],
  'manakara': [-22.15, 48.0]
};

function normalizeLocationText(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getCityCoords(location) {
  if (!location) return null;
  const normalizedLocation = normalizeLocationText(location);
  if (!normalizedLocation) return null;
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalizedLocation.includes(normalizeLocationText(key))) return coords;
  }
  return null;
}

let officeMap = null;
let projectMap = null;
let projectMarkers = [];

async function refreshProjectMap() {
  if (!projectMap) return;
  try {
    const [projects, slots] = await Promise.all([
      fetchJsonArray(`${API_BASE}/api/projects`, { cache: 'no-store' }),
      fetch(`${API_BASE}/api/images/slots`, { cache: 'no-store' }).then(r => r.json()).catch(() => [])
    ]);
    const slotMap = {};
    if (Array.isArray(slots)) slots.forEach(s => { slotMap[s.id] = s; });

    // Build marker map by project id
    const markerMap = {};
    projectMarkers.forEach(m => { if (m._projectId) markerMap[m._projectId] = m; });

    const seen = new Set();
    const updated = [];

    projects.forEach(p => {
      const coords = getCityCoords(p.location);
      if (!coords) return;
      seen.add(p.id);
      const slotId = p.image_slot || `project-${p.id}`;
      const slot = slotMap[slotId];
      const slotUrl = (slot && slot.currentUrl && !slot.currentUrl.endsWith('placeholder.svg')) ? slot.currentUrl : null;
      const ownImg = p.image && (p.image.startsWith('http') || p.image.startsWith('/')) ? p.image : null;
      const imgUrl = ownImg || slotUrl;
      const popupHtml = `<div style="min-width:160px">
        ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(p.title)}" style="width:100%;height:100px;object-fit:cover;border-radius:3px;margin-bottom:6px;">` : ''}
        <strong>${escapeHtml(p.title)}</strong><br>
        <span style="font-size:0.85rem;color:#666">${escapeHtml(p.location || '')}</span>
      </div>`;

      let marker = markerMap[p.id];
      if (marker) {
        marker.setLatLng(coords);
        marker.setPopupContent(popupHtml);
      } else {
        marker = L.marker(coords).addTo(projectMap).bindPopup(popupHtml);
        marker._projectId = p.id;
      }
      updated.push(marker);
    });

    // Remove markers for deleted projects
    projectMarkers.forEach(m => {
      if (m._projectId && !seen.has(m._projectId)) projectMap.removeLayer(m);
    });

    projectMarkers = updated;
  } catch (_e) { console.warn('refreshProjectMap error:', _e); }
}

function initOfficeMap() {
  const el = document.getElementById('officeMap');
  if (!el || officeMap) return;
  officeMap = L.map(el, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(officeMap);

  const markers = [
    L.marker([-12.2833, 49.2833]).addTo(officeMap)
      .bindPopup('<strong>Antsiranana (Siège)</strong><br>Tanambao 1, face Madahoufi'),
    L.marker([-13.3167, 48.2667]).addTo(officeMap)
      .bindPopup('<strong>Nosy Be (Antenne)</strong><br>Mahatsinjo')
  ];

  setTimeout(() => {
    officeMap.invalidateSize();
    const group = L.featureGroup(markers);
    officeMap.fitBounds(group.getBounds().pad(0.3));
  }, 500);
}

function initProjectMap() {
  const el = document.getElementById('projectMap');
  if (!el || projectMap) return;
  projectMap = L.map(el, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(projectMap);

  projectMarkers = [];
  Promise.all([
    fetchJsonArray(`${API_BASE}/api/projects`, { cache: 'no-store' }),
    fetch('/api/images/slots', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
  ]).then(([projects, slots]) => {
    const slotMap = {};
    if (Array.isArray(slots)) slots.forEach(s => { slotMap[s.id] = s; });
    projects.forEach(p => {
      const coords = getCityCoords(p.location);
      if (!coords) return;
      const slotId = p.image_slot || `project-${p.id}`;
      const slot = slotMap[slotId];
      const slotUrl = (slot && slot.currentUrl && !slot.currentUrl.endsWith('placeholder.svg')) ? slot.currentUrl : null;
      const ownImg = p.image && (p.image.startsWith('http') || p.image.startsWith('/')) ? p.image : null;
      const imgUrl = ownImg || slotUrl;
      const popupHtml = `<div style="min-width:160px">
        ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(p.title)}" style="width:100%;height:100px;object-fit:cover;border-radius:3px;margin-bottom:6px;">` : ''}
        <strong>${escapeHtml(p.title)}</strong><br>
        <span style="font-size:0.85rem;color:#666">${escapeHtml(p.location || '')}</span>
      </div>`;
      const marker = L.marker(coords).addTo(projectMap).bindPopup(popupHtml);
      marker._projectId = p.id;
      projectMarkers.push(marker);
    });
    if (projectMarkers.length > 0) {
      try {
        const group = L.featureGroup(projectMarkers);
        projectMap.fitBounds(group.getBounds().pad(0.3));
      } catch (_e) {}
    }
  }).catch(() => {});

  setTimeout(() => {
    projectMap.invalidateSize();
    if (projectMarkers.length > 0) {
      try {
        const group = L.featureGroup(projectMarkers);
        projectMap.fitBounds(group.getBounds().pad(0.3));
      } catch (_e) {}
    }
  }, 500);
}

function initMaps() {
  if (typeof L === 'undefined') return;
  initOfficeMap();
  initProjectMap();
}

function applyGlobalMotionOrder(root = document) {
  const containers = [
    '.about-features',
    '.vision-mission-grid',
    '.standards-grid',
    '.services-grid',
    '.pricing-grid',
    '.calculator-grid',
    '#numbers',
    '.contact-info',
    '#blogTimeline',
    '.team-grid',
    '.dossiers-grid'
  ];

  containers.forEach(selector => {
    const matches = [];
    if (root.matches?.(selector)) matches.push(root);
    root.querySelectorAll(selector).forEach(container => matches.push(container));

    matches.forEach(container => {
      Array.from(container.children).forEach((el, index) => {
        if (container.id === 'numbers' && !el.classList.contains('reveal')) return;
        el.style.setProperty('--motion-index', index);
        el.style.setProperty('--motion-delay', `${Math.min(index * 70, 560)}ms`);
      });
    });
  });
}

function initGlobalMotion() {
  document.body.classList.add('motion-prep');
  applyGlobalMotionOrder();
  requestAnimationFrame(() => {
    document.body.classList.add('site-ready');
  });
}

// ═══════════════════════════════════════════════════════
// INIT — Load default language
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initGlobalMotion();
  initHeroSwap();
  initTeamLightbox();
  loadBlogCategories();
  loadImageSlots();
  loadTeam();
  loadServices();
  loadProjects();
  loadDossiers();
  loadBlog();
  loadPricingData();
  // Load translations first, then apply admin section content on top so admin edits override i18n
  await loadTranslations(currentLang);
  await loadConfigData();
  loadProducts();
  initImageReveal();
  initMaps();
  initBudgetCurrencyConversion();
  initCookieConsent();
});

// ═══════════════════════════════════════════════════════
// BUDGET CURRENCY CONVERTER
// ═══════════════════════════════════════════════════════

function convertBudget() {
  const input = document.getElementById('budget');
  const select = document.getElementById('budgetCurrency');
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0 || !exchangeRates.EUR) return;

  const oldCur = select.dataset.lastCurrency || 'Ar';
  const newCur = select.value;
  if (oldCur === newCur) return;

  const rateMap = { Ar: 1, EUR: exchangeRates.EUR, USD: exchangeRates.USD };
  const oldRate = rateMap[oldCur] || 1;
  const newRate = rateMap[newCur] || 1;

  const arValue = amount * oldRate;
  const converted = Math.round(arValue / newRate);

  input.value = converted;
  select.dataset.lastCurrency = newCur;
}

function initBudgetCurrencyConversion() {
  const select = document.getElementById('budgetCurrency');
  if (select) {
    select.addEventListener('change', convertBudget);
  }
}

// ═══════════════════════════════════════════════════════
// COOKIE CONSENT
// ═══════════════════════════════════════════════════════

function initCookieConsent() {
  const banner = document.getElementById('cookieConsent');
  if (!banner) return;
  const consent = localStorage.getItem('gaConsent');
  if (consent === 'accepted' || consent === 'refused') {
    banner.style.display = 'none';
    return;
  }
  setTimeout(function () { banner.classList.add('show'); }, 500);
  document.getElementById('cookieAccept').addEventListener('click', function () {
    localStorage.setItem('gaConsent', 'accepted');
    banner.classList.remove('show');
    setTimeout(function () { banner.style.display = 'none'; }, 400);
    if (typeof window.initGA === 'function') window.initGA();
  });
  document.getElementById('cookieRefuse').addEventListener('click', function () {
    localStorage.setItem('gaConsent', 'refused');
    banner.classList.remove('show');
    setTimeout(function () { banner.style.display = 'none'; }, 400);
  });
}

// ═══════════════════════════════════════════════════════
// SSE — Live refresh when admin updates content
// ═══════════════════════════════════════════════════════

const EVENT_MAP = {
  'team': loadTeam,
  'services': loadServices,
  'projects': () => { loadProjects(); refreshProjectMap(); },
  'products': loadProducts,
  'blog': loadBlog,
  'blog-categories': loadBlogCategories,
  'pricing': loadPricingData,
  'config': loadConfigData,
  'dossiers': loadDossiers,
  'images': () => { loadImageSlots(); refreshProjectMap(); }
};

let sseReconnectTimer = null;

function initSSE() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  if (typeof EventSource === 'undefined') return;

  const es = new EventSource(`${API_BASE}/api/events`);

  es.addEventListener('open', () => {
    console.info('[SSE] connected');
  });

  for (const [eventName, handler] of Object.entries(EVENT_MAP)) {
    es.addEventListener(eventName, () => { handler(); });
  }

  es.addEventListener('error', () => {
    if (es.readyState === EventSource.CLOSED) {
      console.warn('[SSE] disconnected, retry in 5s');
      es.close();
      sseReconnectTimer = setTimeout(initSSE, 5000);
    }
  });
}

initSSE();
