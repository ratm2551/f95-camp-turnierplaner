// CSV-Import: Teilnehmerliste einlesen (Name, optional Team-Spalte).
// Erkennt Trennzeichen automatisch (Komma oder Semikolon), wie im Scout-Dashboard.

(function (root) {
  function detectDelimiter(firstLine) {
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    return semiCount > commaCount ? ";" : ",";
  }

  function normalizeHeader(h) {
    return h.trim().toLowerCase().replace(/[^a-z0-9äöü]/g, "");
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { participants: [], hasTeamColumn: false, error: "Datei ist leer." };

    const delimiter = detectDelimiter(lines[0]);
    const header = lines[0].split(delimiter).map(normalizeHeader);

    const nameIdx = header.findIndex((h) => ["name", "teilnehmer", "spieler", "vorname"].includes(h));
    const teamIdx = header.findIndex((h) => ["team", "mannschaft", "gruppe"].includes(h));

    if (nameIdx === -1) {
      return { participants: [], hasTeamColumn: false, error: "Keine Spalte 'Name' gefunden. Erste Zeile muss eine Kopfzeile mit 'Name' sein." };
    }

    const participants = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter);
      const name = (cols[nameIdx] || "").trim();
      if (!name) continue;
      participants.push({
        name,
        team: teamIdx !== -1 ? (cols[teamIdx] || "").trim() : null,
      });
    }

    return { participants, hasTeamColumn: teamIdx !== -1, error: null };
  }

  const FAMOUS_FOOTBALLERS = [
    "Ronaldo", "Messi", "Neuer", "Kroos", "Müller", "Lewandowski", "Mbappé", "Modrić", "Kane", "Salah",
    "Hazard", "De Bruyne", "Suárez", "Benzema", "Griezmann", "Van Dijk", "Kimmich", "Gündoğan", "Havertz",
    "Musiala", "Wirtz", "Sané", "Alaba", "Rüdiger", "Gnabry", "Reus", "Klose", "Ballack", "Özil", "Podolski",
    "Neymar", "Xavi", "Iniesta", "Zidane", "Beckham", "Ronaldinho", "Maradona", "Pelé", "Cruyff", "Kahn",
    "Matthäus", "Schweinsteiger", "Klinsmann", "Boateng", "Draxler", "Werner", "Füllkrug", "Bellingham",
  ];

  function shuffledFootballerNames(count) {
    const pool = [...FAMOUS_FOOTBALLERS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const names = [];
    for (let i = 0; i < count; i++) {
      const extra = Math.floor(i / pool.length);
      names.push(pool[i % pool.length] + (extra > 0 ? " " + (extra + 1) : ""));
    }
    return names;
  }

  // Baut Teams aus einer flachen Teilnehmerliste, wenn keine Team-Spalte vorhanden ist.
  // nameStyle: "numeric" (Team 1, 2, ...) | "players" (nach berühmten Fußballern benannt)
  function autoBuildTeams(participants, teamSize, nameStyle = "numeric") {
    const shuffled = [...participants];
    const teamCount = Math.max(1, Math.ceil(shuffled.length / teamSize));
    const footballerNames = nameStyle === "players" ? shuffledFootballerNames(teamCount) : null;
    const teams = [];
    for (let i = 0; i < shuffled.length; i += teamSize) {
      const members = shuffled.slice(i, i + teamSize);
      const teamIdx = teams.length;
      teams.push({
        id: "team_" + (teamIdx + 1),
        name: footballerNames ? footballerNames[teamIdx] : "Team " + (teamIdx + 1),
        players: members.map((m) => m.name),
      });
    }
    return teams;
  }

  function buildTeamsFromColumn(participants) {
    const map = new Map();
    participants.forEach((p) => {
      const key = p.team || "Ohne Team";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p.name);
    });
    let idx = 0;
    return Array.from(map.entries()).map(([teamName, players]) => {
      idx++;
      return { id: "team_" + idx, name: teamName, players };
    });
  }

  // Baut Teams ohne Namensliste, nur aus (optional nach Altersgruppe) Spieleranzahlen.
  // entries: [{ label, count }] – label leer/"" bei nur einer Gruppe ohne Altersaufteilung.
  // nameStyle: "numeric" (Team 1, 2, ...) | "players" (nach berühmten Fußballern benannt)
  function buildTeamsFromCounts(entries, teamSize, nameStyle = "numeric") {
    const totalTeams = entries.reduce((sum, entry) => {
      const count = Math.max(0, entry.count || 0);
      return sum + (count > 0 ? Math.max(1, Math.ceil(count / teamSize)) : 0);
    }, 0);
    const footballerNames = nameStyle === "players" ? shuffledFootballerNames(totalTeams) : null;

    const teams = [];
    entries.forEach((entry) => {
      const count = Math.max(0, entry.count || 0);
      if (count <= 0) return;
      const teamsInGroup = Math.max(1, Math.ceil(count / teamSize));
      for (let i = 0; i < teamsInGroup; i++) {
        const start = i * teamSize;
        const membersCount = Math.min(teamSize, count - start);
        if (membersCount <= 0) continue;
        const prefix = entry.label ? entry.label + " " : "";
        const players = Array.from({ length: membersCount }, (_, j) => `${prefix}Spieler ${start + j + 1}`);
        const teamLabel = footballerNames ? footballerNames[teams.length] : "Team " + (i + 1);
        teams.push({
          id: "team_" + (teams.length + 1),
          name: (entries.length > 1 && entry.label ? entry.label + " – " : "") + teamLabel,
          players,
          ageGroup: entry.label || null,
        });
      }
    });
    return teams;
  }

  const api = { parseCsv, autoBuildTeams, buildTeamsFromColumn, buildTeamsFromCounts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CsvParser = api;
})(typeof window !== "undefined" ? window : globalThis);
