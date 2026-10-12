import { STORAGE_KEY } from './storage-key.js';

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  const saved = raw ? JSON.parse(raw) : null;
  if (saved && saved.welcomeSeen === true) {
    const welcome = document.getElementById('welcome');
    const stats = document.getElementById('hero-stats');
    if (welcome) welcome.remove();
    if (stats) stats.remove();
  }
} catch (error) {
  /* unreadable storage keeps the hero */
}
