import { el, formatDuration, formatScore, labelOrUnknown, toast } from './dom.js';
import { airKm, criterionValue, scoreJob, travelMinutes } from './score.js';
import { rebuildShells } from './shell.js';
import { peekJob, sanitizeState, saveNow, store, validCriterion } from './store.js';

export const download = (filename, text, type) => {
  const blob = new Blob([text], { type });
  const link = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 500);
};
export const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
};
export const exportCsv = () => {
  const headers = ['משרה', 'רשות', 'סוג רשות', 'מחוז', 'תפקיד', 'תחום', 'אוכלוסייה', 'אשכול חברתי-כלכלי', 'מדד פריפריאליות', 'ציון', 'דורג', 'סטטוס', 'מועדף', 'הערות כלליות'];
  store.state.criteria.forEach((criterion) => {
    headers.push(criterion.name);
    if (criterion.type !== 'text') headers.push(`${criterion.name} – הערות`);
  });
  headers.push('דקות נסיעה', 'זמן נסיעה', 'ק"מ קו אווירי', 'קישור');
  const lines = [headers.map(csvCell).join(',')];
  store.jobs.forEach((job) => {
    const user = peekJob(job.id);
    const scored = scoreJob(job);
    const cells = [
      job.title, job.authority, labelOrUnknown(job.authorityType), labelOrUnknown(job.district), job.role,
      (job.categories || []).join('; '), labelOrUnknown(job.population), labelOrUnknown(job.socioEconomic),
      labelOrUnknown(job.peripherality), scored.score == null ? '' : formatScore(scored.score),
      `${scored.rated}/${scored.total}`, user.status, user.favorite ? 'כן' : '', user.notes,
    ];
    store.state.criteria.forEach((criterion) => {
      const result = criterionValue(job, criterion);
      const note = user.criterionNotes[criterion.id] || '';
      if (criterion.type === 'text') cells.push(note);
      else {
        let value = '';
        if (criterion.type === 'yesno' && result.value === 5) value = 'כן';
        else if (criterion.type === 'yesno' && result.value === 1) value = 'לא';
        else if (result.value != null) value = String(result.value);
        cells.push(value, note);
      }
    });
    const minutes = travelMinutes(job);
    cells.push(
      minutes == null ? '' : String(minutes),
      minutes == null ? '' : formatDuration(minutes),
      airKm(job) == null ? '' : String(Math.round(airKm(job) * 10) / 10),
      job.url,
    );
    lines.push(cells.map(csvCell).join(','));
  });
  download('bogrim-jobs.csv', `\ufeff${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  toast('קובץ ה-CSV ירד');
};
export const exportJson = () => {
  const state = { ...store.state };
  delete state.routingKey;
  const payload = { app: 'bogrim-jobs', version: 1, exportedAt: new Date().toISOString(), state };
  download('bogrim-jobs-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('קובץ ה-JSON ירד');
};
export const validImport = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.jobs || typeof value.jobs !== 'object' || Array.isArray(value.jobs)) return false;
  if (!Array.isArray(value.criteria) || !value.criteria.every(validCriterion)) return false;
  return true;
};
export const importText = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    toast('הקובץ אינו גיבוי תקין. הנתונים הקיימים נשמרו.');
    return;
  }
  const incoming = parsed && parsed.state ? parsed.state : parsed;
  if (!validImport(incoming)) {
    toast('הקובץ אינו גיבוי תקין. הנתונים הקיימים נשמרו.');
    return;
  }
  if (!window.confirm('ייבוא יחליף את הנתונים השמורים בדפדפן. להמשיך?')) return;
  store.state = sanitizeState(incoming);
  store.state.compareIds = store.state.compareIds.filter((id) => store.jobsById.has(id));
  saveNow();
  rebuildShells();
  toast('הנתונים יובאו');
};
