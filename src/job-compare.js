import { el, formatScore } from './dom.js';
import { icon } from './icons.js';
import { openJob } from './job-drawer.js';
import { renderResults, toggleCompare } from './job-list.js';
import { completionText, criterionValue, scoreJob, scoreNode, travelSummary } from './score.js';
import { peekJob, save, store } from './store.js';

const weightLabel = (criterion) => {
  const total = store.state.criteria.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const share = total ? Math.round((Number(criterion.weight) / total) * 100) : 0;
  return `משקל ${share}%`;
};
const cellValue = (job, criterion) => {
  const result = criterionValue(job, criterion);
  const note = peekJob(job.id).criterionNotes[criterion.id] || '';
  if (criterion.type === 'text') return { text: note || '—', score: null, note: '' };
  if (criterion.type === 'yesno' && result.value === 5) return { text: 'כן', score: 5, note };
  if (criterion.type === 'yesno' && result.value === 1) return { text: 'לא', score: 1, note };
  if (result.value != null) return { text: String(result.value), score: Number(result.value), note };
  return { text: 'לא דורג', score: null, note };
};
const segs = (score) => {
  const row = el('span', { class: 'segs', 'aria-hidden': 'true' });
  for (let index = 1; index <= 5; index += 1) {
    row.append(el('span', { class: score != null && index <= Math.round(score) ? 'seg on' : 'seg' }));
  }
  return row;
};
const removeJob = (job) => {
  toggleCompare(job.id, false);
  renderCompare();
  renderResults();
};
const marked = (value, win) => el('span', { class: win ? 'cv is-best' : 'cv' }, [
  el('span', { class: value.score == null ? 'cv-num is-muted' : 'cv-num', text: value.text }),
  win ? el('i', { class: 'best-dot', 'aria-hidden': 'true' }) : null,
  value.score != null ? segs(value.score) : null,
]);
const bestScore = (values) => {
  const scores = values.map((value) => value.score).filter((score) => score != null);
  return scores.length ? Math.max(...scores) : null;
};
export const renderCompare = () => {
  const view = document.getElementById('view-compare');
  const chosen = store.state.compareIds.map((id) => store.jobsById.get(id)).filter(Boolean);
  const back = () => {
    const tab = document.querySelector('#nav [data-view="list"]');
    if (tab) tab.click();
  };
  view.replaceChildren(el('header', { class: 'page-head' }, [
    el('h2', { class: 'page-title', text: 'השוואה' }),
    el('p', { class: 'hint', text: chosen.length < 2 ? 'בחרו לפחות 2 משרות להשוואה, ועד 4.' : `${chosen.length} משרות · עד 4` }),
    chosen.length >= 2 ? el('p', { class: 'compare-legend' }, [
      el('i', { class: 'best-dot', 'aria-hidden': 'true' }),
      'הערך הטוב בכל שורה',
    ]) : null,
    chosen.length >= 2 ? el('button', {
      type: 'button',
      class: 'text-btn',
      id: 'compare-clear',
      text: 'ניקוי השוואה',
      on: { click: () => {
        store.state.compareIds = [];
        save();
        renderCompare();
        renderResults();
      }},
    }) : null,
    chosen.length < 2 ? el('button', {
      type: 'button',
      class: 'btn',
      id: 'compare-back',
      text: 'לרשימת המשרות',
      on: { click: back },
    }) : null,
  ]));
  if (chosen.length < 2) {
    view.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'ghost-cols', 'aria-hidden': 'true' }, [
        el('span', { class: 'ghost-col' }),
        el('span', { class: 'ghost-col' }),
        el('span', { class: 'ghost-col is-faint' }),
        el('span', { class: 'ghost-col is-faint' }),
      ]),
      el('img', { class: 'eclipse', src: 'img/eclipse.webp', alt: '', width: '180', height: '180', loading: 'lazy', decoding: 'async' }),
      el('p', { class: 'empty', text: 'בחרו לפחות 2 משרות, ועד 4.' }),
    ]));
    return;
  }
  const mobile = el('div', { class: 'cmp-m' });
  chosen.forEach((job) => {
    const ring = scoreNode(job);
    ring.classList.add('score--sm');
    mobile.append(el('article', { class: 'cj' }, [
      ring,
      el('div', { class: 'cj-main' }, [
        el('strong', { class: 'cj-title', text: job.role || job.title }),
        el('span', { class: 'cj-auth', text: job.authority }),
      ]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': `הסרה מההשוואה: ${job.role || job.title}`, on: { click: () => removeJob(job) } }, [icon('x', 'sm')]),
    ]));
  });
  store.state.criteria.forEach((criterion) => {
    const values = chosen.map((job) => cellValue(job, criterion));
    const scores = values.map((value) => value.score).filter((score) => score != null);
    const best = scores.length ? Math.max(...scores) : null;
    mobile.append(el('section', { class: 'cr' }, [
      el('h3', {}, [criterion.name, el('span', { text: weightLabel(criterion) })]),
      ...chosen.map((job, index) => {
        const value = values[index];
        const win = best != null && value.score === best;
        return el('div', { class: 'cr-row' }, [
          el('span', { class: 'cr-name', text: job.authority }),
          marked(value, win),
        ]);
      }),
    ]));
  });
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: '' }), ...chosen.map((job) => {
    const ring = scoreNode(job);
    ring.classList.add('score--sm');
    return el('th', { scope: 'col' }, [
      el('div', { class: 'ct-job' }, [
        ring,
        el('strong', { text: job.role || job.title }),
        el('span', { text: job.authority }),
        el('p', { class: 'ct-links' }, [
          el('button', { type: 'button', class: 'text-btn', text: 'פרטים', on: { click: (event) => openJob(job.id, event.currentTarget) } }),
          el('span', { 'aria-hidden': 'true', text: '·' }),
          el('button', { type: 'button', class: 'text-btn', text: 'הסרה', on: { click: () => removeJob(job) } }),
        ]),
      ]),
    ]);
  })]);
  table.append(el('thead', {}, [head]));
  const row = (label, cells) => el('tr', {}, [el('th', { scope: 'row', text: label }), ...cells]);
  const body = el('tbody');
  const scoreValues = chosen.map((job) => {
    const scored = scoreJob(job);
    return { text: scored.score == null ? (scored.total ? 'טרם דורג' : '—') : formatScore(scored.score), score: scored.score, note: '' };
  });
  const scoreBest = bestScore(scoreValues);
  body.append(row('ציון', scoreValues.map((value) => el('td', {}, [marked(value, scoreBest != null && value.score === scoreBest)]))));
  body.append(row('השלמה', chosen.map((job) => {
    const scored = scoreJob(job);
    const text = scored.partial ? `${completionText(scored)} חלקי` : completionText(scored);
    return el('td', { text, title: scored.partial ? 'חסרים דירוגים' : null });
  })));
  store.state.criteria.forEach((criterion) => {
    const values = chosen.map((job) => cellValue(job, criterion));
    const best = bestScore(values);
    body.append(row(criterion.name, values.map((value) => el('td', {}, [
      marked(value, best != null && value.score === best),
      value.note && criterion.type !== 'text' ? el('div', { class: 'muted', text: value.note }) : null,
    ]))));
  });
  body.append(row('סטטוס', chosen.map((job) => el('td', { text: peekJob(job.id).status }))));
  body.append(row('נסיעה', chosen.map((job) => el('td', { text: travelSummary(job) || '—' }))));
  body.append(row('רשות', chosen.map((job) => el('td', { text: job.authority }))));
  table.append(body);
  view.append(mobile, el('div', { class: 'cmp-d table-scroll' }, [table]));
};
