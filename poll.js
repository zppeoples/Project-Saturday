// Current records use the frozen playoff selection snapshot plus reported playoff finals.
function currentTeamRecord(team, throughWeek = leagueData.week) {
  const selected = playoffField.find(t => t.team === team);
  const raw = selected ? selected.record : teamInfo(team).overall;
  if (!raw || raw === '—') return '—';
  let [wins, losses] = raw.split(/[–-]/).map(Number);
  if (!selected && wins + losses === 11) {
    const game = seed.games.find(g => g.week === 13 && g.scores && [g.away,g.home].includes(team));
    if (game) {
      const side = game.away === team ? 0 : 1;
      if (game.scores[side] > game.scores[1-side]) wins++; else losses++;
    }
  }
  for (const game of leagueData.games.filter(g => g.week > 14 && g.week <= throughWeek && g.scores && [g.away,g.home].includes(team))) {
    const side = game.away === team ? 0 : 1;
    if (game.scores[side] > game.scores[1-side]) wins++; else losses++;
  }
  return `${wins}–${losses}`;
}
function statTable(group) {
  return `<details class="box-category"><summary>${safe(group.title)}</summary><div class="data-scroll" tabindex="0" aria-label="${safe(group.title)} player stats"><table><thead><tr>${group.columns.map(c=>`<th scope="col">${safe(c)}</th>`).join('')}</tr></thead><tbody>${group.rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${safe(cell)}</th>`:`<td>${safe(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function gameBoxScore(game, onlyTeam) {
  const box = playoffBoxScores[game.id];
  if (!box) return '';
  return `<details class="game-box"><summary>Player box score${onlyTeam ? '' : ' · '+Object.keys(box).map(safe).join(' / ')}</summary>
    <p class="muted">Game stats transcribed from the supplied screenshots. Nonparticipating zero rows omitted. Defensive lists show visible rows only; offscreen players are not treated as zero. Displayed percentages and averages are preserved.</p>
    ${Object.entries(box).filter(([team])=>!onlyTeam||team===onlyTeam).map(([team,groups])=>`<h3>${teamBadge(team)}</h3>${groups.map(statTable).join('')}`).join('')}
    ${game.id==='2027-r1-wvu-asu'?'<p class="muted">ASU’s passing screen shows two interceptions. Only one WVU interception appears in the visible defensive rows; the second interceptor is not identified in the supplied screens. Fumbles shown are not automatically counted as lost.</p>':''}
    </details>`;
}
function teamGameStats(team) {
  const games = leagueData.games.filter(g => playoffBoxScores[g.id]?.[team]);
  return games.length ? `<h3>Playoff game stats</h3>${games.map(g=>`<p><b>${safe(gameResult(g))}</b></p>${gameBoxScore(g,team)}`).join('')}` : '';
}
function computeCurrentBCS(throughWeek) {
  const teams = Object.values(leagueData.standings).flat().map(r=>r[0]);
  const rate = record => {const [w,l]=record.split(/[–-]/).map(Number);return w/(w+l)||0;};
  const records = new Map(Object.values(conf).flat().map(([t,,r])=>[t,r]));
  for (const t of teams) records.set(t,currentTeamRecord(t,throughWeek));
  const evidence = new Map(teams.map(t=>[t,{weight:0,schedule:0,performance:0,quality:0,margin:0}]));
  const seen=new Set(), clamp=n=>Math.max(0,Math.min(100,n));
  for (const g of leagueData.games) {
    if(g.week<9||g.week>throughWeek||!g.scores||g.resultMethod==='Force win')continue;
    const key=[g.week,...[g.away,g.home].sort()].join('|');if(seen.has(key))continue;seen.add(key);
    const userGame=isActiveTeam(g.away)&&isActiveTeam(g.home);
    const weight=g.resultMethod==='Fair sim'?.3:g.label==='Interrupted user matchup'?.5:userGame?1:.6;
    [g.away,g.home].forEach((team,side)=>{
      const e=evidence.get(team);if(!e)return;
      const opp=records.has(side===0?g.home:g.away)?rate(records.get(side===0?g.home:g.away)):.5;
      const margin=Math.max(-28,Math.min(28,g.scores[side]-g.scores[1-side]));
      e.weight+=weight;e.schedule+=weight*opp*100;
      e.performance+=weight*clamp(50+1.4*margin+30*(opp-.5));
      e.quality+=weight*((margin>0?50:0)+opp*50);
      e.margin+=weight*clamp(50+1.5*margin);
    });
  }
  const rows=teams.map(team=>{
    const e=evidence.get(team), component=k=>(e[k]+100)/(e.weight+2);
    const schedule=component('schedule'), performance=component('performance'), quality=component('quality'), win=100*rate(records.get(team)), margin=component('margin');
    const computer=.30*schedule+.25*performance+.20*quality+.15*win+.10*margin;
    // No commissioner ballot was supplied for this week: project its order from résumé.
    const resume=.70*win+.15*schedule+.15*quality;
    return {team,record:records.get(team),schedule,performance,quality,win,margin,computer,resume};
  });
  const projected=rows.slice().sort((a,b)=>b.resume-a.resume||b.computer-a.computer||a.team.localeCompare(b.team));
  projected.forEach((row,i)=>{row.ballot=teams.length-i;row.ballotScore=100*row.ballot/teams.length;row.points=5*row.ballotScore+5*row.computer;});
  return rows.sort((a,b)=>b.points-a.points||b.computer-a.computer||a.team.localeCompare(b.team));
}
function currentBCSView(week,compact) {
  const rows=computeCurrentBCS(week), visible=compact?rows.slice(0,5):rows;
  const selector=compact?'':`<label for="ranking-week">Poll week</label><select id="ranking-week">${[13,14,15].map(w=>option(w,weekName(w),week)).join('')}</select>`;
  const heading=`<div class="tag">PP BCS™ · ${safe(weekName(week))}</div><p class="muted">Provisional points poll · All ${rows.length} user teams · ${week===15?'Includes the two reported first-round finals; two games remain pending.':'After conference championships.'}</p>`;
  const table=`<div class="data-scroll" tabindex="0" aria-label="BCS points rankings"><table class="bcs-table"><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Record</th><th scope="col">BCS pts / 1,000</th>${compact?'':'<th scope="col">Ballot pts / 18</th><th scope="col">Computer / 100</th><th scope="col">Schedule 30%</th><th scope="col">Performance 25%</th><th scope="col">Quality 20%</th><th scope="col">Win % 15%</th><th scope="col">Margin 10%</th>'}</tr></thead><tbody>${visible.map((r,i)=>`<tr><td>${i+1}</td><td>${teamButton(r.team)}</td><td>${r.record}</td><td><b>${r.points.toFixed(1)}</b></td>${compact?'':`<td>${r.ballot}</td><td>${r.computer.toFixed(1)}</td>${['schedule','performance','quality','win','margin'].map(k=>`<td>${r[k].toFixed(1)}</td>`).join('')}`}</tr>`).join('')}</tbody></table></div>`;
  const method=compact?'<button onclick="go(\'Rankings\')">Full poll & points breakdown →</button>':`<details class="bcs-method" open><summary>How the points work</summary><p><b>BCS points = 5 × normalized ballot score + 5 × computer score</b>, on a 1,000-point scale. Each half contributes up to 500 points. The projected ballot awards 18 points for first, 17 for second, down to 1 for eighteenth; divide by 18 and multiply by 100 to normalize.</p><p>No new commissioner ballot was supplied. This provisional ballot is projected from 70% win percentage, 15% schedule strength, and 15% quality; it is not a submitted vote. The computer retains the existing five weights: schedule 30%, opponent-adjusted performance 25%, quality 20%, win percentage 15%, and capped margin 10%. The table shows each component before its weight is applied.</p><p>Available Weeks 9–${week} finals supply the game evidence. User games carry weight 1, CPU games 0.6, fair sims 0.3, and interrupted matchups 0.5. Force wins are excluded from game evidence; official records still include them. Two neutral observations shrink sparse samples; margins are capped at 28. Opponent records outside the playoff field may be older snapshots, so this is a transparent league projection rather than a complete-season computer rating.</p><p>Playoff entrants use the supplied selection records plus reported playoff finals. Other teams use their last verified record, adding the Week 13 result only where the stored record contained 11 games. A playoff loss does not remove a team from this full-league poll. This poll does not change the game’s playoff seeds.</p></details>`;
  return selector+heading+table+method;
}
