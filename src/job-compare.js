import { el, formatScore } from './dom.js';
import { openJob } from './job-drawer.js';
import { renderResults, toggleCompare } from './job-list.js';
import { completionText, criterionValue, scoreJob, travelSummary } from './score.js';
import { peekJob, store } from './store.js';

export const renderCompare = () => {
  const view = document.getElementById('view-compare');
  const chosen = store.state.compareIds.map((id) => store.jobsById.get(id)).filter(Boolean);
  view.replaceChildren(el('div', { class: 'panel' }, [
    el('h2', { text: 'השוואה' }),
    el('p', { class: 'hint', text: chosen.length < 2 ? 'בחרו לפחות 2 משרות להשוואה, ועד 4.' : 'עד 4 משרות זו לצד זו.' }),
  ]));
  if (!chosen.length) {
    view.append(el('p', { class: 'empty', text: 'בחרו 2-4 משרות להשוואה' }));
    return;
  }
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: '' }), ...chosen.map((job) => el('th', { scope: 'col' }, [
    el('span', { text: job.title || job.role }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'הסרה',
      on: { click: () => {
        toggleCompare(job.id, false);
        renderCompare();
        renderResults();
      }},
    }),
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'פרטים',
      on: { click: (event) => openJob(job.id, event.currentTarget) },
    }),
  ]))]);
  table.append(el('thead', {}, [head]));
  const row = (label, cells) => el('tr', {}, [el('th', { scope: 'row', text: label }), ...cells]);
  const body = el('tbody');
  body.append(row('ציון', chosen.map((job) => {
    const scored = scoreJob(job);
    return el('td', { text: scored.score == null ? '—' : formatScore(scored.score) });
  })));
  body.append(row('השלמה', chosen.map((job) => {
    const scored = scoreJob(job);
    const text = scored.total ? `${completionText(scored)}${scored.partial ? ' חלקי' : ''}` : completionText(scored);
    return el('td', { text });
  })));
  store.state.criteria.forEach((criterion) => {
    body.append(row(criterion.name, chosen.map((job) => {
      const result = criterionValue(job, criterion);
      const note = peekJob(job.id).criterionNotes[criterion.id] || '';
      let value = 'לא דורג';
      if (criterion.type === 'text') value = note || '—';
      else if (criterion.type === 'yesno' && result.value === 5) value = 'כן';
      else if (criterion.type === 'yesno' && result.value === 1) value = 'לא';
      else if (result.value != null) value = String(result.value);
      return el('td', {}, [el('span', { text: value }), note && criterion.type !== 'text' ? el('div', { class: 'muted', text: note }) : null]);
    })));
  });
  body.append(row('סטטוס', chosen.map((job) => el('td', { text: peekJob(job.id).status }))));
  body.append(row('נסיעה', chosen.map((job) => el('td', { text: travelSummary(job) || '—' }))));
  body.append(row('רשות', chosen.map((job) => el('td', { text: job.authority }))));
  table.append(body);
  view.append(el('div', { class: 'table-scroll' }, [table]));
};
