import { STATUSES, el, statusClass } from './dom.js';

export const statusControl = (current, onChange) => {
  const group = el('div', {
    id: 'job-status',
    class: 'seg-ctl',
    role: 'radiogroup',
    'aria-label': 'סטטוס',
  });
  const choose = (name, focus) => {
    onChange(name);
    [...group.querySelectorAll('[role="radio"]')].forEach((node) => {
      const on = node.dataset.status === name;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
      node.tabIndex = on ? 0 : -1;
      if (on && focus) node.focus();
    });
  };
  STATUSES.forEach((name) => {
    const on = name === current;
    group.append(el('button', {
      type: 'button',
      class: `seg-opt ${statusClass(name)}${on ? ' is-on' : ''}`,
      role: 'radio',
      'data-status': name,
      'aria-checked': on ? 'true' : 'false',
      tabindex: on ? '0' : '-1',
      on: { click: () => choose(name, false) },
    }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), name]));
  });
  group.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const radios = [...group.querySelectorAll('[role="radio"]')];
    const index = radios.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = radios[(index + step + radios.length) % radios.length];
    choose(next.dataset.status, true);
  });
  return group;
};
