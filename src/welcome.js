try {
  const raw = localStorage.getItem('bogrim-jobs.v1');
  const saved = raw ? JSON.parse(raw) : null;
  if (!saved || saved.welcomeSeen !== true) {
    /* first visit keeps the hero already in the page */
  } else {
    const welcome = document.getElementById('welcome');
    const stats = document.getElementById('hero-stats');
    if (welcome) welcome.remove();
    if (stats) stats.remove();
  }
} catch (error) {
  /* unreadable storage keeps the hero */
}
