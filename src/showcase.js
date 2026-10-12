// Authorities that will present the role at the showcase day. Names match the catalog's `authority` field.
// "חכ"ל יהודה" has no matching authority in the catalog, so it is left out until a name shows up there.
const SHOWCASE = new Set([
  'חורה', 'הר חברון', 'אריאל', 'אשכול השרון', 'בת ים', 'כפר ברא', 'קרית יערים', 'אופקים', 'גדרה',
  'שער הנגב', 'קרית גת', 'אפרתה', 'ירוחם', 'אשדוד', 'נווה מדבר', 'מרחבים', 'אור יהודה', 'גבעת זאב',
  'ירושלים', 'רמלה', 'שדרות', 'חבל אילות',
]);

export const isShowcase = (authority) => SHOWCASE.has(authority);
export const SHOWCASE_LABEL = 'יום הצגה';
export const SHOWCASE_HINT = 'הרשות תציג את התפקיד ביום ההצגה';
