import { el, formatScore } from './dom.js';
import { icon } from './icons.js';
import { openJob } from './job-drawer.js';
import { renderResults, toggleCompare } from './job-list.js';
import { completionText, criterionValue, scoreJob, travelSummary } from './score.js';
import { peekJob, store } from './store.js';

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
const segs = (score, best) => {
  const row = el('span', { class: 'segs', 'aria-hidden': 'true' });
  for (let index = 1; index <= 5; index += 1) {
    row.append(el('span', { class: score != null && index <= score ? 'seg on' : 'seg' }));
  }
  if (best) row.classList.add('is-best');
  return row;
};
const removeJob = (job) => {
  toggleCompare(job.id, false);
  renderCompare();
  renderResults();
};
export const renderCompare = () => {
  const view = document.getElementById('view-compare');
  const chosen = store.state.compareIds.map((id) => store.jobsById.get(id)).filter(Boolean);
  view.replaceChildren(el('div', { class: 'panel' }, [
    el('h2', { text: 'השוואה' }),
    el('p', { class: 'hint', text: chosen.length < 2 ? 'בחרו לפחות 2 משרות להשוואה, ועד 4.' : `${chosen.length} משרות · עד 4` }),
    chosen.length < 2 ? el('button', {
      type: 'button',
      class: 'btn',
      id: 'compare-back',
      text: 'לרשימת המשרות',
      on: { click: () => {
        const tab = document.querySelector('#nav [data-view="list"]');
        if (tab) tab.click();
      }},
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
    const scored = scoreJob(job);
    mobile.append(el('article', { class: 'cj' }, [
      el('strong', { class: 'cv', text: scored.score == null ? '—' : formatScore(scored.score) }),
      el('div', {}, [
        el('strong', { text: job.title || job.role }),
        el('span', { text: job.authority }),
      ]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': `הסרה מההשוואה: ${job.title || job.role}`, on: { click: () => removeJob(job) } }, [icon('x', 'sm')]),
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
        return el('div', { class: win ? 'cr-row cv is-best' : 'cr-row cv' }, [
          el('span', { text: job.authority }),
          el('span', { class: value.score == null ? 'cv is-muted' : '' }, [
            value.text,
            value.score != null ? segs(value.score, win) : null,
          ]),
        ]);
      }),
    ]));
  });
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: '' }), ...chosen.map((job) => el('th', { scope: 'col' }, [
    el('span', { text: job.title || job.role }),
    el('button', { type: 'button', class: 'btn', text: 'הסרה', on: { click: () => removeJob(job) } }),
    el('button', { type: 'button', class: 'btn', text: 'פרטים', on: { click: (event) => openJob(job.id, event.currentTarget) } }),
  ]))]);
  table.append(el('thead', {}, [head]));
  const row = (label, cells) => el('tr', {}, [el('th', { scope: 'row', text: label }), ...cells]);
  const body = el('tbody');
  body.append(row('ציון', chosen.map((job) => {
    const scored = scoreJob(job);
    return el('td', { text: scored.score == null ? (scored.total ? 'טרם דורג' : '—') : formatScore(scored.score) });
  })));
  body.append(row('השלמה', chosen.map((job) => {
    const scored = scoreJob(job);
    const text = scored.partial ? `${completionText(scored)} חלקי` : completionText(scored);
    return el('td', { text, title: scored.partial ? 'חסרים דירוגים' : null });
  })));
  store.state.criteria.forEach((criterion) => {
    body.append(row(criterion.name, chosen.map((job) => {
      const value = cellValue(job, criterion);
      return el('td', {}, [el('span', { text: value.text }), value.note && criterion.type !== 'text' ? el('div', { class: 'muted', text: value.note }) : null]);
    })));
  });
  body.append(row('סטטוס', chosen.map((job) => el('td', { text: peekJob(job.id).status }))));
  body.append(row('נסיעה', chosen.map((job) => el('td', { text: travelSummary(job) || '—' }))));
  body.append(row('רשות', chosen.map((job) => el('td', { text: job.authority }))));
  table.append(body);
  view.append(mobile, el('div', { class: 'cmp-d table-scroll' }, [table]));
};
