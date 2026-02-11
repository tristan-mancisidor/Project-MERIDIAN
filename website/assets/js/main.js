/* ==========================================================================
   Meridian Wealth Advisors - Main JavaScript
   ========================================================================== */

(function () {
  'use strict';

  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function () {
      const expanded = navLinks.classList.toggle('nav-links--open');
      menuToggle.setAttribute('aria-expanded', expanded);
    });
  }

  // Sticky header shadow on scroll
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('site-header--scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // FAQ accordion toggle
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = this.closest('.faq-item');
      var answer = item.querySelector('.faq-answer');
      var isOpen = item.classList.contains('faq-item--open');

      // Close all other items
      document.querySelectorAll('.faq-item--open').forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove('faq-item--open');
          openItem.querySelector('.faq-answer').style.maxHeight = null;
        }
      });

      if (isOpen) {
        item.classList.remove('faq-item--open');
        answer.style.maxHeight = null;
      } else {
        item.classList.add('faq-item--open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // Contact form validation
  var contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = true;

      // Clear previous errors
      contactForm.querySelectorAll('.invalid').forEach(function (el) {
        el.classList.remove('invalid');
      });
      contactForm.querySelectorAll('.form-error').forEach(function (el) {
        el.classList.remove('visible');
      });

      // Required fields
      var requiredFields = contactForm.querySelectorAll('[required]');
      requiredFields.forEach(function (field) {
        if (!field.value.trim()) {
          valid = false;
          field.classList.add('invalid');
          var error = field.parentElement.querySelector('.form-error');
          if (error) {
            error.textContent = 'This field is required.';
            error.classList.add('visible');
          }
        }
      });

      // Email format
      var emailField = contactForm.querySelector('[type="email"]');
      if (emailField && emailField.value.trim()) {
        var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(emailField.value.trim())) {
          valid = false;
          emailField.classList.add('invalid');
          var error = emailField.parentElement.querySelector('.form-error');
          if (error) {
            error.textContent = 'Please enter a valid email address.';
            error.classList.add('visible');
          }
        }
      }

      if (valid) {
        // Show success message (no backend)
        contactForm.innerHTML =
          '<div style="text-align:center; padding: 2rem 0;">' +
          '<h3 style="color: var(--color-navy); margin-bottom: 1rem;">Thank You!</h3>' +
          '<p style="color: var(--color-gray-600);">Your message has been received. ' +
          'We\'ll be in touch within one business day.</p>' +
          '</div>';
      }
    });
  }
})();
