import { UNKNOWN, el, labelOrUnknown, statusClass } from './dom.js';
import { icon } from './icons.js';
import { openJob, refreshDrawer } from './job-drawer.js';
import { renderResults, toggleCompare } from './job-list.js';
import { completionCompact, scoreJob, scoreNode, travelCard } from './score.js';
import { showcaseBadge } from './showcase.js';
import { ensureJob, peekJob, save, store } from './store.js';

const completionLabel = (scored) => {
  const text = completionCompact(scored);
  const word = 'קריטריונים';
  if (!text.endsWith(word)) return text;
  return el('span', {}, [text.slice(0, -word.length), el('span', { class: 'completion-word', text: word })]);
};
const segments = (scored) => {
  const total = Math.max(scored.total, 1);
  const row = el('span', { class: 'segs', 'aria-hidden': 'true' });
  for (let index = 0; index < total && index < 8; index += 1) {
    row.append(el('i', { class: index < scored.rated ? 'seg on' : 'seg' }));
  }
  return row;
};
export const jobCard = (job) => {
  const user = peekJob(job.id);
  const scored = scoreJob(job);
  const travel = travelCard(job);
  const jobName = `${job.title || job.role} – ${job.authority}`;
  const favLabel = 'מועדף';
  const open = el('button', {
    type: 'button',
    class: 'card-open job-hit',
    'aria-label': `פרטי המשרה: ${jobName}`,
    data: { job: job.id },
    on: { click: () => openJob(job.id, open) },
  });
  const fav = el('button', {
    type: 'button',
    class: `icon-btn fav${user.favorite ? ' is-on' : ''}`,
    'aria-pressed': user.favorite ? 'true' : 'false',
    'aria-label': `${favLabel}: ${jobName}`,
    on: { click: () => {
      const record = ensureJob(job.id);
      record.favorite = !record.favorite;
      save();
      renderResults();
      if (store.openJobId === job.id) refreshDrawer();
    }},
  }, [icon(user.favorite ? 'heart-fill' : 'heart')]);
  const compare = el('input', {
    type: 'checkbox',
    'aria-label': `הוספה להשוואה: ${jobName}`,
  });
  compare.checked = store.state.compareIds.includes(job.id);
  compare.addEventListener('change', () => {
    const ok = toggleCompare(job.id, compare.checked);
    if (!ok) compare.checked = false;
    else renderResults();
  });
  const category = (job.categories && job.categories[0]) || job.role || UNKNOWN;
  const rejected = user.status === 'פסול' ? ' job--no' : '';
  return el('article', { class: `card job${rejected}` }, [
    open,
    el('div', { class: 'job-head' }, [
      el('div', { class: 'job-main' }, [
        el('p', { class: 'job-cat', text: category }),
        el('h3', { class: 'job-title', text: job.role || job.title }),
        el('p', { class: 'job-auth' }, [
          el('strong', { text: job.authority }),
          el('span', { class: 'sep', 'aria-hidden': 'true' }),
          labelOrUnknown(job.authorityType),
          el('span', { class: 'sep', 'aria-hidden': 'true' }),
          labelOrUnknown(job.district),
        ]),
        showcaseBadge(job.authority),
      ]),
      scoreNode(job),
    ]),
    el('dl', { class: 'job-meta' }, [
      el('div', {}, [
        el('dt', {}, [icon('car', 'sm'), 'ברכב']),
        el('dd', { class: 'travel-line', text: travel.text, title: travel.title || null }),
      ]),
      el('div', {}, [
        el('dt', { text: 'דירוג' }),
        el('dd', { class: 'job-done' }, [segments(scored), completionLabel(scored)]),
      ]),
    ]),
    el('div', { class: 'job-foot' }, [
      el('p', { class: statusClass(user.status) }, [
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        user.status,
      ]),
      el('div', { class: 'job-actions' }, [
        fav,
        el('label', { class: `cmp${compare.checked ? ' is-on' : ''}` }, [
          compare,
          icon(compare.checked ? 'check' : 'columns-3', 'sm'),
          compare.checked ? 'בהשוואה' : 'השוואה',
        ]),
      ]),
    ]),
  ]);
};
