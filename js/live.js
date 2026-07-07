// Öffentliche Live-Ansicht (schreibgeschützt) für Eltern & Zuschauer.

const params = new URLSearchParams(window.location.search);
const CODE = (params.get("code") || "").toUpperCase();
const content = document.getElementById("content");

if (!CODE) {
  content.innerHTML = `<div class="empty-state"><div class="icon">❓</div>Kein Turnier-Code in der Adresse gefunden.</div>`;
} else {
  CampSync.listen(CODE, render);
}

function teamName(data, id) {
  if (!id) return "Freilos";
  return data.teams?.[id]?.name || id;
}

function fmtTime(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function render(data) {
  if (!data) {
    content.innerHTML = `<div class="empty-state"><div class="icon">❓</div>Turnier nicht gefunden.</div>`;
    return;
  }
  document.getElementById("turnierTitel").textContent = data.meta.name;

  const teams = Object.values(data.teams || {});
  const matches = Object.entries(data.matches || {}).map(([id, m]) => ({ id, ...m }));
  matches.sort((a, b) => new Date(a.start) - new Date(b.start) || a.court - b.court);

  let html = "";

  // Champion-Banner
  if (data.ko) {
    const roundKeys = Object.keys(data.ko.rounds).sort((a, b) => Number(a) - Number(b));
    const lastRound = data.ko.rounds[roundKeys[roundKeys.length - 1]];
    const lastMatches = Object.values(lastRound.matches);
    if (lastMatches.length === 1) {
      const fm = lastMatches[0];
      const done = fm.status === "done" || fm.status === "walkover";
      if (done) {
        const champion = fm.status === "walkover" ? fm.teamA : (fm.scoreA > fm.scoreB ? fm.teamA : fm.teamB);
        html += `<div class="card" style="text-align:center;background:linear-gradient(135deg,#d31920,#a8121a);color:#fff;border:none">
          <div style="font-size:36px">🏆</div>
          <h2 style="color:#fff;font-size:20px;margin:6px 0 2px">${teamName(data, champion)}</h2>
          <div style="opacity:0.9;font-size:13px">ist Turniersieger!</div>
        </div>`;
      }
    }
  }

  // Aktuelle & nächste Spiele
  const upcoming = matches.filter((m) => m.status !== "done").slice(0, data.meta.courts * 2);
  if (upcoming.length > 0) {
    html += `<div class="card"><h2>⏱️ Aktuelle & nächste Spiele</h2>`;
    upcoming.forEach((m) => {
      const groupTag = m.groupId ? data.groups?.[m.groupId]?.name : (m.phase === "ko" ? "K.O." : "");
      html += `<div class="match-card">
        <div class="teams">
          <span class="court-tag">Platz ${m.court}</span>${fmtTime(m.start)} Uhr ${groupTag ? " · " + groupTag : ""}<br/>
          ${teamName(data, m.teamA)} <span style="color:#9aa0a8">vs</span> ${teamName(data, m.teamB)}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Tabelle(n)
  html += `<div class="card"><h2>📊 Tabelle</h2>`;
  if (data.groups) {
    const groups = Object.values(data.groups);
    TournamentEngine.standingsByGroup(teams, groups, matches.filter((m) => !m.phase || m.phase === "group")).forEach((g) => {
      html += `<div class="group-title">${g.groupName}</div>${tableHtml(g.standings)}`;
    });
  } else {
    const standings = TournamentEngine.computeStandings(teams, matches.filter((m) => !m.phase || m.phase === "group"));
    html += tableHtml(standings);
  }
  html += `</div>`;

  // K.O.-Baum
  if (data.ko) {
    html += `<div class="card"><h2>🏅 K.O.-Runde</h2>`;
    const roundKeys = Object.keys(data.ko.rounds).sort((a, b) => Number(a) - Number(b));
    roundKeys.forEach((rk) => {
      const round = data.ko.rounds[rk];
      const ms = Object.values(round.matches);
      const isFinal = ms.length === 1;
      html += `<div class="bracket-round"><h4>${isFinal ? "Finale" : "Runde " + (Number(rk) + 1)}</h4>`;
      ms.forEach((m) => {
        const done = m.status === "done" || m.status === "walkover";
        const scoreText = m.status === "walkover" ? "Freilos" : done ? `${m.scoreA} : ${m.scoreB}` : fmtTime(m.start) + " Uhr";
        html += `<div class="match-card"><div class="teams">${teamName(data, m.teamA)} <span style="color:#9aa0a8">vs</span> ${teamName(data, m.teamB)}</div><div class="meta">${scoreText}</div></div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  content.innerHTML = html;
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
