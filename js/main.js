/* ========================================
   Josh Designs Portfolio - Main JavaScript
   Vanilla JS only - no frameworks
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
  
  // Mobile Menu Toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function() {
      navLinks.classList.toggle('active');
      const isExpanded = navLinks.classList.contains('active');
      menuToggle.setAttribute('aria-expanded', isExpanded);
    });
  }
  
  // Project Filters
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      const filter = this.getAttribute('data-filter');
      
      projectCards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.style.display = 'block';
          // Subtle fade in
          card.style.opacity = '0';
          setTimeout(() => {
            card.style.opacity = '1';
            card.style.transition = 'opacity 0.3s ease';
          }, 10);
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
  
  // Lazy loading for images (native + fallback)
  if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
      img.src = img.dataset.src || img.src;
    });
  } else {
    // Fallback for older browsers
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
    document.body.appendChild(script);
  }
  
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
  
  // Simple lightbox for project galleries
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.querySelector('.lightbox-close');

  document.querySelectorAll('.lightbox-trigger').forEach(img => {
    img.addEventListener('click', function() {
      if (lightbox && lightboxImg) {
        lightboxImg.src = this.dataset.full || this.src;
        lightboxImg.alt = this.alt || '';
        lightbox.hidden = false;
        lightboxClose.focus();
      }
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => { if (lightbox) lightbox.hidden = true; });
  }
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.hidden = true;
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && !lightbox.hidden) lightbox.hidden = true;
  });

  // Contact forms: AJAX when fetch exists, native POST otherwise.
  document.querySelectorAll('form.contact-form').forEach(function (form) {
    const status = form.querySelector('[data-form-status]');
    const submitButton = form.querySelector('[type="submit"]');
    const successText = form.getAttribute('data-success') || 'Thanks. Your message was sent.';
    const errorText = form.getAttribute('data-error') || 'The message could not be sent. Please try again.';

    function setStatus(state, message) {
      if (!status) return;
      if (!state) {
        status.textContent = '';
        status.removeAttribute('data-state');
        return;
      }
      status.dataset.state = state;
      status.textContent = message;
      status.focus();
    }

    form.addEventListener('submit', function (event) {
      const gotcha = form.querySelector('[name="_gotcha"]');
      if (gotcha && gotcha.value.trim() !== '') {
        event.preventDefault();
        form.reset();
        setStatus('success', successText);
        return;
      }

      if (typeof window.fetch !== 'function') return;

      event.preventDefault();
      const formData = new FormData(form);
      if (submitButton) submitButton.disabled = true;
      setStatus('', '');

      fetch(form.action, {
        method: (form.method || 'POST').toUpperCase(),
        body: formData,
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (response.ok) {
          form.reset();
          setStatus('success', successText);
          return;
        }
        return response.json().then(function (data) {
          let message = errorText;
          if (data && Array.isArray(data.errors) && data.errors.length) {
            message = data.errors.map(function (err) { return err && err.message; }).filter(Boolean).join(' ');
          } else if (data && typeof data.error === 'string' && data.error) {
            message = data.error;
          }
          setStatus('error', message || errorText);
        }).catch(function () {
          setStatus('error', errorText);
        });
      }).catch(function () {
        setStatus('error', errorText);
      }).finally(function () {
        if (submitButton) submitButton.disabled = false;
      });
    });
  });

});
