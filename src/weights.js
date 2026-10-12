const scored = (criteria) => criteria.filter((criterion) => criterion.type !== 'text');

const weightOf = (value) => {
  const number = Math.round(Number(value) || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
};

const copyCriterion = (criterion) => ({
  ...criterion,
  weight: criterion.type === 'text' ? 0 : weightOf(criterion.weight),
  locked: criterion.locked === true,
});

const distribute = (recipients, amount) => {
  const shares = new Map();
  const total = Math.max(0, Math.round(amount));
  if (!recipients.length || total === 0) {
    recipients.forEach((criterion) => shares.set(criterion.id, 0));
    return shares;
  }
  const base = recipients.reduce((sum, criterion) => sum + criterion.weight, 0);
  const parts = recipients.map((criterion) => {
    const exact = base === 0 ? total / recipients.length : (criterion.weight / base) * total;
    return { id: criterion.id, weight: criterion.weight, floor: Math.floor(exact) };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.floor, 0);
  let largest = 0;
  parts.forEach((part, index) => {
    if (part.weight > parts[largest].weight) largest = index;
  });
  if (leftover > 0) parts[largest].floor += leftover;
  parts.forEach((part) => shares.set(part.id, part.floor));
  return shares;
};

export const redistribute = (criteria, changedId, requestedWeight, options = {}) => {
  const force = options.force === true;
  const items = criteria.map(copyCriterion);
  const changed = items.find((item) => item.id === changedId);
  if (!changed || changed.type === 'text') return items;
  const others = scored(items).filter((item) => item.id !== changedId);
  const unlocked = others.filter((item) => !item.locked);
  const recipients = unlocked.length ? unlocked : (force ? others : []);
  if ((changed.locked && !force) || !recipients.length) return items;
  const recipientIds = new Set(recipients.map((item) => item.id));
  const lockedSum = others.reduce((sum, item) => sum + (recipientIds.has(item.id) ? 0 : item.weight), 0);
  const next = Math.max(0, Math.min(100 - lockedSum, weightOf(requestedWeight)));
  const shares = distribute(recipients, 100 - lockedSum - next);
  return items.map((item) => {
    if (item.id === changedId) return { ...item, weight: next };
    if (!shares.has(item.id)) return item;
    return { ...item, weight: shares.get(item.id) };
  });
};

export const sliderBounds = (criteria, id) => {
  const items = criteria.map(copyCriterion);
  const changed = items.find((item) => item.id === id);
  if (!changed || changed.type === 'text') return { min: 0, max: 0, disabled: true };
  const others = scored(items).filter((item) => item.id !== id);
  const unlocked = others.filter((item) => !item.locked);
  if (changed.locked || !unlocked.length) return { min: changed.weight, max: changed.weight, disabled: true };
  const lockedSum = others.reduce((sum, item) => sum + (item.locked ? item.weight : 0), 0);
  return { min: 0, max: 100 - lockedSum, disabled: false };
};

export const normalizeCriteria = (criteria) => {
  if (!Array.isArray(criteria)) return [];
  const items = criteria.map(copyCriterion);
  const weighted = scored(items);
  const sum = weighted.reduce((total, item) => total + item.weight, 0);
  if (!weighted.length || sum === 100) return items;
  const shares = distribute(weighted, 100);
  return items.map((item) => (shares.has(item.id) ? { ...item, weight: shares.get(item.id) } : item));
};
