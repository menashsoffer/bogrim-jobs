const scored = (criteria) => criteria.filter((criterion) => criterion.type !== 'text');

const weightOf = (value) => {
  const number = Math.round(Number(value) || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
};

const openWeight = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
};

const copyCriterion = (criterion) => ({
  ...criterion,
  weight: criterion.type === 'text' ? 0 : weightOf(criterion.weight),
  locked: criterion.locked === true,
});

const proportionWeight = (criterion, basis) => {
  if (!Array.isArray(basis)) return openWeight(criterion.weight);
  const found = basis.find((item) => item && item.id === criterion.id);
  if (!found) return openWeight(criterion.weight);
  return openWeight(found.weight);
};

const distribute = (recipients, amount) => {
  const shares = new Map();
  const total = Math.max(0, Math.round(amount));
  if (!recipients.length || total === 0) {
    recipients.forEach((criterion) => shares.set(criterion.id, 0));
    return shares;
  }
  const base = recipients.reduce((sum, criterion) => sum + openWeight(criterion.weight), 0);
  const parts = recipients.map((criterion, index) => {
    const exact = base === 0 ? total / recipients.length : (openWeight(criterion.weight) / base) * total;
    const floor = Math.floor(exact);
    return { id: criterion.id, weight: openWeight(criterion.weight), floor, fraction: exact - floor, index };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.floor, 0);
  let guard = parts.length;
  while (leftover > 0 && guard > 0) {
    guard -= 1;
    let best = 0;
    parts.forEach((part, index) => {
      const current = parts[best];
      const largerFraction = part.fraction > current.fraction;
      const sameFraction = part.fraction === current.fraction;
      const largerWeight = part.weight > current.weight;
      const sameWeight = part.weight === current.weight;
      if (largerFraction || (sameFraction && largerWeight) || (sameFraction && sameWeight && part.index < current.index)) best = index;
    });
    parts[best].floor += 1;
    parts[best].fraction = -1;
    leftover -= 1;
  }
  parts.forEach((part) => shares.set(part.id, part.floor));
  return shares;
};

export const redistribute = (criteria, changedId, requestedWeight, options = {}) => {
  const force = options.force === true;
  const basis = options.basis;
  const items = criteria.map(copyCriterion);
  const changed = items.find((item) => item.id === changedId);
  if (!changed || changed.type === 'text') return items;
  const others = scored(items).filter((item) => item.id !== changedId);
  const unlocked = others.filter((item) => !item.locked);
  const recipients = (unlocked.length ? unlocked : (force ? others : [])).map((item) => ({
    ...item,
    weight: proportionWeight(item, basis),
  }));
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
  const items = criteria.map((criterion) => ({
    ...criterion,
    weight: criterion.type === 'text' ? 0 : openWeight(criterion.weight),
    locked: criterion.locked === true,
  }));
  const weighted = scored(items);
  const sum = weighted.reduce((total, item) => total + item.weight, 0);
  const already = sum === 100 && weighted.every((item) => Number.isInteger(item.weight) && item.weight <= 100);
  if (!weighted.length || already) return items;
  const shares = distribute(weighted, 100);
  return items.map((item) => (shares.has(item.id) ? { ...item, weight: shares.get(item.id) } : item));
};
