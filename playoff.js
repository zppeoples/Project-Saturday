// Selection seeds and records are frozen; current bracket advances only reported winners.
const playoffField = [
  {seed:1,team:'Utah',record:'12–1'}, {seed:2,team:'Mississippi State',record:'13–0'},
  {seed:3,team:'Boise State',record:'12–1'}, {seed:4,team:'Georgia Tech',record:'10–2'},
  {seed:5,team:'Houston',record:'11–2'}, {seed:6,team:'Arizona State',record:'9–3'},
  {seed:7,team:'TCU',record:'9–3'}, {seed:8,team:'Syracuse',record:'9–4'},
  {seed:9,team:'Miami',record:'10–3'}, {seed:10,team:'Illinois',record:'8–4'},
  {seed:11,team:'West Virginia',record:'9–3'}, {seed:12,team:'Michigan',record:'8–5'},
];
const playoffPods = [{away:12,home:5,bye:4,bowl:'Rose Bowl'},
  {away:9,home:8,bye:1,bowl:'Peach Bowl'},
  {away:11,home:6,bye:3,bowl:'Fiesta Bowl'},
  {away:10,home:7,bye:2,bowl:'Sugar Bowl'}];
const playoffBySeed = new Map(playoffField.map(t=>[t.seed,t]));
function playoffModel() {
  const baseline = new Map();
  for (const snapshot of Object.values(teamStatSnapshots)) {
    const offense = snapshot.categories.find(c=>c.title==='Offense').rows;
    const defense = snapshot.categories.find(c=>c.title==='Defense').rows;
    for (const [team,row] of Object.entries(offense)) baseline.set(team,{ppg:row[1],allowed:defense[team][1]});
  }
  const mean = [...baseline.values()].reduce((n,t)=>n+t.ppg,0)/baseline.size;
  const ratings = new Map([...baseline].map(([t,r])=>[t,{attack:.55*(r.ppg-mean),defense:.55*(r.allowed-mean)}]));
  const priors = new Map([...ratings].map(([t,r])=>[t,{...r}]));
  const rows=[]; const seen=new Set();
  for(const g of seed.games) {
    if(g.week>15||!g.scores||g.resultMethod==='Force win')continue;
    const key=[g.week,...[g.away,g.home].sort()].join('|');if(seen.has(key))continue;seen.add(key);
    const weight=(g.resultMethod==='Fair sim'?.25:g.label==='Interrupted user matchup'?.45:.8)*.9**(15-g.week);
    for(const t of [g.away,g.home])if(!ratings.has(t)){ratings.set(t,{attack:0,defense:0});priors.set(t,{attack:0,defense:0});}
    const sum=g.scores[0]+g.scores[1],margin=Math.max(-28,Math.min(28,g.scores[0]-g.scores[1]));
    const venue=g.siteUnconfirmed?0:1.25;
    rows.push([g.away,g.home,(sum+margin)/2+venue,weight],[g.home,g.away,(sum-margin)/2-venue,weight]);
  }
  // Regularized opponent adjustment around a shrunk full-season scoring baseline.
  for(let i=0;i<60;i++) {
    const sums=new Map([...ratings].map(([t])=>[t,{a:4*priors.get(t).attack,d:4*priors.get(t).defense,w:4}]));
    for(const [a,d,points,w]of rows){sums.get(a).a+=w*(points-mean-ratings.get(d).defense);sums.get(d).d+=w*(points-mean-ratings.get(a).attack);sums.get(a).w+=w;}
    // Each team has the same number and weight of attack/defense observations.
    for(const [t,s]of sums)ratings.set(t,{attack:s.a/s.w,defense:s.d/s.w});
  }
  return {mean,ratings,baseline};
}
const playoffRatings=playoffModel();
function normalCDF(x){const z=Math.abs(x)/Math.SQRT2,t=1/(1+.3275911*z);const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z);return .5*(1+Math.sign(x)*erf);}
// A cautious blend prevents a short recent game log from dominating the bracket résumé.
// Active user teams come from the commissioner's existing league roster.
function playoffPower(t) {
  const r=playoffRatings.ratings.get(t.team)||{attack:0,defense:0};
  const recentPower=r.attack-r.defense;
  const seedPrior=(13-t.seed)*1.1;
  const userTeam=isActiveTeam(t.team);
  return .35*recentPower+.65*seedPrior-(userTeam?0:7);
}
function playoffLine(a,b,home=false){
  const away=playoffBySeed.get(a),host=playoffBySeed.get(b),ra=playoffRatings.ratings.get(away.team)||{attack:0,defense:0},rb=playoffRatings.ratings.get(host.team)||{attack:0,defense:0};
  const projectedTotal=Math.max(28,2*playoffRatings.mean+ra.attack+ra.defense+rb.attack+rb.defense);
  const difference=playoffPower(host)-playoffPower(away)+(home?2.5:0);
  return {a,b,margin:Math.round(difference*2)/2,total:Math.round(projectedTotal*2)/2,p:Math.max(.01,Math.min(.99,normalCDF(-difference/18))),limited:!playoffRatings.baseline.has(away.team)||!playoffRatings.baseline.has(host.team)};
}
function americanOdds(p){const amount=p>=.5?-100*p/(1-p):100*(1-p)/p;const rounded=Math.max(100,Math.round(Math.abs(amount)/5)*5);return (amount<0?'−':'+')+rounded.toLocaleString('en-US');}
function spreadText(n){return n===0?'PK':(n>0?'+':'−')+Math.abs(n).toFixed(1);}
function playoffName(s){const t=playoffBySeed.get(s);return '#'+s+' '+t.team;}
function playoffMarket(line,context){
  const {a,b,margin,total,p,limited}=line;
  return `<article class="card playoff-game"><div class="tag">${safe(context)}</div><h2>${safe(playoffName(a))} ${context.includes('campus')?'at':'vs'} ${safe(playoffName(b))}</h2>
    <div class="playoff-market-head"><span>Team</span><span>Spread</span><span>Moneyline</span></div>
    <div class="playoff-market-row"><strong>${safe(playoffBySeed.get(a).team)}</strong><span>${spreadText(margin)} <small>−110</small></span><span>${americanOdds(Math.min(.99,p*1.045))}</span></div>
    <div class="playoff-market-row"><strong>${safe(playoffBySeed.get(b).team)}</strong><span>${spreadText(-margin)} <small>−110</small></span><span>${americanOdds(Math.min(.99,(1-p)*1.045))}</span></div>
    <p class="playoff-total">Total <b>${total.toFixed(1)}</b> <small>Over −110 / Under −110</small></p>
    ${limited?'<p class="muted">Low confidence: Miami has no supplied season stats; Michigan has only one supplied result. Missing season data uses a neutral baseline.</p>':''}</article>`;
}
function advanceDistribution(left,right,home=false){const out={};for(const [a,pa]of Object.entries(left))for(const [b,pb]of Object.entries(right)){const p=playoffLine(Number(a),Number(b),home).p;out[a]=(out[a]||0)+pa*pb*p;out[b]=(out[b]||0)+pa*pb*(1-p);}return out;}
function reportedPodResult(pod) {
  const away=playoffBySeed.get(pod.away).team,home=playoffBySeed.get(pod.home).team;
  return leagueData.games.find(g=>g.week===15&&g.scores&&g.away===away&&g.home===home);
}
function firstRoundDistribution(pod) {
  const game=reportedPodResult(pod);
  if(game)return {[game.scores[0]>game.scores[1]?pod.away:pod.home]:1};
  return advanceDistribution({[pod.away]:1},{[pod.home]:1},true);
}
function championshipProbabilities(){const quarters=playoffPods.map(p=>advanceDistribution(firstRoundDistribution(p),{[p.bye]:1}));return advanceDistribution(advanceDistribution(quarters[0],quarters[1]),advanceDistribution(quarters[2],quarters[3]));}
function firstRoundCard(pod) {
  const game=reportedPodResult(pod);
  if(!game)return playoffMarket(playoffLine(pod.away,pod.home,true),'First round · campus · pending');
  const historical=pod.home===5?'Published pregame: Houston −19 · HOU −840 / MICH +560 · Total 54.5. Houston covered; under.':'Published pregame: ASU −15 · ASU −505 / WVU +375 · Total 48. WVU won outright; under. These archived prices incorrectly applied a CPU penalty to WVU; current projections use its corrected user status.';
  return card('First round · FINAL',`<h3>${safe(gameResult(game))}</h3><p>${teamButton(game.scores[0]>game.scores[1]?game.away:game.home)} advances to the ${safe(pod.bowl)}.</p><p class="muted">${safe(historical)}</p>${gameBoxScore(game)}`);
}
function playoffOddsView(){
 const probabilities=championshipProbabilities();
 const futures=playoffField.slice().sort((a,b)=>(probabilities[b.seed]||0)-(probabilities[a.seed]||0));
 return card('2027 Playoff Odds',`<p>Houston and West Virginia advance. Two first-round games remain pending.</p><div class="notice">Updated after the reported first-round finals · West Virginia classified as a USER team</div><p class="muted">Current projections include available Weeks 9–15 finals and the corrected user roster. First round assumes the higher seed hosts; quarterfinals and later rounds use neutral fields. Dates and kickoff times have not been supplied.</p>`)
 +card('National championship futures',`<p class="muted">Outright winner · American odds · Eliminated teams remain visible</p><div class="data-scroll"><table><thead><tr><th>Team</th><th>Record</th><th>Title odds</th><th>Model chance</th></tr></thead><tbody>${futures.map(t=>{const p=probabilities[t.seed]||0;return `<tr><td>${teamButton(t.team)}<small class="line-sample">#${t.seed}${p===0?' · Eliminated':t.seed<=4?' · First-round bye':''}</small></td><td>${currentTeamRecord(t.team)}</td><td><b>${p===0?'Eliminated':americanOdds(p*1.12)}</b></td><td>${(100*p).toFixed(1)}%</td></tr>`;}).join('')}</tbody></table></div><p class="muted">Model chances total 100% before rounding. Futures include a 12% market margin; moneylines approximately 4.5%. Estimates for the remaining bracket, not live sportsbook prices.</p>`)
 +`<section class="card"><h2>Round 1 · Results & remaining games</h2><p class="muted">Published prices for completed games are archived as originally displayed; pending games use current projections.</p></section><div class="grid">${playoffPods.map(firstRoundCard).join('')}</div>`
 +`<section class="card"><h2>Round 2 · Quarterfinals</h2><p class="muted">Confirmed matchups are shown where a first-round final has been supplied. Both possible opponents remain listed for pending games.</p></section>`
 +playoffPods.map(p=>{const result=reportedPodResult(p),opponents=result?[result.scores[0]>result.scores[1]?p.away:p.home]:[p.away,p.home];return `<section class="card"><h3>${safe(p.bowl)} · ${result?'Confirmed matchup':'Opponent pending'}</h3></section><div class="grid">${opponents.map(s=>playoffMarket(playoffLine(s,p.bye),p.bowl+' · neutral field')).join('')}</div>`;}).join('')
 +card('How these odds are built',`<p>Full-season points scored and allowed provide a shrunk starting rating. Available Weeks 9–15 finals adjust offense and defense for opponent strength, with recent games weighted more heavily and margins capped at 28. Strength blends 35% scoring-model rating and 65% seed-based résumé prior. Force wins are excluded; fair sims and interrupted games are discounted. The season baseline and recent finals overlap, so this is a heuristic league projection rather than a calibrated betting model.</p><p>Home field is worth 2.5 points. Game-margin uncertainty is 18 points. CPU teams outside the explicit active-user roster receive a seven-point discount. West Virginia is a user and receives no CPU discount. Michigan and Miami have limited season data. Reported first-round winners advance with certainty; eliminated teams have zero title probability. Remaining games follow the supplied bracket.</p><p>The semifinal pairings are Rose/Peach and Fiesta/Sugar. The championship is at Caesars Superdome in New Orleans.</p>`);
}
