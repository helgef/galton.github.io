document.addEventListener('click', function() {
  const main = document.querySelector('main');
  const comingSoon = document.getElementById('coming-soon');

  if (!main.classList.contains('hidden')) {
    main.classList.add('hidden');
    comingSoon.classList.add('visible');
  }
});
