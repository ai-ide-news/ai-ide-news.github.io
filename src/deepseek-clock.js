// Direct DeepSeek API rates, checked 2026-11-10:
// https://api-docs.deepseek.com/quick_start/pricing/
export const DEEPSEEK_PRICING = {
  checked: '2026-11-10', source: 'https://api-docs.deepseek.com/quick_start/pricing/',
  models: [
    { name: 'DeepSeek Flash', id: 'deepseek-flash', off: [0.003, 0.15, 0.6], peak: [0.006, 0.3, 1.2] },
    { name: 'DeepSeek V4 Pro', id: 'deepseek-v4-pro', off: [0.022, 0.66, 1.98], peak: [0.044, 1.32, 3.96] },
  ],
};

// China State Council holiday schedules (make-up working weekends remain off-peak):
// https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202511/t20251104_4258838.html
// https://www.forestry.gov.cn/lyj/1/szxx/20261105/695102.html
const HOLIDAYS = {
  2026: [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'], ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']],
  2027: [['01-01', '01-03'], ['02-05', '02-13'], ['04-03', '04-05'], ['05-01', '05-05'], ['06-09', '06-09'], ['09-15', '09-15'], ['10-01', '10-07']],
};
const HOUR = 3600000;

export function deepseekPeriod(now = Date.now()) {
  const date = new Date(now);
  const china = new Date(now + 8 * HOUR);
  const year = china.getUTCFullYear();
  if (!HOLIDAYS[year]) return 'unknown';
  const day = china.toISOString().slice(5, 10);
  const holiday = HOLIDAYS[year].some(([from, to]) => day >= from && day <= to);
  const weekday = china.getUTCDay();
  const hour = date.getUTCHours();
  return !holiday && weekday !== 0 && weekday !== 6 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)) ? 'peak' : 'off';
}

export function deepseekClock(now = Date.now()) {
  const period = deepseekPeriod(now);
  if (period === 'unknown') return { period, next: null };
  // All rate changes fall on whole hours. Search across weekends and extended holidays.
  for (let next = Math.floor(now / HOUR) * HOUR + HOUR; next <= now + 16 * 24 * HOUR; next += HOUR) {
    const future = deepseekPeriod(next);
    if (future === 'unknown') return { period, next: null };
    if (future !== period) return { period, next };
  }
  return { period, next: null };
}

export function countdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ''}${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function initDeepseekClock() {
  const card = document.getElementById('deepseek-clock');
  if (!card) return;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dateTime = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const time = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const text = (selector, value) => { const el = card.querySelector(selector); if (el.textContent !== value) el.textContent = value; };
  let previousPeriod;
  const tick = () => {
    const now = Date.now();
    const { period, next } = deepseekClock(now);
    card.dataset.period = period;
    text('[data-ds-status]', period === 'off' ? 'Off-peak · 50% lower rates' : period === 'peak' ? 'Peak pricing' : 'Schedule needs an update');
    text('[data-ds-countdown]', next ? countdown(next - now) : '—');
    text('[data-ds-next]', next ? `${period === 'off' ? 'Peak' : 'Off-peak'} pricing starts ${dateTime.format(next)}` : 'Check the official pricing page for the next rate change.');
    text('[data-ds-zone]', `Your time zone: ${zone}`);
    // Use today's UTC windows so local DST conversion matches the visitor's current date.
    const midnight = Math.floor(now / (24 * HOUR)) * 24 * HOUR;
    const windows = [[1, 4], [6, 10]].map(([a, b]) => `${time.format(midnight + a * HOUR)}–${time.format(midnight + b * HOUR)}`).join(' and ');
    text('[data-ds-local]', `Peak windows in your time zone: ${windows}. Weekday and holiday eligibility follows the China calendar.`);
    if (period !== previousPeriod) {
      card.querySelectorAll('[data-ds-rate]').forEach((el) => {
        const model = DEEPSEEK_PRICING.models.find((m) => m.id === el.dataset.model);
        el.textContent = period === 'unknown' ? '—' : `$${model[period][Number(el.dataset.dsRate)]}`;
      });
      previousPeriod = period;
    }
  };
  tick();
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

if (typeof document !== 'undefined') initDeepseekClock();
