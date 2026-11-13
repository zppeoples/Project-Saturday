const apiOrigin = window.PROJECT_SATURDAY_API;
const coachToken = new URLSearchParams(location.hash.slice(1)).get('coach');
const conferences = Object.keys(conf);
// ESPN team directory supplies the marks and school palettes. Dynasty conferences come from league data.
const teamBranding = {
  "Utah": {color: '#be0000', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/254.png'},
  "Mississippi State": {color: '#5d1725', alternate: '#c1c6c8', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/344.png'},
  "Boise State": {color: '#0033a0', alternate: '#d64309', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/68.png'},
  "Arizona State": {color: '#8c1d40', alternate: '#ffc627', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/9.png'},
  "Duke": {color: '#00539b', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/150.png'},
  "Georgia Tech": {color: '#b3a369', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/59.png'},
  "Houston": {color: '#c8102e', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/248.png'},
  "Syracuse": {color: '#ff431b', alternate: '#000e54', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/183.png'},
  "Illinois": {color: '#ff5f05', alternate: '#13294b', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/356.png'},
  "Maryland": {color: '#ce1126', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/120.png'},
  "Pittsburgh": {color: '#003594', alternate: '#ffb81c', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/221.png'},
  "Rutgers": {color: '#ce0e2d', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/164.png'},
  "Colorado": {color: '#cfb87c', alternate: '#000000', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/38.png'},
  "TCU": {color: '#4d1979', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/2628.png'},
  "UCF": {color: '#b4a169', alternate: '#000000', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/2116.png'},
  "Wisconsin": {color: '#a00000', alternate: '#ffffff', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/275.png'},
  "Minnesota": {color: '#5e0a2f', alternate: '#fab41c', logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/135.png'},
};
const isActiveTeam = team => Object.hasOwn(teamBranding, team);
const activeStandings = standings => Object.fromEntries(Object.entries(standings)
  .map(([conference, rows]) => [conference, rows.filter(([team]) => isActiveTeam(team))]));

const seed = {
  week: 14,
  standingsWeek: 13,
  weekLabels: {14: 'Conference Championships'},
  standings: activeStandings(conf),
  rankings: {},
  stories: [
    {id: '2027-american-champions', week: 14, type: 'Featured', title: 'Utah takes the American crown', body: 'Utah defeated Boise State 47–14 in the American Championship. The Utes followed their 38–7 Week 13 win over Colorado with a 33-point victory in the title game.'},
    {id: '2027-acc-champions', week: 14, type: 'Headline', title: 'Mississippi State wins the ACC', body: 'Mississippi State defeated Syracuse 28–7 in the ACC Championship, following a 56–13 win over Ole Miss in Week 13.'},
    {id: '2027-big12-champions', week: 14, type: 'Headline', title: 'Houston claims the Big 12', body: 'Houston defeated Pittsburgh 31–21 in the Big 12 Championship after beating Kansas State 28–10 in Week 13.'},
    {id: '2027-week13-final', week: 13, type: 'Headline', title: 'Week 13: UCF edges Duke; Syracuse rolls', body: 'UCF edged Duke 27–26, Syracuse beat Rutgers 34–9, and Wisconsin defeated Minnesota 56–31. All 21 unique Week 13 finals from the submitted conference schedules are now on the Schedule tab.'},
  ],
  games: Object.entries(schedule).flatMap(([week, games]) => games.map(
    ([conference, away, home, kickoff, label, scores, resultMethod, overtime = false, siteUnconfirmed = false], i) => ({
      id: `2027-w${week}-${i + 1}`, week: Number(week), conference, away, home, kickoff, label, scores, resultMethod, overtime, siteUnconfirmed,
      featured: week === '14' || (week === '11' && ['Arizona State', 'Baylor', 'UCF'].includes(away)),
    }))),
};

let leagueData = seed;
let leagueVersion = 0;
let responses = [];
let publicError = '';
let scheduleWeek = seed.week;
let coachInterview;
let coachError = '';
let commissionerKey = '';
let dashboardSection = 'Games & scores';
let editWeek = seed.week;
let draft;
let draftVersion;
let draftDirty = false;
let draftRevision = 0;
let publishing = false;
let statusMessage = '';
let interviews = [];
let shareLink = '';

async function api(path, {method = 'GET', token, body} = {}) {
  if (!apiOrigin) throw new Error('The league service has not been connected.');
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiOrigin + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The league service could not complete this request.');
  return data;
}

async function refreshLeague() {
  const snapshot = await api('/league');
  leagueVersion = snapshot.version;
  leagueData = snapshot.data ? {
    ...snapshot.data,
    standings: activeStandings(snapshot.data.standings),
    standingsWeek: snapshot.data.standingsWeek ?? 11,
    weekLabels: snapshot.data.weekLabels ?? {},
  } : seed;
  responses = snapshot.responses;
  publicError = '';
}

function option(value, label, current) {
  return `<option value="${safe(value)}" ${String(current) === String(value) ? 'selected' : ''}>${safe(label)}</option>`;
}

function weekName(week, data = leagueData) {
  return data.weekLabels[week] || 'Week ' + week;
}

function teamBadge(name, large = false) {
  const brand = isActiveTeam(name) ? teamBranding[name] : null;
  if (!brand) return `<span>${safe(name)}</span>`;
  return `<span class="team-badge ${large ? 'team-badge-large' : ''}"
    style="--team-color:${brand.color};--team-alternate:${brand.alternate}">
    <img src="${brand.logo}" alt="" width="28" height="28" loading="lazy">
    <span>${safe(name)}</span>
  </span>`;
}

function teamButton(name) {
  return `<button class="teamlink" data-team="${safe(name)}">${teamBadge(name)}</button>`;
}

function applyTeamTheme() {
  const brand = page === 'Teams' && isActiveTeam(selected) ? teamBranding[selected] : null;
  document.body.toggleAttribute('data-team-profile', Boolean(brand));
  if (brand) {
    document.body.style.setProperty('--profile-primary', brand.color);
    document.body.style.setProperty('--profile-secondary', brand.alternate);
  }
}

function teamProfileStats(team, conference) {
  const snapshot = teamStatSnapshots[conference];
  if (snapshot?.categories.some(category => Object.hasOwn(category.rows, team))) {
    const categories = snapshot.categories.filter(category => Object.hasOwn(category.rows, team));
    const groups = categories.map(({title, rows}, i) => `
      <details class="profile-stat-group" ${i === 0 ? 'open' : ''}>
        <summary>${safe(title)}</summary>
        <dl class="profile-stat-list">${teamStatLabels[title].map((label, column) => `
          <div><dt>${safe(label)}</dt><dd>${safe(rows[team][column].toLocaleString('en-US'))}</dd></div>`).join('')}
        </dl>
      </details>`).join('');
    return `<p class="muted">${safe(snapshot.label || weekName(snapshot.week))} · Team stats</p>${groups}`;
  }
  const legacy = stats[team];
  if (!legacy) return '<p class="muted">Team stats are pending.</p>';
  const {ppg, ypg, pass, rush, allowed, opp, margin} = legacy;
  const overview = [
    ['Points / game', ppg], ['Total yards / game', ypg], ['Pass yards / game', pass],
    ['Rush yards / game', rush], ['Yards allowed / game', allowed], ['Points allowed / game', opp],
    ['Turnover margin', margin > 0 ? '+' + margin : margin],
  ];
  return `<p class="muted">Week 11 team stats</p><div class="grid">${overview.map(([label, value]) =>
    `<div class="kpi"><div class="stat">${value}</div><small>${label}</small></div>`).join('')}</div>`;
}

function standingsDate() {
  const week = leagueData.standingsWeek;
  return `<p class="muted">Last verified standings · ${safe(weekName(week))}</p>`;
}

function gameTitle(game) {
  return `${game.away} ${game.siteUnconfirmed ? 'vs' : '@'} ${game.home}`;
}

function gameResult(game) {
  if (!game.scores) return game.kickoff || 'Kickoff TBD';
  const [awayScore, homeScore] = game.scores;
  const final = game.overtime ? 'FINAL (OT)' : 'FINAL';
  return awayScore > homeScore
    ? `${final} · ${game.away} ${awayScore}–${homeScore} ${game.home}`
    : `${final} · ${game.home} ${homeScore}–${awayScore} ${game.away}`;
}

function responseCard(response) {
  return `<blockquote class="coach-quote"><small class="tag">${safe(response.team)} · ${safe(response.phase)}</small>
    ${response.answers.map(answer => `<p>${safe(answer)}</p>`).join('')}</blockquote>`;
}

function matches(games, showResponses = false) {
  if (!games.length) return '<p class="muted">Matchups are pending.</p>';
  return games.map(game => `<div class="match">
    <div class="tag">${safe(game.conference)}${game.label ? ' · ' + safe(game.label) : ''}${game.resultMethod ? ' · ' + safe(game.resultMethod) : ''}</div>
    <strong class="match-teams">${teamBadge(game.away)} <span>${game.siteUnconfirmed ? 'vs' : '@'}</span> ${teamBadge(game.home)}</strong><small>${safe(gameResult(game))}</small>
    ${showResponses ? responses.filter(response => response.gameId === game.id).map(responseCard).join('') : ''}
  </div>`).join('');
}

function storyCards() {
  const featured = leagueData.stories.filter(story => story.type === 'Featured');
  const headlines = leagueData.stories.filter(story => story.type === 'Headline');
  const storyCard = story => `<article class="card ${story.type === 'Featured' ? 'featured-story' : ''}">
    <div class="tag">${safe(story.type)} · ${safe(weekName(story.week))}</div><h2>${safe(story.title)}</h2>
    <p class="story-copy">${safe(story.body)}</p></article>`;
  return featured.map(storyCard).join('')
    + (headlines.length ? `<div class="grid">${headlines.map(storyCard).join('')}</div>` : '');
}

// Committee ballot for the Week 13 snapshot. Computer scores use the same frozen data.
const week13Committee = [
  'Mississippi State', 'Boise State', 'Utah', 'Georgia Tech', 'Houston', 'Syracuse',
  'Rutgers', 'Arizona State', 'Pittsburgh', 'Illinois', 'Colorado', 'TCU',
  'Minnesota', 'UCF', 'Wisconsin', 'Maryland', 'Duke',
];

function buildWeek13Poll() {
  const winRate = record => {
    const [wins, losses] = record.split('-').map(Number);
    return wins / (wins + losses);
  };
  const records = new Map(Object.values(conf).flat().map(([team, , record]) => [team, record]));
  const evidence = new Map(week13Committee.map(team => [team, {
    weight: 0, schedule: 0, performance: 0, quality: 0, margin: 0,
  }]));
  const clampScore = score => Math.max(0, Math.min(100, score));
  for (const game of seed.games) {
    if (game.week < 9 || game.week > 13 || !game.scores || game.resultMethod === 'Force win') continue;
    const weight = game.resultMethod === 'Fair sim' ? 0.3
      : game.label === 'Interrupted user matchup' ? 0.5
      : game.label === 'USER vs USER' ? 1 : 0.6;
    const sides = [game.away, game.home];
    sides.forEach((team, side) => {
      const entry = evidence.get(team);
      if (!entry) return;
      const opponentRecord = records.get(sides[1 - side]);
      const opponent = opponentRecord ? winRate(opponentRecord) : 0.5;
      const margin = Math.max(-28, Math.min(28, game.scores[side] - game.scores[1 - side]));
      entry.weight += weight;
      entry.schedule += weight * opponent * 100;
      entry.performance += weight * clampScore(50 + 1.4 * margin + 30 * (opponent - 0.5));
      entry.quality += weight * (margin > 0 ? 50 : 0) + weight * opponent * 50;
      entry.margin += weight * clampScore(50 + 1.5 * margin);
    });
  }
  return week13Committee.map((team, position) => {
    const entry = evidence.get(team);
    // Two neutral points of evidence keep sparse samples from dominating the ballot.
    const component = key => (entry[key] + 100) / (entry.weight + 2);
    const computer = 0.30 * component('schedule') + 0.25 * component('performance')
      + 0.20 * component('quality') + 0.15 * winRate(records.get(team)) * 100
      + 0.10 * component('margin');
    const committee = 100 * (1 - position / (week13Committee.length - 1));
    return {team, score: (committee + computer) / 2, position};
  }).sort((a, b) => b.score - a.score || a.position - b.position);
}

const week13Poll = buildWeek13Poll();
let rankingWeek = seed.week;

function rankingView(compact) {
  const week = compact ? leagueData.week : rankingWeek;
  const official = leagueData.rankings[week] || [];
  const provisional = !official.length && week === 13;
  const ranked = provisional ? week13Poll : official.map(team => ({team}));
  const weeks = [...new Set([leagueData.week, 13, ...Object.keys(leagueData.rankings).map(Number)])].sort((a, b) => b - a);
  const selector = compact ? '' : `<label for="ranking-week">Poll week</label>
    <select id="ranking-week">${weeks.map(value => option(value, weekName(value), week)).join('')}</select>`;
  if (ranked.length) {
    const visible = compact ? ranked.slice(0, 5) : ranked;
    return selector + `<div class="tag">${safe(weekName(week))} · ${provisional ? 'Provisional PP BCS™' : 'Commissioner rankings'}</div>
      ${provisional ? '<p class="muted">Week 13 results updated. Uses the last verified standings snapshot and available Weeks 9–13 finals; conference championship results are excluded.</p>' : ''}
      <ol>${visible.map(({team, score}) => `<li>${teamButton(team)}${!compact && provisional
        ? ` <small>· ${score.toFixed(1)} BCS</small>` : ''}</li>`).join('')}</ol>
      ${compact ? '<button onclick="go(\'Rankings\')">View rankings →</button>' : ''}
      ${!compact && provisional ? `<details><summary>How this provisional poll was calculated</summary>
        <p>The poll is 50% committee and 50% computer. The computer uses the workbook's five category weights.
        Because the full season game log is incomplete, it estimates schedule, quality, opponent-adjusted performance, and capped margin from the available Weeks 9–13 results.
        Forced outcomes contribute through the official record only. Fair sims are discounted, and the interrupted Boise State–Colorado game receives 0.50 weight.</p>
      </details>` : ''}`;
  }
  return selector + `<div class="notice">PP BCS™ rankings for ${safe(weekName(week))} are pending verification.</div>
    <p class="muted">Current conference records are available in the Standings tab.</p>
    <button onclick="go('Standings')">View standings →</button>`;
}

// Week 13 matchups and planned venues from the 2027 dynasty schedule workbook.
const week13Slate = [
  ['Arizona', 'Arizona State'], ['Oklahoma State', 'Boise State'],
  ['UCF', 'Duke'], ['Georgia', 'Georgia Tech'], ['Kansas State', 'Houston'],
  ['Northwestern', 'Illinois'], ['West Virginia', 'Maryland'], ['Wisconsin', 'Minnesota'],
  ['Ole Miss', 'Mississippi State'], ['Syracuse', 'Rutgers'], ['TCU', 'Kansas'],
  ['Utah', 'Colorado'],
];

function modelWeek13Openers(games) {
  const homeField = 2.5;
  const ratings = new Map();
  const evidence = [];
  for (const game of games) {
    if (game.week < 9 || game.week >= 13 || !game.scores || game.resultMethod === 'Force win') continue;
    const contextWeight = game.resultMethod === 'Fair sim' ? 0.3
      : game.label === 'Interrupted user matchup' ? 0.5
      : game.label === 'USER vs USER' ? 1 : 0.6;
    const weight = contextWeight * 0.85 ** (12 - game.week);
    const [awayScore, homeScore] = game.scores;
    const margin = homeScore - awayScore;
    const cappedMargin = Math.max(-35, Math.min(35, margin));
    const total = homeScore + awayScore;
    const venue = game.siteUnconfirmed ? 0 : homeField / 2;
    evidence.push([game.away, game.home, (total - cappedMargin) / 2 + venue, weight]);
    evidence.push([game.home, game.away, (total + cappedMargin) / 2 - venue, weight]);
    for (const team of [game.away, game.home]) {
      if (!ratings.has(team)) ratings.set(team, {attack: 0, defense: 0});
    }
  }

  const sampleWeight = evidence.reduce((sum, row) => sum + row[3], 0);
  const average = sampleWeight ? evidence.reduce((sum, row) => sum + row[2] * row[3], 0) / sampleWeight : 28;
  // Fit opponent-adjusted scoring, shrinking thin samples toward the league average.
  for (let pass = 0; pass < 20; pass++) {
    const sums = new Map([...ratings.keys()].map(team =>
      [team, {attack: 0, defense: 0, attackWeight: 1.5, defenseWeight: 1.5}]));
    for (const [offense, defense, points, weight] of evidence) {
      const attack = sums.get(offense);
      const stop = sums.get(defense);
      attack.attack += weight * (points - average - ratings.get(defense).defense);
      attack.attackWeight += weight;
      stop.defense += weight * (points - average - ratings.get(offense).attack);
      stop.defenseWeight += weight;
    }
    for (const [team, {attack, defense, attackWeight, defenseWeight}] of sums) {
      ratings.set(team, {attack: attack / attackWeight, defense: defense / defenseWeight});
    }
  }

  return week13Slate.map(([away, home]) => {
    const visitor = ratings.get(away);
    const host = ratings.get(home);
    const awayPoints = Math.max(0, average + (visitor?.attack ?? 0) + (host?.defense ?? 0) - homeField / 2);
    const homePoints = Math.max(0, average + (host?.attack ?? 0) + (visitor?.defense ?? 0) + homeField / 2);
    return {away, home, margin: Math.round((homePoints - awayPoints) * 2) / 2,
      total: Math.round((homePoints + awayPoints) * 2) / 2, limited: !visitor || !host};
  });
}

const week13Openers = modelWeek13Openers(seed.games);

function openerSpread({away, home, margin}) {
  if (!margin) return 'Pick’em';
  return `${margin > 0 ? home : away} −${Math.abs(margin)}`;
}

function week13LineBoard() {
  return card('Week 13 · Opening lines', `
    <p class="muted">Reconstructed dynasty openers from Weeks 9–12. Matchups and planned home teams come from the 2027 workbook.</p>
    <table class="line-board"><thead><tr><th scope="col">Matchup</th><th scope="col">Spread</th><th scope="col">Total</th></tr></thead><tbody>
    ${week13Openers.map(line => `<tr><td>${safe(line.away)} at ${safe(line.home)}${line.limited ? '<small class="line-sample">Limited pregame data</small>' : ''}</td>
      <td>${safe(openerSpread(line))}</td><td>${line.total}</td></tr>`).join('')}
    </tbody></table>
    <details class="line-method"><summary>How the lines were set</summary>
      <p>Opponent-adjusted scoring, recent results weighted more heavily, a 35-point margin cap, and 2.5 points for the scheduled home team.
      Force wins are excluded and fair sims are discounted. Teams without an observed pregame score use the league-average baseline.</p>
    </details>`);
}

function weeklySchedule() {
  const weeks = [...new Set([leagueData.week, ...leagueData.games.map(game => game.week)])].sort((a, b) => a - b);
  const games = leagueData.games.filter(game => game.week === scheduleWeek);
  return card('Weekly Schedule', `<label for="schedule-week">Dynasty week</label>
    <select id="schedule-week">${weeks.map(week => option(week, weekName(week), scheduleWeek)).join('')}</select>`)
    + (games.length
      ? conferences.filter(conference => games.some(game => game.conference === conference))
        .map(conference => card(conference, matches(games.filter(game => game.conference === conference), true))).join('')
      : card(safe(weekName(scheduleWeek)), '<p class="muted">Matchups and results are pending.</p>'))
    + (scheduleWeek === 13 ? week13LineBoard() : '');
}

function coachMedia() {
  if (coachToken) {
    if (coachError) return card('Coach Press Conferences', `<p class="notice" role="alert">${safe(coachError)}</p>`);
    if (!coachInterview) return card('Coach Press Conferences', '<p role="status">Opening your private interview…</p>');
    const heading = `<p class="tag">${safe(coachInterview.team)} · ${safe(coachInterview.phase)} · Week ${coachInterview.week}</p>
      <p>${safe(gameTitle(coachInterview))}</p>`;
    if (coachInterview.submittedAt) return card('Coach Press Conferences', heading
      + '<p class="notice" role="status">Your answers are public on the Schedule tab.</p>');
    return card('Coach Press Conferences', `<div class="workspace">${heading}
      <p class="notice">Your questions are private. Your answers will be public as soon as you submit.</p>
      <form data-action="answer">
        ${coachInterview.prompts.map(prompt => `<label>${safe(prompt)}<textarea name="answer" required maxlength="1000"></textarea></label>`).join('')}
        <button class="primary">Submit public answers</button><p data-form-status role="status"></p>
      </form></div>`);
  }
  const published = responses.slice().reverse();
  return card('Coach Press Conferences', `<p>Use the private link from your commissioner to open your questions.</p>
    ${publicError ? `<p class="notice">${safe(publicError)}</p>` : ''}
    ${published.length ? published.map(response => {
      const game = leagueData.games.find(game => game.id === response.gameId);
      return game ? `<div class="match"><strong>${safe(gameTitle(game))}</strong><small>Week ${game.week}</small>${responseCard(response)}</div>` : '';
    }).join('') : ''}`);
}

const sections = ['Games & scores', 'Standings', 'Rankings', 'Headlines & stories', 'Coach questions'];

function commissionerDashboard() {
  if (!commissionerKey) {
    return card('Commissioner HQ', apiOrigin
      ? `<div class="workspace"><p>Sign in with your commissioner access key to manage league updates.</p>
        <form data-action="sign-in"><label>Commissioner access key
        <input type="password" name="key" required maxlength="256" autocomplete="current-password"></label>
        <button class="primary">Unlock dashboard</button><p data-form-status role="status"></p></form></div>`
      : '<p class="notice">Commissioner access will open when the league service is connected.</p>');
  }
  return card('Commissioner HQ', `<div class="workspace">
    <div class="editor-grid">
      <div class="kpi"><div class="stat">${Object.values(draft.standings).flat().length}</div><small>Teams in standings</small></div>
      <div class="kpi"><div class="stat">${draft.week}</div><small>Current dynasty week in draft</small></div>
      <div class="kpi"><div class="stat">${draft.games.filter(game => game.week === draft.week && game.scores).length}</div><small>Final scores this week</small></div>
    </div>
    <div class="editor-actions">
      <button class="primary" data-click="publish" ${!publishing && (draftDirty || draftVersion === 0) ? '' : 'disabled'}>Publish league updates</button>
      <button data-click="reload">Reload published data</button><button data-click="sign-out">Sign out</button>
    </div>
    <p role="status" id="dashboard-status">${safe(statusMessage || (draftDirty ? 'Unpublished changes in this draft.' : (draftVersion === 0 ? 'Publish the league baseline to enable coach questions.' : 'League draft matches the published data.')))}</p>
    <div class="editor-actions" aria-label="Dashboard sections">${sections.map(section =>
      `<button class="${section === dashboardSection ? 'selected-section' : ''}" aria-pressed="${section === dashboardSection}"
        data-section="${safe(section)}">${safe(section)}</button>`).join('')}</div>
    ${dashboardSection === sections[0] ? gameEditor() :
      dashboardSection === sections[1] ? standingsEditor() :
      dashboardSection === sections[2] ? rankingsEditor() :
      dashboardSection === sections[3] ? storiesEditor() : questionsEditor()}
  </div>`);
}

function input(label, name, value = '', attributes = '') {
  return `<label>${label}<input name="${name}" value="${safe(value)}" ${attributes}></label>`;
}

function formFeedback() {
  return '<p data-form-status role="status"></p>';
}

function gameFields(game) {
  return `<form data-action="game" data-id="${safe(game.id || '')}">
    <div class="editor-grid">
      <label>Conference<select name="conference">${conferences.map(c => option(c, c, game.conference)).join('')}</select></label>
      ${input(game.siteUnconfirmed ? 'First team' : 'Away team', 'away', game.away, 'list="league-teams" required maxlength="80"')}
      ${input(game.siteUnconfirmed ? 'Second team' : 'Home team', 'home', game.home, 'list="league-teams" required maxlength="80"')}
      ${input('Kickoff display', 'kickoff', game.kickoff, 'maxlength="140" placeholder="Sat Nov 20 · 7:00 PM ET"')}
      ${input('Matchup label', 'label', game.label, 'maxlength="50" placeholder="USER vs USER"')}
    </div><div class="editor-grid record-fields">
      ${input(game.siteUnconfirmed ? 'First team final score' : 'Away final score', 'awayScore', game.scores?.[0] ?? '', 'type="number" min="0" max="999" step="1" inputmode="numeric"')}
      ${input(game.siteUnconfirmed ? 'Second team final score' : 'Home final score', 'homeScore', game.scores?.[1] ?? '', 'type="number" min="0" max="999" step="1" inputmode="numeric"')}
    </div><label>Result method<select name="resultMethod">
      ${option('', 'Unspecified', game.resultMethod || '')}
      ${['Force win', 'Fair sim'].map(method => option(method, method, game.resultMethod)).join('')}
    </select></label>
    <label><input type="checkbox" name="siteUnconfirmed" ${game.siteUnconfirmed ? 'checked' : ''}>Home and away unconfirmed</label>
    <label><input type="checkbox" name="overtime" ${game.overtime ? 'checked' : ''}>Overtime final</label>
    <label><input type="checkbox" name="featured" ${game.featured ? 'checked' : ''}>Feature this matchup on the homepage</label>
    <div class="editor-actions"><button>Save game to draft</button>
      ${game.id ? '<button type="button" data-click="remove-game">Remove game</button>' : ''}</div>
    ${formFeedback()}</form>`;
}

function gameEditor() {
  const teams = Object.values(draft.standings).flat().map(row => row[0]);
  return `<h3 class="editor-heading">Games & scores</h3>
    <p class="muted">Save each game to the draft, then publish. Update standings separately from the official league records.</p>
    <div class="editor-grid"><form data-action="edit-week">
      ${input('Week to edit', 'week', editWeek, 'type="number" min="1" max="30" required')}
      <button>Open week</button></form>
    <form data-action="active-week">
      ${input('Current public week', 'week', draft.week, 'type="number" min="1" max="30" required')}
      <button>Save current week to draft</button></form></div>
    <form data-action="week-label">
      ${input('Public label for this week (optional)', 'label', draft.weekLabels[editWeek] || '',
        'maxlength="60" placeholder="Conference Championships"')}
      <button>Save week label to draft</button>${formFeedback()}</form>
    <h3 class="editor-heading">${safe(weekName(editWeek, draft))} matchups</h3>
    <datalist id="league-teams">${teams.map(team => option(team, team, '')).join('')}</datalist>
    <details><summary>Add a game</summary>${gameFields({conference: conferences[0], away: '', home: '', kickoff: '', label: ''})}</details>
    ${draft.games.filter(game => game.week === editWeek).map(game =>
      `<details><summary>${safe(gameTitle(game))} <small>· ${safe(gameResult(game))}</small></summary>${gameFields(game)}</details>`).join('')}`;
}

function standingsEditor() {
  const record = 'pattern="[0-9]{1,2}-[0-9]{1,2}" required maxlength="5" placeholder="W-L"';
  return `<h3 class="editor-heading">Conference standings</h3>
    <p class="muted">Enter conference and overall records as W-L. Use the position field to match the league’s official order.</p>
    <form data-action="standings-week">
      ${input('Last verified standings week', 'week', draft.standingsWeek, 'type="number" min="1" max="30" required')}
      <button>Save verified week to draft</button>${formFeedback()}</form>
    ${conferences.map(c => `<details data-conference="${c}"><summary>${c} · ${draft.standings[c].length} teams</summary>
      ${draft.standings[c].map(([team, league, overall], i, rows) =>
        `<form data-action="standing" data-conference="${c}" data-team="${safe(team)}">
          <h3>${teamBadge(team)}</h3><div class="editor-grid">
          ${input('Conference W-L', 'league', league, record)}${input('Overall W-L', 'overall', overall, record)}
          ${input('Position', 'position', i + 1, `type="number" min="1" max="${rows.length}" required`)}
          </div><div class="editor-actions"><button>Save team to draft</button></div>${formFeedback()}</form>`).join('')}
    </details>`).join('')}`;
}

function rankingsEditor() {
  const rows = Object.values(draft.standings).flat().sort((a, b) => a[0].localeCompare(b[0]));
  const ranked = draft.rankings[draft.week] || [];
  return `<h3 class="editor-heading">${safe(weekName(draft.week, draft))} PP BCS™ rankings</h3>
    <p class="muted">Enter verified teams in rank order, up to 25. Save the verified poll before advancing. A blank list displays the provisional poll when available.</p>
    <form data-action="rankings"><label>Ranked teams, one per line
      <textarea name="teams" maxlength="2025" rows="10" spellcheck="false">${safe(ranked.join('\n'))}</textarea></label>
      <button>Save rankings to draft</button>${formFeedback()}</form>
    <details><summary>Team names from standings</summary><p>${rows.map(row => safe(row[0])).join(' · ')}</p></details>`;
}

function storyForm(story = {}, index = '') {
  return `<form data-action="story" data-index="${index}">
    <div class="editor-grid"><label>Placement<select name="type">
      ${['Headline', 'Featured'].map(type => option(type, type, story.type)).join('')}</select></label>
    ${input('Week', 'week', story.week || draft.week, 'type="number" min="1" max="30" required')}</div>
    ${input('Title', 'title', story.title, 'required maxlength="140"')}
    <label>Story text<textarea name="body" required maxlength="2500">${safe(story.body || '')}</textarea></label>
    <div class="editor-actions"><button>Save story to draft</button>
      ${index === '' ? '' : '<button type="button" data-click="remove-story">Remove story</button>'}</div>${formFeedback()}
  </form>`;
}

function storiesEditor() {
  const games = draft.games.filter(game => game.week === draft.week);
  const gameOptions = games.map(game => option(game.id, gameTitle(game) + ' · ' + gameResult(game), ''));
  const quoteOptions = responses.filter(response => games.some(game => game.id === response.gameId))
    .map(response => option(response.id, `${response.team} · ${response.phase} · ${response.answers[0].slice(0, 75)}`, ''));
  return `<h3 class="editor-heading">Homepage headlines & featured stories</h3>
    <p class="muted">Start from a game or published coach quote, then edit the headline and story before saving.</p>
    <div class="editor-grid">
      <label>Game headline<select id="game-story"><option value="">Choose a game</option>${gameOptions.join('')}</select></label>
      <label>Coach quote<select id="quote-story"><option value="">Choose a response</option>${quoteOptions.join('')}</select></label>
    </div>
    <h3>New story</h3>${storyForm()}
    ${draft.stories.map((story, i) => `<details><summary>${safe(story.type)} · ${safe(story.title)}</summary>${storyForm(story, i)}</details>`).join('')}`;
}

function questionTeams(gameId) {
  const game = leagueData.games.find(game => game.id === gameId);
  return game ? [game.away, game.home].map(team => option(team, team, '')).join('') : '';
}

function questionsEditor() {
  const games = leagueData.games.slice().sort((a, b) => b.week - a.week);
  return `<h3 class="editor-heading">Private coach questions</h3>
    <p class="muted">Choose a published matchup and one coach. Share the private link directly with that team owner. Answers appear under the game on submission.</p>
    ${shareLink ? `<div class="notice"><label>Private coach link<input id="private-coach-link" value="${safe(shareLink)}" readonly></label>
      <button type="button" data-click="copy-link">Copy link</button></div>` : ''}
    ${games.length ? `<form data-action="question">
      <div class="editor-grid"><label>Published game<select id="question-game" name="gameId">${games.map(game =>
        option(game.id, `${weekName(game.week)} · ${gameTitle(game)}`, games[0].id)).join('')}</select></label>
      <label>Coach<select id="question-team" name="team">${questionTeams(games[0].id)}</select></label>
      <label>Session<select name="phase"><option>Pregame</option><option>Postgame</option></select></label></div>
      <label>Question 1<textarea name="prompt" required maxlength="350"></textarea></label>
      <label>Question 2 (optional)<textarea name="prompt" maxlength="350"></textarea></label>
      <label>Question 3 (optional)<textarea name="prompt" maxlength="350"></textarea></label>
      <button>Create private link</button>${formFeedback()}</form>` : '<p class="notice">Publish a league update to make games available for interviews.</p>'}
    ${interviews.map(interview => {
      const game = leagueData.games.find(game => game.id === interview.gameId);
      return `<details><summary>${safe(interview.team)} · ${safe(interview.phase)} · Week ${game?.week ?? '—'}
        · ${interview.submittedAt || responses.some(response => response.id === interview.id) ? 'Published' : 'Awaiting answers'}</summary>
        <p>${game ? safe(gameTitle(game)) : ''}</p><ol>${interview.prompts.map(prompt => `<li>${safe(prompt)}</li>`).join('')}</ol>
        ${interview.submittedAt || responses.some(response => response.id === interview.id) ? '' : `<button data-click="rotate-link" data-id="${safe(interview.id)}">Replace private link</button>`}</details>`;
    }).join('')}`;
}

function stage(message, openConference) {
  draftDirty = true;
  draftRevision++;
  statusMessage = message + ' Publish league updates when ready.';
  render();
  if (openConference) {
    const details = [...el.querySelectorAll('details')].find(item => item.dataset.conference === openConference);
    if (details) details.open = true;
  }
}

function showStatus(message) {
  statusMessage = message;
  const status = document.getElementById('dashboard-status');
  if (status) status.textContent = message;
}

function setShareLink(token) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = new URLSearchParams({coach: token}).toString();
  shareLink = url.toString();
}

async function loadDashboard(token) {
  const privateData = await api('/commissioner/interviews', {token});
  await refreshLeague();
  commissionerKey = token;
  interviews = privateData.interviews;
  draft = structuredClone(leagueData);
  draftVersion = leagueVersion;
  draftDirty = false;
  editWeek = draft.week;
  shareLink = '';
}

el.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const get = name => String(data.get(name) ?? '').trim();
  const button = event.submitter || form.querySelector('button');
  const status = form.querySelector('[data-form-status]');
  button.disabled = true;
  if (status) status.textContent = '';
  try {
    switch (form.dataset.action) {
      case 'sign-in':
        await loadDashboard(get('key'));
        render();
        break;
      case 'edit-week':
        editWeek = Number(get('week'));
        render();
        break;
      case 'active-week':
        draft.week = editWeek = Number(get('week'));
        stage('Current week saved to draft.');
        break;
      case 'week-label':
        if (get('label')) draft.weekLabels[editWeek] = get('label');
        else delete draft.weekLabels[editWeek];
        stage('Week label saved to draft.');
        break;
      case 'standings-week':
        draft.standingsWeek = Number(get('week'));
        stage('Standings verification week saved to draft.');
        break;
      case 'game': {
        const away = get('away');
        const home = get('home');
        const scoreFields = [get('awayScore'), get('homeScore')];
        const scores = scoreFields.every(value => value === '') ? null : scoreFields.map(Number);
        if (!away || !home || away === home) throw new Error('Enter two different teams.');
        if (scores && (scoreFields.includes('') || scores[0] === scores[1])) throw new Error('Enter two different final scores or leave both blank.');
        const resultMethod = get('resultMethod');
        const overtime = data.has('overtime');
        if ((resultMethod || overtime) && !scores) throw new Error('Enter both final scores before recording a result method or overtime.');
        const game = {id: form.dataset.id || crypto.randomUUID(), week: editWeek, conference: get('conference'),
          away, home, kickoff: get('kickoff'), label: get('label'), scores, resultMethod, overtime, siteUnconfirmed: data.has('siteUnconfirmed'), featured: data.has('featured')};
        const index = draft.games.findIndex(item => item.id === game.id);
        if (index === -1) draft.games.push(game);
        else draft.games[index] = game;
        stage('Game saved to draft.');
        break;
      }
      case 'standing': {
        const {conference, team} = form.dataset;
        const [cw, cl] = get('league').split('-').map(Number);
        const [ow, ol] = get('overall').split('-').map(Number);
        if (cw > ow || cl > ol) throw new Error('Overall records must include conference wins and losses.');
        const rows = draft.standings[conference];
        rows.splice(rows.findIndex(row => row[0] === team), 1);
        rows.splice(Number(get('position')) - 1, 0, [team, get('league'), get('overall')]);
        stage('Standing saved to draft.', conference);
        break;
      }
      case 'rankings': {
        const teams = get('teams').split('\n').map(team => team.trim()).filter(Boolean);
        const known = new Set(Object.values(draft.standings).flat().map(row => row[0]));
        if (teams.length > 25 || new Set(teams).size !== teams.length || teams.some(team => !known.has(team))) {
          throw new Error('Enter up to 25 unique team names as shown in the standings.');
        }
        draft.rankings[draft.week] = teams;
        stage('Rankings saved to draft.');
        break;
      }
      case 'story': {
        if (!get('title') || !get('body')) throw new Error('Enter a title and story text.');
        const story = {title: get('title'), body: get('body'), week: Number(get('week')), type: get('type')};
        if (form.dataset.index === '') {
          if (draft.stories.length >= 12) throw new Error('Remove a story before adding another. The homepage can hold up to 12.');
          draft.stories.push(story);
        } else draft.stories[Number(form.dataset.index)] = story;
        stage('Story saved to draft.');
        break;
      }
      case 'question': {
        const prompts = data.getAll('prompt').map(prompt => prompt.trim()).filter(Boolean);
        const {id, token} = await api('/commissioner/interviews', {method: 'POST', token: commissionerKey,
          body: {gameId: get('gameId'), team: get('team'), phase: get('phase'), prompts}});
        setShareLink(token);
        interviews.unshift({id, gameId: get('gameId'), team: get('team'), phase: get('phase'), prompts});
        showStatus('Private link created.');
        render();
        break;
      }
      case 'answer': {
        const answers = data.getAll('answer').map(answer => answer.trim());
        const {submittedAt} = await api('/coach', {method: 'POST', token: coachToken, body: {answers}});
        coachInterview.submittedAt = submittedAt;
        render();
        try {
          await refreshLeague();
        } catch {
          publicError = 'The latest league data could not be loaded. Refresh to see recent updates.';
        }
        break;
      }
    }
  } catch (error) {
    if (status) status.textContent = error.message;
    else showStatus(error.message);
  } finally {
    button.disabled = false;
  }
});

el.addEventListener('change', event => {
  const {id, value} = event.target;
  if (id === 'ranking-week') {
    rankingWeek = Number(value);
    render();
    document.getElementById(id).focus();
  }
  if (id === 'schedule-week') {
    scheduleWeek = Number(value);
    render();
    document.getElementById(id).focus();
  }
  if (id === 'question-game') document.getElementById('question-team').innerHTML = questionTeams(value);
  if ((id === 'game-story' || id === 'quote-story') && value) {
    const form = el.querySelector('form[data-action="story"][data-index=""]');
    if (id === 'game-story') {
      const game = draft.games.find(item => item.id === value);
      const [away, home] = game.scores || [];
      form.elements.title.value = (!game.scores ? `Week ${game.week} preview: ${gameTitle(game)}`
        : away > home ? `${game.away} beats ${game.home}, ${away}–${home}` : `${game.home} beats ${game.away}, ${home}–${away}`).slice(0, 140);
      form.elements.body.value = `${game.conference} · Week ${game.week}\n${gameTitle(game)} · ${gameResult(game)}`;
      form.elements.type.value = 'Headline';
      form.elements.week.value = game.week;
    } else {
      const response = responses.find(item => item.id === value);
      const game = draft.games.find(item => item.id === response.gameId);
      form.elements.title.value = `${response.team} coach reacts to ${gameTitle(game)}`.slice(0, 140);
      form.elements.body.value = `“${response.answers[0]}”\n\n${response.team} · ${response.phase} · Week ${game.week}`;
      form.elements.type.value = 'Featured';
      form.elements.week.value = game.week;
    }
    form.elements.title.focus();
  }
});

el.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.classList.contains('teamlink') && button.dataset.team) openTeam(button.dataset.team);
  if (button.dataset.section) {
    dashboardSection = button.dataset.section;
    render();
    return;
  }

  const {click: action} = button.dataset;
  if (!action || (publishing && ['publish', 'reload', 'sign-out'].includes(action))) return;
  button.disabled = true;
  try {
    switch (action) {
      case 'publish': {
        publishing = true;
        const submittedDraft = structuredClone(draft);
        const submittedRevision = draftRevision;
        try {
          const saved = await api('/commissioner/league', {method: 'PUT', token: commissionerKey,
            body: {data: submittedDraft, version: draftVersion}});
          leagueData = submittedDraft;
          draftVersion = leagueVersion = saved.version;
          publicError = '';
          draftDirty = draftRevision !== submittedRevision;
          statusMessage = draftDirty ? 'League updates are public. Newer draft edits are still pending.' : 'League updates are public.';
        } finally {
          publishing = false;
          render();
        }
        break;
      }
      case 'reload':
        if (!draftDirty || confirm('Discard your unpublished league changes and reload?')) {
          await loadDashboard(commissionerKey);
          statusMessage = 'Reloaded published data.';
          render();
        }
        break;
      case 'sign-out':
        if (draftDirty && !confirm('Discard your unpublished league changes and sign out?')) break;
        commissionerKey = shareLink = statusMessage = '';
        draft = undefined;
        draftDirty = false;
        interviews = [];
        render();
        break;
      case 'remove-game': {
        const id = button.form.dataset.id;
        if (interviews.some(interview => interview.gameId === id)) throw new Error('This game has coach questions and must stay in the schedule.');
        if (confirm('Remove this game from the draft?')) {
          draft.games = draft.games.filter(game => game.id !== id);
          stage('Game removed from draft.');
        }
        break;
      }
      case 'remove-story':
        if (confirm('Remove this story from the draft?')) {
          draft.stories.splice(Number(button.form.dataset.index), 1);
          stage('Story removed from draft.');
        }
        break;
      case 'copy-link':
        await navigator.clipboard.writeText(shareLink);
        showStatus('Private link copied.');
        break;
      case 'rotate-link': {
        if (!confirm('Replace the private link? The old link will stop working.')) break;
        const {token} = await api('/commissioner/rotate-link', {method: 'POST', token: commissionerKey, body: {id: button.dataset.id}});
        setShareLink(token);
        statusMessage = 'New private link created.';
        render();
        break;
      }
    }
  } catch (error) {
    showStatus(error.message);
  } finally {
    button.disabled = false;
  }
});

window.addEventListener('beforeunload', event => {
  if (draftDirty) event.preventDefault();
});

async function start() {
  if (coachToken) page = 'Media';
  render();
  if (!apiOrigin && !coachToken) return;
  const publicLoad = refreshLeague().then(() => {
    if (!draft) scheduleWeek = leagueData.week;
  }).catch(() => {
    publicError = 'The latest league data could not be loaded. This page may show the baseline league records.';
  });
  if (coachToken) {
    try {
      coachInterview = await api('/coach', {token: coachToken});
    } catch (error) {
      coachError = error.message;
    }
  }
  await publicLoad;
  render();
}

start();
