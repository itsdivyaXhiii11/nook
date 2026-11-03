const $ = s => document.querySelector(s);
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), nowIso = () => iso(new Date());
const fmt = (s, o) => new Date(s + "T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...o });
let tab = "today", day = nowIso(), P = ls("study-plan", null), T = ls("todos", {}), K = null, V = null, SALT = null, lockT, sealT, msg = "", show = {};
const TABS = [["today", "Today"], ["planner", "Planner"], ["diary", "Diary", 1], ["journal", "Journal", 1], ["secrets", "Secrets", 1]];
const MOODS = ["Great", "Good", "Okay", "Low", "Rough"], PROMPTS = [["g", "Three things I'm grateful for"], ["w", "One win from today"], ["i", "What I'll do better tomorrow"]];

/* ---------- encryption: PBKDF2 -> AES-GCM, all on this device ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u => btoa(Array.from(new Uint8Array(u), c => String.fromCharCode(c)).join("")), unb = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hasVault = () => !!localStorage.getItem("vault");
async function key(pw, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal() {
  if (!K) return; const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, K, enc.encode(JSON.stringify(V)));
  set("vault", { salt: b64(SALT), iv: b64(iv), ct: b64(ct) });
}
const queue = () => { clearTimeout(sealT); sealT = setTimeout(seal, 500); };
async function doUnlock() {
  const pw = $("#pw").value; msg = "";
  try {
    if (!hasVault()) {
      if (pw.length < 6) throw "Use at least 6 characters.";
      if (pw !== $("#pw2").value) throw "Passwords don't match.";
      SALT = crypto.getRandomValues(new Uint8Array(16)); K = await key(pw, SALT); V = { secrets: [], diary: {}, journal: {} }; await seal();
    } else {
      const o = ls("vault"); SALT = unb(o.salt); K = await key(pw, SALT);
      V = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb(o.iv) }, K, unb(o.ct))));
    }
    bump(); render();
  } catch (e) { K = V = null; $("#lerr").textContent = typeof e === "string" ? e : "Wrong password."; }
}
function lock() { clearTimeout(lockT); K = V = null; show = {}; render(); }
const bump = () => { clearTimeout(lockT); if (K) lockT = setTimeout(lock, 5 * 6e4); };

/* ---------- views ---------- */
const dateHead = (title, extra = "") => `<header class="top"><div><h1>${title}</h1><p class="sub">${fmt(day, { weekday: "long", day: "numeric", month: "long" })}</p>
  <div class="navd"><button class="ghost" data-a="dnav" data-v="-1" aria-label="Previous day">‹</button><button class="ghost" data-a="dtoday">Today</button><button class="ghost" data-a="dnav" data-v="1" aria-label="Next day">›</button>${extra}</div></div></header>`;

function todayView() {
  const todos = (T[day] || []).map((x, i) => ({ ...x, i })).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const study = P ? P.sessions.map((s, i) => ({ s, i })).filter(o => o.s.date === day) : [];
  const tot = todos.length + study.length, done = todos.filter(x => x.done).length + study.filter(o => o.s.done).length, pct = tot ? Math.round(100 * done / tot) : 0, C = 2 * Math.PI * 52;
  const undone = day < nowIso() && todos.some(x => !x.done);
  const ring = `<svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label="${pct}% of the day done"><circle cx="62" cy="62" r="52" class="rt"/><circle cx="62" cy="62" r="52" class="rf" stroke-dasharray="${C * pct / 100} ${C}" transform="rotate(-90 62 62)"/><text x="62" y="70" text-anchor="middle">${pct}%</text></svg>`;
  const head = dateHead("Your day", `<button class="ghost" data-a="notif">Enable alerts</button>${undone ? '<button class="ghost" data-a="carry">Move unfinished to today</button>' : ""}`);
  return head.replace("</header>", `${ring}</header>`) + `<div class="add"><input id="tt" placeholder="Add a task for this day" aria-label="Task"><input id="tm" type="time" aria-label="Time (optional)"><button class="btn" data-a="addtodo">Add</button></div>` +
    (todos.length ? todos.map(x => `<label class="row ${x.done ? "done" : ""}"><input type="checkbox" ${x.done ? "checked" : ""} data-a="todo" data-i="${x.i}"><span class="t">${esc(x.t)}</span>${x.time ? `<time>${x.time}</time>` : ""}<button class="x" data-a="deltodo" data-i="${x.i}" aria-label="Delete task">×</button></label>`).join("") : '<div class="empty">Nothing planned yet. Add the first thing for this day.</div>') +
    (study.length ? `<p class="grp">From your study plan</p>` + study.map(o => `<label class="row ${o.s.done ? "done" : ""}"><input type="checkbox" ${o.s.done ? "checked disabled" : ""} data-a="study" data-i="${o.i}"><span class="t">${o.s.id === "REVISION" ? "Full revision and mock questions" : esc(P.tasks[o.s.id].topic + ": " + P.tasks[o.s.id].title)}</span><time>${o.s.h}h</time></label>`).join("") : "");
}
function plannerView() {
  if (!P) return `<header class="top"><div><h1>Exam planner</h1><p class="sub">Turn an exam date and topics into a daily schedule. Sessions show up in Today.</p></div></header><div class="card">
    <label class="lbl" for="pg">Goal</label><input id="pg" placeholder="Pass DBMS with 75%"><div class="g2"><div><label class="lbl" for="pe">Exam date</label><input id="pe" type="date" min="${add(nowIso(), 1)}" value="${add(nowIso(), 21)}"></div>
    <div><label class="lbl" for="pwd">Weekday hours</label><input id="pwd" type="number" min="0" step=".5" value="2"></div><div><label class="lbl" for="pwe">Weekend hours</label><input id="pwe" type="number" min="0" step=".5" value="3"></div></div>
    <label class="lbl" for="pt">Topics, one per line</label><textarea id="pt" rows="4"></textarea><p class="err">${esc(msg)}</p><button class="btn" data-a="mkplan">Build my plan</button></div>`;
  const tot = Object.values(P.tasks).reduce((a, t) => a + t.h, 0) || 1, done = P.sessions.filter(s => s.done && s.id !== "REVISION").reduce((a, s) => a + s.h, 0), ov = P.over.reduce((a, b) => a + b, 0);
  let h = "", last = "";
  P.sessions.forEach((s, i) => { if (s.date !== last) { last = s.date; h += `<p class="grp">${fmt(s.date, { weekday: "short", day: "numeric", month: "short" })}${s.date === nowIso() ? " (today)" : ""}</p>`; }
    h += `<label class="row ${s.done ? "done" : ""}"><input type="checkbox" ${s.done ? "checked disabled" : ""} data-a="study" data-i="${i}"><span class="t">${s.id === "REVISION" ? "Full revision and mock questions" : esc(P.tasks[s.id].topic + ": " + P.tasks[s.id].title)}${!s.done && s.date < nowIso() ? ' <b class="miss">missed</b>' : ""}</span><time>${s.h}h</time></label>`; });
  return `<header class="top"><div><h1>Exam planner</h1><p class="sub">${esc(P.goal)}: ${Math.round(100 * done / tot)}% done, ${Core.cap ? Math.max(0, diff(nowIso(), P.exam)) : 0} days to exam</p></div></header>
  <div class="navd" style="margin:0 0 12px"><button class="ghost" data-a="pact" data-v="missed">Replan missed</button><button class="ghost" data-a="pact" data-v="block">Block a day</button><button class="ghost" data-a="pact" data-v="avail">Change hours</button><button class="ghost" data-a="pact" data-v="drop">Drop a topic</button><button class="ghost" data-a="pact" data-v="new">New plan</button></div>
  <p class="meta">${esc(msg)}</p>${ov ? `<div class="card miss">Not enough time: ${Math.round(ov * 10) / 10}h doesn't fit before the exam. Add hours, unblock days, or drop a topic.</div>` : ""}${h}`;
}
function diaryView() {
  const e = V.diary[day] || { mood: "", text: "" }, keys = Object.keys(V.diary).filter(k => V.diary[k].text || V.diary[k].mood).sort().reverse().slice(0, 30);
  return dateHead("Diary") + `<div class="navd" style="margin:0 0 12px">${MOODS.map(m => `<button class="chip ${e.mood === m ? "on" : ""}" data-a="mood" data-v="${m}">${m}</button>`).join("")}</div>
  <textarea id="dtext" class="paper" placeholder="Dear diary..." aria-label="Diary entry">${esc(e.text)}</textarea><p class="meta"><span id="wc">${e.text.trim() ? e.text.trim().split(/\s+/).length : 0}</span> words. Saved encrypted as you type.</p>
  ${keys.length ? `<p class="grp">Past entries</p>` + keys.map(k => `<button class="ghost past" data-a="goto" data-v="${k}"><b>${fmt(k, { day: "numeric", month: "short", year: "numeric" })}</b> ${V.diary[k].mood ? "· " + V.diary[k].mood : ""}<br><span class="meta">${esc(V.diary[k].text.slice(0, 90))}</span></button>`).join("") : ""}`;
}
function journalView() {
  const e = V.journal[day] || {};
  return dateHead("Journal") + PROMPTS.map(([k, q]) => `<label class="lbl" for="j${k}">${q}</label><textarea id="j${k}" rows="3" class="paper" style="min-height:90px;font-size:1rem">${esc(e[k] || "")}</textarea>`).join("") + `<p class="meta">Saved encrypted as you type.</p>`;
}
function secretsView() {
  return `<header class="top"><div><h1>Secrets</h1><p class="sub">Passwords, codes and notes. Hidden until you reveal them.</p></div></header>
  <div class="card"><div class="g2"><input id="sl" placeholder="Label (e.g. Wi-Fi)" aria-label="Label"><input id="sv" placeholder="Secret" aria-label="Secret"></div><input id="sn" placeholder="Note (optional)" style="margin:10px 0" aria-label="Note"><button class="btn" data-a="addsec">Save secret</button></div>
  ${V.secrets.length ? V.secrets.map((s, i) => `<div class="row" style="cursor:default"><div style="flex:1"><div class="meta" style="margin:0">${esc(s.l)}${s.n ? " · " + esc(s.n) : ""}</div><b style="overflow-wrap:anywhere">${show[i] ? esc(s.v) : "••••••••"}</b></div>
    <button class="ghost" data-a="showsec" data-i="${i}">${show[i] ? "Hide" : "Reveal"}</button><button class="ghost" data-a="copysec" data-i="${i}">Copy</button><button class="x" data-a="delsec" data-i="${i}" aria-label="Delete secret">×</button></div>`).join("") : '<div class="empty">No secrets yet. Anything you save here is encrypted.</div>'}
  <p class="grp">Backup</p><div class="navd"><button class="ghost" data-a="export">Download encrypted backup</button><label class="ghost" style="cursor:pointer">Restore backup<input id="imp" type="file" accept=".json" hidden></label></div>
  <p class="meta">Your private data lives only in this browser. Clearing site data erases it, so download a backup now and then.</p>`;
}
function lockView() {
  const first = !hasVault();
  return `<div class="lock"><div class="orb"></div><h1>${first ? "Create your key" : "Private space"}</h1><p class="sub">${first ? "Pick a password. Diary, Journal and Secrets are encrypted with it on this device. If you forget it, no one can recover them." : "Enter your password to open your diary, journal and secrets."}</p>
  <input id="pw" type="password" placeholder="Password" aria-label="Password" autocomplete="${first ? "new-password" : "current-password"}">${first ? '<input id="pw2" type="password" placeholder="Repeat password" aria-label="Repeat password" autocomplete="new-password">' : ""}
  <p class="err" id="lerr"></p><button class="btn" data-a="unlock">${first ? "Create and open" : "Unlock"}</button>${first ? "" : '<button class="x" style="font-size:.85rem" data-a="wipe">Forgot password? Erase private data</button>'}</div>`;
}
function render() {
  $("#nav").innerHTML = `<div class="brand">Nook</div>` + TABS.map(([k, l, p]) => `<button class="${k === tab ? "on" : ""}" data-a="tab" data-v="${k}">${l}${p && !K ? '<i class="dot" title="Locked"></i>' : ""}</button>`).join("") + (K ? '<button class="lockbtn" data-a="lock">Lock now</button>' : "");
  const priv = TABS.find(t => t[0] === tab)[2];
  $("#view").innerHTML = priv && !K ? lockView() : { today: todayView, planner: plannerView, diary: diaryView, journal: journalView, secrets: secretsView }[tab]();
  const p = $("#pw"); if (p) p.focus();
}
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; setTimeout(() => e.hidden = true, 6000); }
function ping(title, body) { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); else toast(`${title}: ${body}`); }

/* ---------- actions ---------- */
const savePlan = () => set("study-plan", P);
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-a]"); if (!el) return; bump();
  const a = el.dataset.a, i = +el.dataset.i, v = el.dataset.v;
  if (a === "tab") { tab = v; msg = ""; render(); }
  else if (a === "lock") lock();
  else if (a === "unlock") doUnlock();
  else if (a === "wipe") { if (confirm("This permanently erases your diary, journal and secrets. Continue?")) { localStorage.removeItem("vault"); render(); } }
  else if (a === "dnav") { day = add(day, +v); render(); }
  else if (a === "dtoday") { day = nowIso(); render(); }
  else if (a === "goto") { day = v; render(); }
  else if (a === "addtodo") { const t = $("#tt").value.trim(); if (!t) { $("#tt").focus(); return; } (T[day] ||= []).push({ t, time: $("#tm").value, done: false }); set("todos", T); render(); $("#tt").focus(); }
  else if (a === "todo") { T[day][i].done = el.checked; set("todos", T); render(); }
  else if (a === "deltodo") { e.preventDefault(); T[day].splice(i, 1); set("todos", T); render(); }
  else if (a === "carry") { const t0 = nowIso(), keep = T[day].filter(x => x.done); (T[t0] ||= []).push(...T[day].filter(x => !x.done).map(x => ({ ...x, time: "" }))); T[day] = keep; set("todos", T); day = t0; render(); }
  else if (a === "notif") { if (!("Notification" in window)) return toast("This browser doesn't support notifications."); const r = await Notification.requestPermission(); toast(r === "granted" ? "Alerts on. Timed tasks will ping you while Nook is open." : "Alerts blocked in browser settings."); }
  else if (a === "study") { P.today = nowIso(); Core.apply(P, "done", i); savePlan(); render(); }
  else if (a === "mkplan") {
    const topics = $("#pt").value.split("\n").map(x => x.trim()).filter(Boolean), ex = $("#pe").value;
    if (!ex || ex <= nowIso()) { msg = "Pick an exam date in the future."; return render(); } if (!topics.length) { msg = "Add at least one topic."; return render(); }
    P = Core.newState($("#pg").value || "Pass the exam", ex, topics, +$("#pwd").value || 2, +$("#pwe").value || 3, nowIso()); savePlan(); msg = ""; render();
  } else if (a === "pact") {
    P.today = nowIso();
    if (v === "missed") msg = Core.apply(P, "missed");
    else if (v === "block") { const d = prompt("Date to block (YYYY-MM-DD)"); if (d) msg = Core.apply(P, "block", d.trim()); }
    else if (v === "avail") { const x = prompt("e.g. mon=3 sat=1 sun=0"); if (x) { const o = {}; x.split(/\s+/).forEach(p => { const [k, n] = p.split("="); if (n !== undefined) o[k] = n; }); msg = Core.apply(P, "avail", o); } }
    else if (v === "drop") { const t = prompt("Topic name to drop"); if (t) msg = Core.apply(P, "drop", t.trim()); }
    else if (v === "new" && confirm("Start a new plan? The current one will be removed.")) { P = null; localStorage.removeItem("study-plan"); msg = ""; }
    if (P) savePlan(); render();
  } else if (a === "mood") { (V.diary[day] ||= { mood: "", text: "" }).mood = v; queue(); render(); }
  else if (a === "addsec") { const l = $("#sl").value.trim(), s = $("#sv").value; if (!l || !s) return toast("Add a label and a secret."); V.secrets.push({ l, v: s, n: $("#sn").value.trim() }); await seal(); render(); }
  else if (a === "showsec") { show[i] = !show[i]; render(); }
  else if (a === "copysec") { try { await navigator.clipboard.writeText(V.secrets[i].v); toast("Copied."); } catch (x) { toast("Couldn't copy. Reveal it and copy by hand."); } }
  else if (a === "delsec") { if (confirm("Delete this secret?")) { V.secrets.splice(i, 1); show = {}; await seal(); render(); } }
  else if (a === "export") { const b = new Blob([localStorage.getItem("vault") || "{}"], { type: "application/json" }), l = document.createElement("a"); l.href = URL.createObjectURL(b); l.download = `nook-backup-${nowIso()}.json`; l.click(); }
});
document.addEventListener("input", e => {
  bump(); const id = e.target.id;
  if (id === "dtext") { (V.diary[day] ||= { mood: "", text: "" }).text = e.target.value; $("#wc").textContent = e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0; queue(); }
  else if (/^j[gwi]$/.test(id)) { (V.journal[day] ||= {})[id[1]] = e.target.value; queue(); }
});
document.addEventListener("change", e => {
  if (e.target.id !== "imp" || !e.target.files[0]) return;
  e.target.files[0].text().then(t => { const o = JSON.parse(t); if (!o.salt || !o.iv || !o.ct) throw 0;
    if (confirm("Replace your current private data with this backup? You'll unlock it with the backup's password.")) { localStorage.setItem("vault", t); lock(); } }).catch(() => toast("That isn't a valid Nook backup."));
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && ["pw", "pw2"].includes(e.target.id)) doUnlock(); if (e.key === "Enter" && e.target.id === "tt") document.querySelector('[data-a="addtodo"]').click(); });
const fired = new Set();
setInterval(() => { const n = new Date(), d = iso(n), hm = n.toTimeString().slice(0, 5);
  (T[d] || []).forEach((x, i) => { const k = d + i + x.t; if (x.time === hm && !x.done && !fired.has(k)) { fired.add(k); ping(x.t, "Due now"); } });
  if (d !== day && tab === "today" && !document.activeElement?.id) { /* keep user's chosen day */ } }, 15000);
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js");
