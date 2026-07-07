// Setup-Assistent: CSV hochladen -> Turnierform wählen -> Zeit/Plätze -> erstellen.

const state = {
  participants: [],
  hasTeamColumn: false,
  teams: [],
  format: null,
  formatOptions: {},
};

const el = (id) => document.getElementById(id);

// ---------- Schritt 1: CSV ----------

el("csvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const result = CsvParser.parseCsv(text);
  const errBox = el("csvError");
  if (result.error) {
    errBox.textContent = result.error;
    errBox.style.display = "block";
    el("csvSummary").innerHTML = "";
    return;
  }
  errBox.style.display = "none";
  state.participants = result.participants;
  state.hasTeamColumn = result.hasTeamColumn;

  if (result.hasTeamColumn) {
    state.teams = CsvParser.buildTeamsFromColumn(result.participants);
    el("teamSizeBlock").style.display = "none";
  } else {
    el("teamSizeBlock").style.display = "block";
    rebuildAutoTeams();
  }

  renderCsvSummary();
  el("card-format").style.display = "block";
});

el("teamSize").addEventListener("input", () => {
  rebuildAutoTeams();
  renderCsvSummary();
  recomputeCapacity();
});

function rebuildAutoTeams() {
  const size = parseInt(el("teamSize").value, 10) || 6;
  state.teams = CsvParser.autoBuildTeams(state.participants, size);
}

function renderCsvSummary() {
  el("csvSummary").innerHTML =
    `<p class="hint">${state.participants.length} Teilnehmer erkannt · <strong>${state.teams.length} Teams</strong>` +
    (state.hasTeamColumn ? " (aus CSV-Spalte)" : " (automatisch gebildet)") + `</p>`;
}

// ---------- Schritt 2: Format ----------

document.querySelectorAll(".format-choice").forEach((elm) => {
  elm.addEventListener("click", () => {
    document.querySelectorAll(".format-choice").forEach((x) => x.classList.remove("selected"));
    elm.classList.add("selected");
    state.format = elm.dataset.format;
    renderFormatOptions();
    el("card-time").style.display = "block";
    recomputeCapacity();
  });
});

function renderFormatOptions() {
  const box = el("formatOptions");
  const teamCount = state.teams.length || 0;
  if (state.format === "gruppe_ko") {
    const suggested = TournamentEngine.suggestGroupCount(teamCount);
    box.innerHTML = `
      <label for="optGroupCount">Anzahl Gruppen (Vorschlag: ${suggested})</label>
      <input type="number" id="optGroupCount" min="1" max="${Math.max(1, teamCount)}" value="${suggested}" />
      <label for="optQualifiers">Wie viele Teams pro Gruppe kommen weiter?</label>
      <input type="number" id="optQualifiers" min="1" max="4" value="2" />
    `;
  } else if (state.format === "champions") {
    const suggestedGames = Math.min(4, Math.max(1, teamCount - 1));
    box.innerHTML = `
      <label for="optGames">Spiele pro Team (garantiert)</label>
      <input type="number" id="optGames" min="1" max="${Math.max(1, teamCount - 1)}" value="${suggestedGames}" />
      <label for="optKoSlots">Wie viele Teams kommen in die K.O.-Runde? (2, 4 oder 8)</label>
      <select id="optKoSlots">
        <option value="2">2 (Finale direkt)</option>
        <option value="4" selected>4</option>
        <option value="8">8</option>
      </select>
    `;
  } else {
    box.innerHTML = `<p class="hint">Jedes Team spielt einmal gegen jedes andere Team. Kein K.O. nötig.</p>`;
  }
  box.querySelectorAll("input, select").forEach((input) => input.addEventListener("input", recomputeCapacity));
}

// ---------- Schritt 3: Zeit & Plätze ----------

["startTime", "availableMinutes", "matchDuration", "breakDuration", "courts"].forEach((id) => {
  el(id).addEventListener("input", recomputeCapacity);
});

function buildGroupRoundsForPreview() {
  const teamIds = state.teams.map((t) => t.id);
  if (state.format === "liga") {
    return TournamentEngine.generateRoundRobin(teamIds).map((r) => r.map((p) => ({ ...p, phase: "group" })));
  }
  if (state.format === "champions") {
    const games = parseInt(el("optGames")?.value, 10) || 3;
    return TournamentEngine.generateFixedGamesSchedule(teamIds, games);
  }
  if (state.format === "gruppe_ko") {
    const groupCount = parseInt(el("optGroupCount")?.value, 10) || TournamentEngine.suggestGroupCount(teamIds.length);
    const groups = TournamentEngine.splitIntoGroups(teamIds, Math.max(1, groupCount));
    return TournamentEngine.combineGroupRounds(groups);
  }
  return [];
}

function recomputeCapacity() {
  if (!state.format || state.teams.length < 2) return;
  const courts = Math.max(1, parseInt(el("courts").value, 10) || 1);
  const matchDuration = Math.max(1, parseInt(el("matchDuration").value, 10) || 8);
  const breakDuration = Math.max(0, parseInt(el("breakDuration").value, 10) || 0);
  const availableMinutes = Math.max(1, parseInt(el("availableMinutes").value, 10) || 60);

  const rounds = buildGroupRoundsForPreview();
  const cap = TournamentEngine.checkCapacity(rounds, courts, matchDuration, breakDuration, availableMinutes);

  const hintBox = el("capacityHint");
  if (cap.fits) {
    hintBox.innerHTML = `<p class="hint"><span class="badge ok">passt</span> ${cap.totalMatches} Gruppenspiele brauchen ca. ${cap.neededMinutes} Min. (K.O.-Runde kommt danach dazu, je nach Ergebnis).</p>`;
  } else {
    hintBox.innerHTML = `<p class="hint"><span class="badge warn">knapp</span> ${cap.totalMatches} Spiele brauchen ca. ${cap.neededMinutes} Min., aber nur ${cap.availableMinutes} Min. verfügbar. Vorschlag: ${cap.suggestedCourts} Plätze statt ${courts}.</p>`;
  }
  el("card-create").style.display = "block";
  el("createSummary").textContent =
    `${state.teams.length} Teams · ${formatLabel(state.format)} · ${courts} Plätze · Start ${el("startTime").value} · ca. ${Math.round(cap.neededMinutes)} Min. für die Gruppenphase.`;
}

function formatLabel(f) {
  return { liga: "Liga-Modus", gruppe_ko: "Gruppenphase + K.O.", champions: "Champions-Liga-Modus" }[f] || f;
}

// ---------- Schritt 4: Erstellen ----------

el("btnCreate").addEventListener("click", async () => {
  const btn = el("btnCreate");
  btn.disabled = true;
  btn.textContent = "Erstelle Turnier…";
  const errBox = el("createError");
  errBox.style.display = "none";
  try {
    await createTournament();
  } catch (err) {
    console.error(err);
    errBox.textContent = "Fehler beim Erstellen: " + err.message;
    errBox.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Turnier erstellen & Spielplan generieren";
  }
});

async function createTournament() {
  const name = el("turnierName").value.trim() || "Camp-Turnier";
  const courts = Math.max(1, parseInt(el("courts").value, 10) || 1);
  const matchDuration = Math.max(1, parseInt(el("matchDuration").value, 10) || 8);
  const breakDuration = Math.max(0, parseInt(el("breakDuration").value, 10) || 0);
  const startTimeStr = el("startTime").value || "09:00";
  const today = new Date();
  const [hh, mm] = startTimeStr.split(":").map(Number);
  const startDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hh, mm, 0);

  const teams = {};
  state.teams.forEach((t) => (teams[t.id] = { id: t.id, name: t.name, players: t.players }));

  let groups = null;
  let rounds;
  const teamIds = state.teams.map((t) => t.id);

  if (state.format === "liga") {
    rounds = TournamentEngine.generateRoundRobin(teamIds).map((r) => r.map((p) => ({ ...p, phase: "group" })));
  } else if (state.format === "champions") {
    const games = parseInt(el("optGames").value, 10) || 3;
    rounds = TournamentEngine.generateFixedGamesSchedule(teamIds, games);
  } else if (state.format === "gruppe_ko") {
    const groupCount = Math.max(1, parseInt(el("optGroupCount").value, 10) || 1);
    const groupList = TournamentEngine.splitIntoGroups(teamIds, groupCount);
    groups = {};
    groupList.forEach((g) => (groups[g.id] = { id: g.id, name: g.name, teamIds: g.teamIds }));
    rounds = TournamentEngine.combineGroupRounds(groupList);
  }

  const { matches, endTime } = TournamentEngine.scheduleRounds(rounds, courts, matchDuration, breakDuration, startDateTime);
  const matchesObj = {};
  matches.forEach((m, i) => (matchesObj["m" + i] = m));

  const formatOptions = {};
  if (state.format === "gruppe_ko") {
    formatOptions.qualifiersPerGroup = parseInt(el("optQualifiers").value, 10) || 2;
  } else if (state.format === "champions") {
    formatOptions.koSlots = parseInt(el("optKoSlots").value, 10) || 4;
  }

  const code = await CampSync.reserveUniqueCode();
  const turnierData = {
    meta: {
      name,
      format: state.format,
      formatOptions,
      courts,
      matchDuration,
      breakDuration,
      startTime: startDateTime.toISOString(),
      groupPhaseEndTime: endTime,
      phase: "gruppenphase",
      createdAt: new Date().toISOString(),
    },
    teams,
    groups: groups || null,
    matches: matchesObj,
    ko: null,
  };

  await CampSync.createTurnier(code, turnierData);

  el("resultCode").value = code;
  const liveUrl = new URL("live.html", window.location.href);
  liveUrl.searchParams.set("code", code);
  el("resultLiveLink").value = liveUrl.toString();
  localStorage.setItem("lastCode", code);

  document.querySelectorAll(".card").forEach((c) => (c.style.display = "none"));
  el("card-done").style.display = "block";
}

el("btnCopyLink").addEventListener("click", () => {
  el("resultLiveLink").select();
  navigator.clipboard?.writeText(el("resultLiveLink").value);
});

el("btnGoManage").addEventListener("click", () => {
  const code = el("resultCode").value;
  window.location.href = "manage.html?code=" + code;
});

// ---------- Bestehendes Turnier öffnen ----------

el("btnJoin").addEventListener("click", async () => {
  const code = el("joinCode").value.trim().toUpperCase();
  const errBox = el("joinError");
  errBox.style.display = "none";
  if (!code) return;
  const exists = await CampSync.codeExists(code);
  if (!exists) {
    errBox.textContent = "Kein Turnier mit diesem Code gefunden.";
    errBox.style.display = "block";
    return;
  }
  window.location.href = "manage.html?code=" + code;
});

// letzten Code vorausfüllen, falls vorhanden
const lastCode = localStorage.getItem("lastCode");
if (lastCode) el("joinCode").value = lastCode;
