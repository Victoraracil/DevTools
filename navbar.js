async function loadNavbar() {
  try {
    const response = await fetch('navbar.html');
    if (!response.ok) throw new Error('No se pudo cargar la barra de navegación.');
    const html = await response.text();
    document.body.insertAdjacentHTML('afterbegin', html);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'navbar.css';
    document.head.appendChild(link);
  } catch (err) {
    console.error(err);
    const fallback = document.createElement('div');
    fallback.textContent = 'Error cargando la barra de navegación.';
    fallback.style.background = '#f8d7da';
    fallback.style.color = '#842029';
    fallback.style.padding = '0.75rem';
    fallback.style.textAlign = 'center';
    document.body.insertAdjacentElement('afterbegin', fallback);
  }
}

loadNavbar();