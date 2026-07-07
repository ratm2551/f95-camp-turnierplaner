// Firebase-Anbindung für die Turnier-App. Jedes Turnier lebt unter einem
// eigenen kurzen Code (/turniere/{code}), dadurch verfälschen parallele
// Turniere auf anderen Plätzen sich nie gegenseitig, laufen aber alle live.

const CampSync = (function () {
  let db = null;

  function init() {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    return db;
  }

  function getDb() {
    if (!db) init();
    return db;
  }

  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne verwechselbare Zeichen (I,O,0,1)

  function generateCode(length = 5) {
    let code = "";
    for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  async function codeExists(code) {
    const snap = await getDb().ref("turniere/" + code + "/meta").get();
    return snap.exists();
  }

  async function reserveUniqueCode() {
    let code;
    do {
      code = generateCode();
    } while (await codeExists(code));
    return code;
  }

  function ref(code, path = "") {
    return getDb().ref("turniere/" + code + (path ? "/" + path : ""));
  }

  async function createTurnier(code, data) {
    await ref(code).set(data);
  }

  async function update(code, path, value) {
    await ref(code, path).set(value);
  }

  async function patch(code, path, updates) {
    await ref(code, path).update(updates);
  }

  function listen(code, callback) {
    const r = ref(code);
    const handler = (snap) => callback(snap.val());
    r.on("value", handler);
    return () => r.off("value", handler);
  }

  async function getOnce(code) {
    const snap = await ref(code).get();
    return snap.val();
  }

  return { init, getDb, generateCode, reserveUniqueCode, codeExists, ref, createTurnier, update, patch, listen, getOnce };
})();
