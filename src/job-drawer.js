import { el, formatStamp, labelOrUnknown, safeHttps, toast, toastUndo } from './dom.js';
import { backIf, pushJob } from './history.js';
import { icon } from './icons.js';
import { contactsSection, factsSection, travelSection } from './drawer-sections.js';
import { jobPlace, noteListDirty, renderResults, toggleCompare } from './job-list.js';
import { criterionValue, scoreNode } from './score.js';
import { statusControl } from './status-control.js';
import { ensureJob, peekJob, save, store, uid } from './store.js';

export const setBackgroundInert = (on) => {
  document.body.classList.toggle('drawer-open', on);
  document.querySelectorAll('body > *:not(#drawer-root):not(#toast)').forEach((node) => {
    node.inert = on;
  });
};
export const trapFocus = (event) => {
  const drawer = document.getElementById('drawer');
  if (!drawer) return;
  const nodes = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter((node) => node.getClientRects().length);
  const toastButton = document.querySelector('#toast.is-on button:not([disabled])');
  if (toastButton && toastButton.getClientRects().length) nodes.push(toastButton);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const before = nodes[nodes.length - 2];
  const active = document.activeElement;
  if (!event.shiftKey && toastButton && active === before) {
    event.preventDefault();
    toastButton.focus();
  } else if (event.shiftKey ? active === first : active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === toastButton && before) {
    event.preventDefault();
    before.focus();
  }
};
const clearRating = (jobId, criterionId) => {
  const record = ensureJob(jobId);
  const previous = record.ratings[criterionId];
  delete record.ratings[criterionId];
  save();
  refreshDrawer();
  noteListDirty();
  toastUndo('הדירוג נוקה', () => {
    if (previous !== undefined) ensureJob(jobId).ratings[criterionId] = previous;
    save();
    noteListDirty();
    if (store.openJobId === jobId) refreshDrawer();
  });
};
const chooseStar = (jobId, criterionId, star, focusId) => {
  ensureJob(jobId).ratings[criterionId] = star;
  save();
  refreshDrawer(focusId);
  noteListDirty();
};
const moveStar = (event, jobId, criterionId) => {
  if (event.target.getAttribute('role') !== 'radio') return;
  const step = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const radios = [...event.currentTarget.querySelectorAll('[role="radio"]')];
  const index = radios.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next = radios[(index + step + radios.length) % radios.length];
  chooseStar(jobId, criterionId, Number(next.dataset.star), next.id);
};
export const paintDrawer = () => {
  const job = store.jobsById.get(store.openJobId);
  const root = document.getElementById('drawer-root');
  if (!job || !root) return;
  const user = peekJob(job.id);
  const url = safeHttps(job.url);
  const backdrop = el('button', {
    type: 'button',
    class: 'backdrop',
    tabindex: '-1',
    'aria-label': 'סגירת הפרטים',
    on: { click: () => closeJob() },
  });
  const body = el('div', { class: 'drawer-body' });
  const actions = el('div', { class: 'drawer-actions' }, [
    el('button', {
      type: 'button',
      class: 'btn',
      id: 'drawer-close',
      on: { click: () => closeJob() },
    }, [icon('x'), 'סגירה']),
    el('button', {
      type: 'button',
      class: `btn fav${user.favorite ? ' is-on' : ''}`,
      id: 'drawer-favorite',
      'aria-pressed': user.favorite ? 'true' : 'false',
      'aria-label': `מועדף: ${job.title || job.role} – ${job.authority}`,
      on: { click: () => {
        ensureJob(job.id).favorite = !ensureJob(job.id).favorite;
        save();
        refreshDrawer('drawer-favorite');
        noteListDirty();
      }},
    }, [icon(user.favorite ? 'heart-fill' : 'heart'), 'מועדף']),
    el('button', {
      type: 'button',
      class: `btn${store.state.compareIds.includes(job.id) ? ' is-on' : ''}`,
      id: 'drawer-compare',
      'aria-pressed': store.state.compareIds.includes(job.id) ? 'true' : 'false',
      on: { click: () => {
        const next = !store.state.compareIds.includes(job.id);
        if (!toggleCompare(job.id, next)) return;
        noteListDirty();
        refreshDrawer('drawer-compare');
      }},
    }, [
      icon(store.state.compareIds.includes(job.id) ? 'check' : 'columns-3', 'sm'),
      store.state.compareIds.includes(job.id) ? 'בהשוואה' : 'להשוואה',
    ]),
  ]);
  const head = el('div', { class: 'drawer-head' }, [
    el('h2', { id: 'drawer-title', text: job.title || job.role }),
    el('p', { class: 'muted', text: `${job.authority} · ${labelOrUnknown(job.district)} · ${labelOrUnknown(job.authorityType)}` }),
    (() => {
      const score = scoreNode(job);
      score.classList.add('score--lg');
      score.insertBefore(el('span', { class: 'ds-label', text: 'ציון משוקלל' }), score.querySelector('span'));
      return score;
    })(),
    url ? el('a', {
      class: 'btn primary',
      id: 'source-link',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, [icon('external-link', 'sm'), 'למודעה המקורית']) : el('p', { text: 'אין קישור למודעה' }),
  ]);

  body.append(el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: 'סטטוס' }),
    statusControl(user.status, (name) => {
      ensureJob(job.id).status = name;
      save();
      noteListDirty();
    }),
  ]));

  const weightTotal = store.state.criteria.reduce((sum, item) => sum + (item.type === 'text' ? 0 : Number(item.weight) || 0), 0);
  store.state.criteria.forEach((criterion) => {
    const result = criterionValue(job, criterion);
    const raw = user.ratings[criterion.id];
    let control = null;
    if (criterion.type === 'rating') {
      const group = el('div', {
        class: 'stars',
        role: 'radiogroup',
        'aria-label': criterion.name,
        on: { keydown: (event) => moveStar(event, job.id, criterion.id) },
      });
      for (let star = 1; star <= 5; star += 1) {
        const id = `star-${criterion.id}-${star}`;
        const selected = raw === star;
        group.append(el('button', {
          type: 'button',
          class: `star${typeof raw === 'number' && raw >= star ? ' is-on' : ''}`,
          id,
          role: 'radio',
          tabindex: (selected || (typeof raw !== 'number' && star === 1)) ? '0' : '-1',
          'aria-checked': selected ? 'true' : 'false',
          'aria-label': `${star} מתוך 5`,
          data: { star },
          text: '★',
          on: { click: () => chooseStar(job.id, criterion.id, star, id) },
        }));
      }
      group.append(el('button', {
        type: 'button',
        class: 'text-btn',
        text: 'ניקוי דירוג',
        'aria-label': `ניקוי דירוג ${criterion.name}`,
        on: { click: () => clearRating(job.id, criterion.id) },
      }));
      control = group;
    } else if (criterion.type === 'yesno') {
      const group = el('div', { class: 'yesno', role: 'radiogroup', 'aria-label': criterion.name });
      [['כן', true], ['לא', false]].forEach(([label, flag]) => {
        group.append(el('button', {
          type: 'button',
          class: `btn${raw === flag ? ' primary' : ''}`,
          'aria-pressed': raw === flag ? 'true' : 'false',
          text: label,
          on: { click: () => {
            ensureJob(job.id).ratings[criterion.id] = flag;
            save();
            refreshDrawer();
            noteListDirty();
          }},
        }));
      });
      group.append(el('button', {
        type: 'button',
        class: 'text-btn',
        text: 'ניקוי דירוג',
        on: { click: () => clearRating(job.id, criterion.id) },
      }));
      control = group;
    } else if (criterion.type === 'travel') {
      if (!store.state.home) control = el('p', { text: 'הגדירו כתובת בית לציון אוטומטי' });
      else {
        const scale = el('div', { class: 'scale is-auto', 'aria-label': 'ציון מרחק אוטומטי' });
        const value = result.value == null ? 0 : Math.round(Number(result.value));
        for (let step = 1; step <= 5; step += 1) {
          const on = value > 0 && step <= value;
          scale.append(el('span', { class: `sc${on ? ' is-fill' : ''}${step === value ? ' is-sel' : ''}`, text: String(step) }));
        }
        control = scale;
      }
    }
    const notes = el('textarea', {
      id: `notes-${criterion.id}`,
      value: user.criterionNotes[criterion.id] || '',
      on: { input: (event) => {
        ensureJob(job.id).criterionNotes[criterion.id] = event.target.value;
        save();
      }},
    });
    body.append(el('section', { class: 'criterion' }, [
      el('div', { class: 'criterion-head' }, [
        el('h3', { text: criterion.name }),
        criterion.type === 'text' ? el('span', { class: 'muted', text: 'לא נכלל בציון' }) : el('span', { class: 'muted', text: `משקל ${weightTotal ? Math.round((Number(criterion.weight) / weightTotal) * 100) : 0}%` }),
      ]),
      control,
      el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [icon('notebook-pen', 'sm'), 'הערות']), notes]),
    ]));
  });

  body.append(el('label', { class: 'field' }, [
    el('span', { class: 'field-label' }, [icon('notebook-pen', 'sm'), 'הערות כלליות']),
    el('textarea', {
      id: 'general-notes',
      value: user.notes,
      on: { input: (event) => {
        ensureJob(job.id).notes = event.target.value;
        save();
      }},
    }),
  ]));

  const callName = el('input', { id: 'call-name', type: 'text' });
  const callText = el('textarea', { id: 'call-text' });
  const calls = el('div', { id: 'call-log' });
  [...user.callLog].sort((a, b) => String(b.at).localeCompare(String(a.at))).forEach((entry) => {
    calls.append(el('article', { class: 'call' }, [
      el('p', { class: 'muted', text: formatStamp(entry.at) }),
      entry.contactName ? el('p', { text: entry.contactName }) : null,
      el('p', { class: 'pre', text: entry.text }),
      el('button', {
        type: 'button',
        class: 'btn',
        text: 'מחיקת רשומה',
        'aria-label': `מחיקת רשומה ${entry.contactName || ''}`.trim(),
        on: { click: () => {
          const record = ensureJob(job.id);
          const removed = record.callLog.find((item) => item.id === entry.id);
          record.callLog = record.callLog.filter((item) => item.id !== entry.id);
          save();
          refreshDrawer();
          toastUndo('הרשומה נמחקה', () => {
            if (!removed) return;
            ensureJob(job.id).callLog.push({ ...removed });
            save();
            if (store.openJobId === job.id) refreshDrawer();
          });
        }},
      }),
    ]));
  });
  body.append(el('section', { class: 'block' }, [
    el('h3', { text: 'יומן שיחות' }),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'שם איש הקשר' }), callName]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'תוכן השיחה' }), callText]),
    el('button', {
      type: 'button',
      class: 'btn primary',
      id: 'call-add',
      text: 'הוספת רשומה',
      on: { click: () => {
        const text = callText.value.trim();
        const contactName = callName.value.trim();
        if (!text && !contactName) {
          toast('מלאו שם או תוכן ליומן השיחות');
          return;
        }
        ensureJob(job.id).callLog.push({ id: uid(), at: new Date().toISOString(), contactName, text });
        save();
        refreshDrawer();
      }},
    }),
    calls,
  ]));

  body.append(travelSection(job));
  body.append(factsSection(job));
  ['challenge', 'description', 'solution'].forEach((key) => {
    const titles = { challenge: 'האתגר', description: 'תיאור התפקיד', solution: 'כיווני פתרון' };
    if (!job[key]) return;
    body.append(el('section', { class: 'block' }, [
      el('h3', { text: titles[key] }),
      el('p', { class: 'pre', text: job[key] }),
    ]));
  });
  if (store.data.meta && store.data.meta.includeContacts) body.append(contactsSection(job));

  const drawer = el('div', {
    class: 'drawer',
    id: 'drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'drawer-title',
  }, [head, body, actions]);
  root.replaceChildren(backdrop, drawer);
};
export const refreshDrawer = (focusId) => {
  const previous = document.querySelector('.drawer-body');
  const scroll = previous ? previous.scrollTop : 0;
  paintDrawer();
  const next = document.querySelector('.drawer-body');
  if (next) next.scrollTop = scroll;
  if (focusId) {
    const node = document.getElementById(focusId);
    if (node) node.focus();
  }
};
const cardNode = (id, opener) => {
  if (opener instanceof HTMLElement && opener.matches('button.card-open')) return opener;
  return document.querySelector(`button.card-open[data-job="${CSS.escape(id)}"]`);
};
const alignCard = (jobId, savedTop) => {
  const node = jobId ? document.querySelector(`button.card-open[data-job="${CSS.escape(jobId)}"]`) : null;
  if (!node || savedTop == null) return false;
  const delta = node.getBoundingClientRect().top - savedTop;
  if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  return true;
};
export const openJob = (id, opener) => {
  if (!store.jobsById.has(id)) return;
  const card = cardNode(id, opener);
  store.returnFocus = opener instanceof HTMLElement ? opener : null;
  store.returnScroll = window.scrollY;
  store.returnCardTop = card ? card.getBoundingClientRect().top : null;
  store.returnIndex = jobPlace(id);
  store.listDirty = false;
  store.openJobId = id;
  pushJob(id);
  paintDrawer();
  setBackgroundInert(true);
  const close = document.getElementById('drawer-close');
  if (close) close.focus();
};
export const closeJob = () => {
  if (!store.openJobId && !document.getElementById('drawer')) return;
  const jobId = store.openJobId;
  const focus = store.returnFocus;
  const scroll = store.returnScroll || 0;
  const savedTop = store.returnCardTop;
  const previousIndex = store.returnIndex;
  store.openJobId = '';
  store.returnFocus = null;
  store.returnCardTop = null;
  document.getElementById('drawer-root').replaceChildren();
  setBackgroundInert(false);
  if (store.listDirty) {
    store.listDirty = false;
    renderResults();
  }
  if (!backIf('job') && location.hash.startsWith('#job=')) {
    history.replaceState({ bogrim: 'list' }, '', `${location.pathname}${location.search}`);
  }
  const fresh = jobId ? document.querySelector(`button.card-open[data-job="${CSS.escape(jobId)}"]`) : null;
  const target = focus && document.contains(focus) ? focus : fresh;
  if (target) target.focus({ preventScroll: true });
  if (!alignCard(jobId, savedTop)) window.scrollTo({ top: scroll, left: 0, behavior: 'instant' });
  let frames = 4;
  const settle = () => {
    alignCard(jobId, savedTop);
    frames -= 1;
    if (frames > 0) requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
  const nextIndex = jobId ? jobPlace(jobId) : -1;
  if (previousIndex >= 0 && nextIndex >= 0 && nextIndex !== previousIndex) {
    const place = nextIndex + 1;
    toast(nextIndex < previousIndex ? `המשרה עלתה למקום ${place}` : `המשרה ירדה למקום ${place}`, {
      label: 'הצגה',
      run: () => {
        const card = document.querySelector(`button.card-open[data-job="${CSS.escape(jobId)}"]`);
        if (!card) return;
        card.scrollIntoView({ block: 'center' });
        card.focus({ preventScroll: true });
      },
    });
  }
};
