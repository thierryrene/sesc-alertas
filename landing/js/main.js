// Scroll-reveal com IntersectionObserver
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      const delay = entry.target.dataset.delay || 0;
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, delay * 150);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el, i) => {
  revealObserver.observe(el);
});

// Navbar: adiciona fundo ao fazer scroll
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    navbar.classList.add('bg-gray-950/90', 'backdrop-blur-lg', 'border-b', 'border-gray-900');
  } else {
    navbar.classList.remove('bg-gray-950/90', 'backdrop-blur-lg', 'border-b', 'border-gray-900');
  }
});

// Contador animado de eventos (Hero)
function animateCounter(el, target, duration = 1600) {
  const startTime = performance.now();
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Easing: ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(eased * target);
    el.textContent = value.toLocaleString('pt-BR') + '+';
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// Dispara o contador quando o hero entra na viewport
const counterEl = document.getElementById('counter-events');
if (counterEl) {
  const counterObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      animateCounter(counterEl, 350);
      counterObserver.disconnect();
    }
  }, { threshold: 0.5 });
  counterObserver.observe(counterEl);
}

// Smooth scroll para links internos
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
