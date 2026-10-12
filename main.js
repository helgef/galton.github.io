document.addEventListener('click', function(event) {
  if (event.target.closest('#newsletter')) return;

  const main = document.querySelector('main');
  const comingSoon = document.getElementById('coming-soon');

  if (!main.classList.contains('hidden')) {
    main.classList.add('hidden');
    comingSoon.classList.add('visible');
  }
});
