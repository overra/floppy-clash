/** PLAN: screen-space scoreboard stays in the DOM; M5 asks for scoreboard art. */

export const SEAT_HEX = ['#f2c14e', '#4c8dff', '#e85d4c', '#3dcf7a'];

export function scoreboardMarkup(opts: {
  title: string;
  wins: number[];
  firstTo?: number;
}): string {
  const max = Math.max(0, ...opts.wins);
  const rows = [0, 1, 2, 3]
    .map((i) => {
      const w = opts.wins[i] ?? 0;
      const lead = max > 0 && w === max;
      return `<div class="score-row${lead ? ' leader' : ''}" data-seat="${i}">
        <span class="score-name" style="color:${SEAT_HEX[i]}">${lead ? '<span class="crown-mark" aria-hidden="true"></span>' : ''}P${i + 1}</span>
        <span class="score-wins">${w}</span>
      </div>`;
    })
    .join('');
  const sub = opts.firstTo ? `<p class="score-first">first to ${opts.firstTo}</p>` : '';
  return `<div class="scoreboard" data-round-over="1">
    <div class="score-crest" aria-hidden="true"></div>
    <h2>${opts.title}</h2>
    ${sub}
    <div class="score-list">${rows}</div>
  </div>`;
}
