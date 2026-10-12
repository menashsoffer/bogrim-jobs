const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const cards = () => [...document.querySelectorAll('button.card-open')];
const quantize = (value) => (value == null ? null : Math.round(value * 10) / 10);

export const layoutSample = (node) => ({
  scrollHeight: document.scrollingElement.scrollHeight,
  anchorTop: node && node.isConnected ? node.getBoundingClientRect().top : null,
});

// Two consecutive frames with the same scroll height and anchor top. Gives up
// after budgetMs so a card that keeps resizing cannot hold the close path.
export const whenLayoutSettles = async (node, budgetMs = 500) => {
  const start = performance.now();
  let previous = null;
  while (performance.now() - start < budgetMs) {
    const sample = layoutSample(node);
    const same = previous
      && previous.scrollHeight === sample.scrollHeight
      && quantize(previous.anchorTop) === quantize(sample.anchorTop);
    if (same) return sample;
    previous = sample;
    await frame();
  }
  return layoutSample(node);
};

const anchorFor = (jobId, previousIndex) => {
  const list = cards();
  if (previousIndex < 0) return null;
  const current = list.findIndex((node) => node.dataset.job === jobId);
  if (current === previousIndex) return list[current] || null;
  return list[previousIndex] || null;
};

let pending = Promise.resolve();
export const scrollRestoreDone = () => pending;

export const centerCard = async (index) => {
  const card = document.querySelectorAll('button.card-open')[index];
  card.scrollIntoView({ block: 'center' });
  await whenLayoutSettles(card);
  return card.getBoundingClientRect().top;
};
export const cardDrift = async (index, top) => {
  await pending;
  const card = document.querySelectorAll('button.card-open')[index];
  await whenLayoutSettles(card);
  return Math.abs(card.getBoundingClientRect().top - top);
};
export const parkAndOpen = async (id) => {
  await document.fonts.ready;
  const card = [...document.querySelectorAll('button.card-open')].find((node) => node.dataset.job === id);
  card.scrollIntoView({ block: 'center' });
  await whenLayoutSettles(card);
  const list = [...document.querySelectorAll('button.card-open')];
  const place = list.findIndex((node) => node.dataset.job === id);
  const top = list[place].getBoundingClientRect().top;
  const scrollY = window.scrollY;
  list[place].click();
  return { top, index: place, scrollY };
};
export const restoredAnchor = async (id, index) => {
  await document.fonts.ready;
  await pending;
  const anchor = [...document.querySelectorAll('button.card-open')][index] || null;
  await whenLayoutSettles(anchor);
  const fresh = [...document.querySelectorAll('button.card-open')];
  const held = fresh[index];
  return {
    anchorTop: held ? held.getBoundingClientRect().top : null,
    scrollY: window.scrollY,
    cardIndex: fresh.findIndex((node) => node.dataset.job === id),
  };
};

export const restoreAnchor = ({ jobId, previousIndex, savedTop, scroll }) => {
  pending = (async () => {
    const deadline = performance.now() + 500;
    const remaining = () => Math.max(0, deadline - performance.now());
    await whenLayoutSettles(anchorFor(jobId, previousIndex), remaining());
    const anchor = anchorFor(jobId, previousIndex);
    if (!anchor || savedTop == null) {
      window.scrollTo({ top: scroll || 0, left: 0, behavior: 'instant' });
      return;
    }
    const nudge = () => {
      const delta = anchor.getBoundingClientRect().top - savedTop;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
    };
    nudge();
    await whenLayoutSettles(anchor, remaining());
    nudge();
  })();
  return pending;
};
