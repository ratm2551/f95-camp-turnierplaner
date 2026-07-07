// Turnier-Engine: Spielplan-Generierung, Zeitplanung, Tabellen, KO-Baum.
// Reine Logik, keine DOM-/Firebase-Abhängigkeiten -> einfach testbar.

(function (root) {

  function generateRoundRobin(teamIds) {
    const list = [...teamIds];
    if (list.length < 2) return [];
    const hasBye = list.length % 2 !== 0;
    if (hasBye) list.push(null);
    const n = list.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i];
        const b = list[n - 1 - i];
        if (a !== null && b !== null) {
          pairs.push(r % 2 === 0 ? { teamA: a, teamB: b } : { teamA: b, teamB: a });
        }
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  function splitIntoGroups(teamIds, numGroups) {
    const groups = Array.from({ length: numGroups }, () => []);
    teamIds.forEach((id, i) => groups[i % numGroups].push(id));
    return groups.map((teamIds, i) => ({ id: "G" + (i + 1), name: "Gruppe " + String.fromCharCode(65 + i), teamIds }));
  }

  function suggestGroupCount(teamCount) {
    if (teamCount <= 5) return 1;
    if (teamCount <= 10) return 2;
    if (teamCount <= 16) return 3;
    return Math.ceil(teamCount / 5);
  }

  // Kombiniert die Rundenpläne mehrerer unabhängiger Gruppen zu gemeinsamen Wellen,
  // damit Gruppen parallel auf verschiedenen Plätzen spielen können.
  function combineGroupRounds(groups) {
    const perGroupRounds = groups.map((g) => generateRoundRobin(g.teamIds));
    const maxRounds = Math.max(0, ...perGroupRounds.map((r) => r.length));
    const combined = [];
    for (let r = 0; r < maxRounds; r++) {
      let waveMatches = [];
      perGroupRounds.forEach((rounds, gi) => {
        if (rounds[r]) {
          waveMatches = waveMatches.concat(
            rounds[r].map((p) => ({ ...p, groupId: groups[gi].id, phase: "group" }))
          );
        }
      });
      combined.push(waveMatches);
    }
    return combined;
  }

  // Champions-Liga-Modus: jedes Team spielt genau `gamesPerTeam` Spiele aus einem
  // vollständigen, ausbalancierten Rundenplan (keine Wiederholungen von Gegnern).
  function generateFixedGamesSchedule(teamIds, gamesPerTeam) {
    const full = generateRoundRobin(teamIds);
    const rounds = full.slice(0, Math.min(gamesPerTeam, full.length));
    return rounds.map((r) => r.map((p) => ({ ...p, phase: "group" })));
  }

  function slotMinutes(matchDuration, breakDuration) {
    return matchDuration + breakDuration;
  }

  // Verteilt Runden (Array von Runden, jede Runde ein Array von Paarungen) auf
  // Plätze/Zeitfenster. Jede Runde wird in "Wellen" von max. `courts` Spielen zerlegt.
  function scheduleRounds(rounds, courts, matchDuration, breakDuration, startDateTime) {
    const slotLen = slotMinutes(matchDuration, breakDuration);
    let currentStart = new Date(startDateTime);
    const scheduled = [];
    rounds.forEach((roundMatches, roundIdx) => {
      for (let i = 0; i < roundMatches.length; i += courts) {
        const wave = roundMatches.slice(i, i + courts);
        wave.forEach((pair, courtIdx) => {
          const start = new Date(currentStart);
          const end = new Date(start.getTime() + matchDuration * 60000);
          scheduled.push({
            round: roundIdx + 1,
            court: courtIdx + 1,
            groupId: pair.groupId || null,
            phase: pair.phase || "group",
            teamA: pair.teamA,
            teamB: pair.teamB,
            start: start.toISOString(),
            end: end.toISOString(),
            scoreA: null,
            scoreB: null,
            status: "scheduled",
          });
        });
        currentStart = new Date(currentStart.getTime() + slotLen * 60000);
      }
    });
    return { matches: scheduled, endTime: currentStart.toISOString() };
  }

  function countMatches(rounds) {
    return rounds.reduce((sum, r) => sum + r.length, 0);
  }

  function countWaves(rounds, courts) {
    return rounds.reduce((sum, r) => sum + Math.ceil(r.length / courts), 0);
  }

  // Prüft, ob der Spielplan ins Zeitfenster passt und schlägt bei Bedarf
  // eine Platzanzahl vor, mit der es passen würde.
  function checkCapacity(rounds, courts, matchDuration, breakDuration, availableMinutes) {
    const slotLen = slotMinutes(matchDuration, breakDuration);
    const waves = countWaves(rounds, courts);
    const neededMinutes = waves * slotLen;
    const totalMatches = countMatches(rounds);
    const maxWavesFit = Math.max(1, Math.floor(availableMinutes / slotLen));
    let suggestedCourts = courts;
    if (neededMinutes > availableMinutes) {
      // größte Runde bestimmt die Mindest-Plätze, danach hochzählen bis Wellen passen
      const maxRoundSize = Math.max(1, ...rounds.map((r) => r.length));
      suggestedCourts = maxRoundSize;
      for (let c = maxRoundSize; c <= totalMatches; c++) {
        if (countWaves(rounds, c) <= maxWavesFit) {
          suggestedCourts = c;
          break;
        }
        suggestedCourts = c;
      }
    }
    return {
      fits: neededMinutes <= availableMinutes,
      neededMinutes,
      availableMinutes,
      totalMatches,
      waves,
      suggestedCourts,
    };
  }

  function computeStandings(teams, matches) {
    const table = {};
    teams.forEach((t) => {
      table[t.id] = {
        teamId: t.id,
        name: t.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
      };
    });
    matches.forEach((m) => {
      if (m.status !== "done" || m.scoreA === null || m.scoreB === null) return;
      if (!table[m.teamA] || !table[m.teamB]) return;
      const a = table[m.teamA];
      const b = table[m.teamB];
      a.played++; b.played++;
      a.goalsFor += m.scoreA; a.goalsAgainst += m.scoreB;
      b.goalsFor += m.scoreB; b.goalsAgainst += m.scoreA;
      if (m.scoreA > m.scoreB) { a.wins++; a.points += 3; b.losses++; }
      else if (m.scoreA < m.scoreB) { b.wins++; b.points += 3; a.losses++; }
      else { a.draws++; b.draws++; a.points += 1; b.points += 1; }
    });
    Object.values(table).forEach((t) => (t.goalDiff = t.goalsFor - t.goalsAgainst));
    return Object.values(table).sort(
      (x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || x.name.localeCompare(y.name)
    );
  }

  function standingsByGroup(teams, groups, matches) {
    return groups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      standings: computeStandings(
        teams.filter((t) => g.teamIds.includes(t.id)),
        matches.filter((m) => m.groupId === g.id)
      ),
    }));
  }

  // Erzeugt eine KO-Bracket-Struktur für `qualified` (Array von teamIds in Seed-Reihenfolge,
  // z.B. 1. dieser Gruppe, 1. jener Gruppe, 2. ..., 2. ...). Füllt mit Freilosen auf,
  // falls die Anzahl keine Zweierpotenz ist.
  function buildKnockoutBracket(qualified) {
    const n = qualified.length;
    let size = 1;
    while (size < n) size *= 2;
    const seeded = [...qualified];
    while (seeded.length < size) seeded.push(null); // Freilos

    // Standard-Bracket-Reihenfolge (1 vs n, 2 vs n-1, ...) vermeidet frühe Rematches
    const order = standardBracketOrder(size);
    const firstRoundPairs = [];
    for (let i = 0; i < size / 2; i++) {
      const a = seeded[order[i * 2]];
      const b = seeded[order[i * 2 + 1]];
      firstRoundPairs.push({ teamA: a, teamB: b, phase: "ko", winner: a && !b ? a : b && !a ? b : null });
    }
    return { size, rounds: [firstRoundPairs] };
  }

  function standardBracketOrder(size) {
    let order = [0, 1];
    while (order.length < size) {
      const next = [];
      const total = order.length * 2;
      order.forEach((pos) => {
        next.push(pos);
        next.push(total - 1 - pos);
      });
      order = next;
    }
    return order;
  }

  // Nachdem alle Ergebnisse einer KO-Runde feststehen: erzeugt die nächste Runde.
  function nextKnockoutRound(previousRoundMatches) {
    const winners = previousRoundMatches.map((m) => m.winner);
    if (winners.some((w) => w === undefined)) return null; // noch nicht alle fertig
    const pairs = [];
    for (let i = 0; i < winners.length; i += 2) {
      pairs.push({ teamA: winners[i], teamB: winners[i + 1] ?? null, phase: "ko", winner: winners[i + 1] == null ? winners[i] : null });
    }
    return pairs;
  }

  const api = {
    generateRoundRobin,
    splitIntoGroups,
    suggestGroupCount,
    combineGroupRounds,
    generateFixedGamesSchedule,
    scheduleRounds,
    checkCapacity,
    computeStandings,
    standingsByGroup,
    buildKnockoutBracket,
    nextKnockoutRound,
    countMatches,
    countWaves,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TournamentEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
