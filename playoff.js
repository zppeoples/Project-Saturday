// Frozen pre-playoff snapshot. In-game seeds/records are commissioner-provided.
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
    if(g.week>14||!g.scores||g.resultMethod==='Force win')continue;
    const key=[g.week,...[g.away,g.home].sort()].join('|');if(seen.has(key))continue;seen.add(key);
    const weight=(g.resultMethod==='Fair sim'?.25:g.label==='Interrupted user matchup'?.45:.8)*.9**(14-g.week);
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
function championshipProbabilities(){const quarters=playoffPods.map(p=>advanceDistribution(advanceDistribution({[p.away]:1},{[p.home]:1},true),{[p.bye]:1}));return advanceDistribution(advanceDistribution(quarters[0],quarters[1]),advanceDistribution(quarters[2],quarters[3]));}
const playoffTitleProbabilities=championshipProbabilities();
function playoffOddsView(){
 const futures=playoffField.slice().sort((a,b)=>playoffTitleProbabilities[b.seed]-playoffTitleProbabilities[a.seed]);
 return card('2027 Playoff Odds',`<p>Four first-round games. Eight possible quarterfinal matchups. One national champion.</p><div class="notice">Projected dynasty lines · Frozen after conference championships · No live sportsbook prices</div><p class="muted">First round assumes the higher seed hosts. Quarterfinals and later rounds use neutral fields. Dates and kickoff times have not been supplied.</p>`)
 +card('National championship futures',`<p class="muted">Outright winner · American odds · All 12 teams, including four byes</p><div class="playoff-scroll"><table><thead><tr><th>Team</th><th>Record</th><th>Title odds</th><th>Model chance</th></tr></thead><tbody>${futures.map(t=>`<tr><td>${safe(playoffName(t.seed))}${t.seed<=4?'<small class="line-sample">First-round bye</small>':''}</td><td>${t.record}</td><td><b>${americanOdds(playoffTitleProbabilities[t.seed]*1.12)}</b></td><td>${(100*playoffTitleProbabilities[t.seed]).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div><p class="muted">Model chances total 100% before rounding. Displayed futures odds include a 12% market margin; moneylines include approximately 4.5%. These are estimates, not guarantees.</p>`)
 +`<section class="card"><h2>Round 1 · Campus games</h2><p class="muted">Spreads and totals priced at −110 each side.</p></section><div class="grid">${playoffPods.map(p=>playoffMarket(playoffLine(p.away,p.home,true),'First round · campus')).join('')}</div>`
 +`<section class="card"><h2>Round 2 · Hypothetical quarterfinals</h2><p class="muted">Both possible opponents for every bye team. Each projection assumes today’s ratings; it does not predict injuries or changes after Round 1.</p></section>`
 +playoffPods.map(p=>`<section class="card"><h3>${safe(p.bowl)} · ${safe(playoffName(p.bye))} awaits</h3></section><div class="grid">${[p.away,p.home].map(s=>playoffMarket(playoffLine(s,p.bye),p.bowl+' · neutral field')).join('')}</div>`).join('')
 +card('How these odds are built',`<p>Full-season points scored and allowed provide a shrunk starting rating. Available Weeks 9–14 scores adjust offense and defense for opponent strength, with recent games weighted more heavily and margins capped at 28 points. The final strength rating blends 35% scoring-model strength with a 65% seed-based résumé prior, so a single blowout does not overwhelm a team’s playoff position. Force wins are excluded from the game fit; fair sims and interrupted games carry less weight. Season totals and recent results overlap, so this is a heuristic projection rather than a calibrated betting system.</p><p>Campus home field is worth 2.5 points. An 18-point game-margin uncertainty keeps win probabilities less certain than the original model. CPU teams outside the commissioner’s active user roster receive a seven-point strength discount, an editorial dynasty assumption rather than a measured real-world effect. Championship chances follow the exact bracket, including each bye and every potential opponent. Miami has no supplied season statistics and Michigan has only one supplied game; their estimates are especially uncertain. No roster ratings, injury reports, weather, pace, or betting-market action were supplied.</p><p>The top semifinal pairs the Rose and Peach winners; the bottom pairs the Fiesta and Sugar winners. The national championship is in New Orleans at Caesars Superdome.</p>`);
}
