// Live-Verwaltung eines Turniers: Ergebnisse eintragen, Tabelle, K.O.-Steuerung.

const params = new URLSearchParams(window.location.search);
const CODE = (params.get("code") || "").toUpperCase();
if (!CODE) {
  document.body.innerHTML = "<p style='padding:20px'>Kein Turnier-Code angegeben. <a href='index.html'>Zurück</a></p>";
  throw new Error("no code");
}

let currentData = null;
let activeTab = "spielplan";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    ["spielplan", "tabelle", "ko"].forEach((t) => (document.getElementById("tab-" + t).style.display = t === activeTab ? "block" : "none"));
    render();
  });
});

document.getElementById("btnShare").addEventListener("click", () => {
  const url = new URL("live.html", window.location.href);
  url.searchParams.set("code", CODE);
  navigator.clipboard?.writeText(url.toString());
  alert("Live-Link kopiert:\n" + url.toString());
});

CampSync.listen(CODE, (data) => {
  if (!data) {
    document.body.innerHTML = "<p style='padding:20px'>Turnier nicht gefunden.</p>";
    return;
  }
  currentData = data;
  document.getElementById("turnierTitel").textContent = data.meta.name;
  document.getElementById("turnierSub").textContent = "Code: " + CODE + " · " + formatLabel(data.meta.format);
  render();
});

function formatLabel(f) {
  return { liga: "Liga-Modus", gruppe_ko: "Gruppenphase + K.O.", champions: "Champions-Liga-Modus" }[f] || f;
}

function teamName(id) {
  if (!id) return "Freilos";
  return currentData.teams?.[id]?.name || id;
}

function fmtTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function render() {
  if (!currentData) return;
  if (activeTab === "spielplan") renderSpielplan();
  if (activeTab === "tabelle") renderTabelle();
  if (activeTab === "ko") renderKo();
}

// ---------- Spielplan ----------

function renderSpielplan() {
  const box = document.getElementById("tab-spielplan");
  const matches = Object.entries(currentData.matches || {}).map(([id, m]) => ({ id, ...m }));
  matches.sort((a, b) => new Date(a.start) - new Date(b.start) || a.court - b.court);

  if (matches.length === 0) {
    box.innerHTML = `<div class="empty-state"><div class="icon">⚽</div>Noch keine Spiele.</div>`;
    return;
  }

  let html = "";
  let lastRound = null;
  matches.forEach((m) => {
    if (m.round !== lastRound) {
      html += `<div class="group-title">Runde ${m.round} · ab ${fmtTime(m.start)} Uhr</div>`;
      lastRound = m.round;
    }
    html += matchCardHtml(m);
  });

  const allGroupDone = matches.every((m) => m.status === "done");
  if (currentData.meta.format !== "liga" && currentData.meta.phase === "gruppenphase") {
    html += `<button class="btn btn-success" id="btnStartKo" ${allGroupDone ? "" : "disabled"}>K.O.-Runde starten${allGroupDone ? "" : " (erst alle Spiele eintragen)"}</button>`;
  }

  box.innerHTML = html;
  bindScoreInputs(box, "matches");

  const btnStartKo = document.getElementById("btnStartKo");
  if (btnStartKo) btnStartKo.addEventListener("click", startKoPhase);
}

function matchCardHtml(m) {
  const done = m.status === "done";
  const groupTag = m.groupId ? currentData.groups?.[m.groupId]?.name : null;
  return `
    <div class="match-card" data-match-id="${m.id}">
      <div class="teams">
        <span class="court-tag">Platz ${m.court}</span>${fmtTime(m.start)} Uhr ${groupTag ? " · " + groupTag : ""}<br/>
        ${teamName(m.teamA)} <span style="color:#9aa0a8">vs</span> ${teamName(m.teamB)}
      </div>
      <div class="score-inputs">
        <input type="number" min="0" class="score scoreA" value="${m.scoreA ?? ""}" ${done ? "" : ""} />
        <span>:</span>
        <input type="number" min="0" class="score scoreB" value="${m.scoreB ?? ""}" />
        <button class="btn btn-primary btn-save" style="width:auto;padding:8px 12px;font-size:13px">${done ? "✓" : "OK"}</button>
      </div>
    </div>
  `;
}

function bindScoreInputs(container, basePath) {
  container.querySelectorAll(".match-card").forEach((card) => {
    const matchId = card.dataset.matchId;
    const saveBtn = card.querySelector(".btn-save");
    saveBtn.addEventListener("click", async () => {
      const a = parseInt(card.querySelector(".scoreA").value, 10);
      const b = parseInt(card.querySelector(".scoreB").value, 10);
      if (isNaN(a) || isNaN(b)) return;
      await CampSync.patch(CODE, basePath + "/" + matchId, { scoreA: a, scoreB: b, status: "done" });
    });
  });
}

// ---------- Tabelle ----------

function renderTabelle() {
  const box = document.getElementById("tab-tabelle");
  const teams = Object.values(currentData.teams || {});
  const matches = Object.values(currentData.matches || {});

  if (currentData.groups) {
    const groups = Object.values(currentData.groups);
    const byGroup = TournamentEngine.standingsByGroup(teams, groups, matches);
    box.innerHTML = byGroup.map((g) => `<div class="group-title">${g.groupName}</div>${tableHtml(g.standings)}`).join("");
  } else {
    const standings = TournamentEngine.computeStandings(teams, matches);
    box.innerHTML = tableHtml(standings);
  }
}

function tableHtml(standings) {
  return `
    <table class="tabelle">
      <thead><tr><th>Team</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>Tore</th><th>Diff</th><th>Pkt</th></tr></thead>
      <tbody>
        ${standings.map((s) => `
          <tr>
            <td class="name">${s.name}</td>
            <td>${s.played}</td><td>${s.wins}</td><td>${s.draws}</td><td>${s.losses}</td>
            <td>${s.goalsFor}:${s.goalsAgainst}</td><td>${s.goalDiff}</td><td>${s.points}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---------- K.O. ----------

function renderKo() {
  const box = document.getElementById("tab-ko");
  const ko = currentData.ko;
  if (!ko) {
    box.innerHTML = `<div class="empty-state"><div class="icon">🏅</div>Die K.O.-Runde startet, sobald die Gruppenphase beendet ist (Tab "Spielplan").</div>`;
    return;
  }
  const roundKeys = Object.keys(ko.rounds).sort((a, b) => Number(a) - Number(b));
  let html = "";
  roundKeys.forEach((rk) => {
    const round = ko.rounds[rk];
    const matches = Object.entries(round.matches).map(([id, m]) => ({ id, ...m }));
    const isFinal = matches.length === 1;
    html += `<div class="bracket-round"><h4>${isFinal ? "Finale" : "Runde " + (Number(rk) + 1)}</h4>`;
    matches.forEach((m) => {
      if (m.status === "walkover") {
        html += `<div class="match-card"><div class="teams">${teamName(m.teamA)} <span style="color:#9aa0a8">Freilos</span></div><div class="badge ok">weiter</div></div>`;
      } else {
        html += matchCardHtml(m).replace('data-match-id="', `data-path="ko/rounds/${rk}/matches" data-match-id="`);
      }
    });
    html += `</div>`;
  });

  const lastRoundKey = roundKeys[roundKeys.length - 1];
  const lastRound = ko.rounds[lastRoundKey];
  const lastMatches = Object.values(lastRound.matches);
  const allDone = lastMatches.every((m) => m.status === "done" || m.status === "walkover");
  const isFinalRound = lastMatches.length === 1;

  if (isFinalRound && allDone) {
    const finalMatch = lastMatches[0];
    const champion = finalMatch.status === "walkover" ? finalMatch.teamA : (finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamA : finalMatch.teamB);
    html = `<div class="empty-state"><div class="icon">🏆</div><h2 style="color:var(--rot)">${teamName(champion)}</h2>ist Turniersieger!</div>` + html;
  } else if (allDone) {
    html += `<button class="btn btn-success" id="btnNextRound">Nächste K.O.-Runde starten</button>`;
  } else {
    html += `<p class="hint">Trage alle Ergebnisse dieser Runde ein, um die nächste Runde freizuschalten.</p>`;
  }

  box.innerHTML = html;
  bindKoScoreInputs(box);

  const btnNext = document.getElementById("btnNextRound");
  if (btnNext) btnNext.addEventListener("click", () => advanceKoRound(Number(lastRoundKey)));
}

function bindKoScoreInputs(container) {
  container.querySelectorAll(".match-card[data-path]").forEach((card) => {
    const path = card.dataset.path;
    const matchId = card.dataset.matchId;
    const saveBtn = card.querySelector(".btn-save");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", async () => {
      const a = parseInt(card.querySelector(".scoreA").value, 10);
      const b = parseInt(card.querySelector(".scoreB").value, 10);
      if (isNaN(a) || isNaN(b)) return;
      if (a === b) {
        alert("Im K.O.-System muss es einen Sieger geben (z.B. nach 9m-Schießen). Bitte den entscheidenden Treffer/Schützen im Ergebnis einrechnen, z.B. 3:2.");
        return;
      }
      await CampSync.patch(CODE, path + "/" + matchId, { scoreA: a, scoreB: b, status: "done" });
    });
  });
}

async function startKoPhase() {
  const format = currentData.meta.format;
  const teams = Object.values(currentData.teams || {});
  const matches = Object.values(currentData.matches || {});
  let qualifiers = [];

  if (format === "gruppe_ko") {
    const groups = Object.values(currentData.groups || {});
    const perGroup = currentData.meta.formatOptions?.qualifiersPerGroup || 2;
    const byGroup = TournamentEngine.standingsByGroup(teams, groups, matches);
    // Crossing-Reihenfolge: erst alle 1. Plätze, dann alle 2. Plätze usw.
    for (let pos = 0; pos < perGroup; pos++) {
      byGroup.forEach((g) => {
        if (g.standings[pos]) qualifiers.push(g.standings[pos].teamId);
      });
    }
  } else if (format === "champions") {
    const slots = currentData.meta.formatOptions?.koSlots || 4;
    const standings = TournamentEngine.computeStandings(teams, matches);
    qualifiers = standings.slice(0, slots).map((s) => s.teamId);
  } else {
    return; // Liga-Modus hat kein K.O.
  }

  const bracket = TournamentEngine.buildKnockoutBracket(qualifiers);
  await writeKoRound(0, bracket.rounds[0], qualifiers);
  await CampSync.patch(CODE, "meta", { phase: "ko" });
}

async function advanceKoRound(prevRoundIdx) {
  const prevRound = currentData.ko.rounds[prevRoundIdx];
  const prevMatches = Object.values(prevRound.matches).map((m) => ({
    ...m,
    winner: m.status === "walkover" ? m.teamA : (m.scoreA > m.scoreB ? m.teamA : m.teamB),
  }));
  const nextPairs = TournamentEngine.nextKnockoutRound(prevMatches);
  if (!nextPairs || nextPairs.length === 0) return;
  await writeKoRound(prevRoundIdx + 1, nextPairs, null);
}

async function writeKoRound(roundIdx, pairs, qualifiersForMeta) {
  const courts = currentData.meta.courts;
  const matchDuration = currentData.meta.matchDuration;
  const breakDuration = currentData.meta.breakDuration;
  const startFrom = new Date(); // K.O. startet direkt jetzt

  const real = pairs.filter((p) => p.teamA && p.teamB);
  const byes = pairs.filter((p) => (p.teamA && !p.teamB) || (!p.teamA && p.teamB));

  const roundMatches = {};
  let idx = 0;
  byes.forEach((p) => {
    roundMatches["k" + idx++] = {
      teamA: p.teamA || p.teamB,
      teamB: null,
      status: "walkover",
      phase: "ko",
      scoreA: null,
      scoreB: null,
    };
  });

  if (real.length > 0) {
    const { matches } = TournamentEngine.scheduleRounds([real], courts, matchDuration, breakDuration, startFrom);
    matches.forEach((m) => (roundMatches["k" + idx++] = m));
  }

  const update = { ["ko/rounds/" + roundIdx]: { matches: roundMatches } };
  if (qualifiersForMeta) update["ko/qualifiers"] = qualifiersForMeta;
  await CampSync.patch(CODE, "", update);
}
