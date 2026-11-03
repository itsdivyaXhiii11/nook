/* Scheduler: pure functions, no DOM. State in, state out. */
const DN = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const add = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wk = s => (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7;
const diff = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const r2 = x => Math.round(x * 100) / 100;

const Core = {
  cap(S, d, used = 0) { return S.blocked.includes(d) ? 0 : Math.max(0, S.avail[DN[wk(d)]] - used); },
  remaining(S) {
    const dn = {};
    S.sessions.forEach(s => { if (s.done && s.id !== "REVISION") dn[s.id] = (dn[s.id] || 0) + s.h; });
    const r = {}; for (const k in S.tasks) r[k] = r2(S.tasks[k].h - (dn[k] || 0)); return r;
  },
  schedule(S) {
    const t0 = S.today, rev = add(S.exam, -1), useRev = diff(t0, rev) >= 2, last = useRev ? add(rev, -1) : rev;
    const kept = S.sessions.filter(s => s.done), dt = kept.filter(s => s.date === t0).reduce((a, s) => a + s.h, 0);
    const rem = Core.remaining(S), order = Object.keys(S.tasks).sort((a, b) => S.tasks[a].ti - S.tasks[b].ti || (a < b ? -1 : 1));
    const nw = [], over = []; let d = t0, c = d <= last ? Core.cap(S, d, dt) : 0;
    for (const id of order) {
      let need = rem[id];
      while (need > 0.01 && d <= last) {
        if (c < 0.5) { d = add(d, 1); c = d <= last ? Core.cap(S, d) : 0; continue; }
        const ch = Math.min(c, need); nw.push({ date: d, id, h: r2(ch), done: false }); c -= ch; need -= ch;
      }
      if (need > 0.01) over.push(r2(need));
    }
    if (useRev && Core.cap(S, rev) > 0) nw.push({ date: rev, id: "REVISION", h: Core.cap(S, rev), done: false });
    S.sessions = kept.concat(nw).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    S.over = over; return S;
  },
  decompose(t) { return [["Learn core concepts of", 2], ["Practice problems on", 1.5], ["Review and summarize", 0.5]].map(([a, h]) => ({ title: a + " " + t, h })); },
  newState(goal, exam, topics, wd, we, today) {
    const tasks = {};
    topics.forEach((t, ti) => Core.decompose(t).forEach((s, si) => tasks[`T${ti + 1}.${si + 1}`] = { topic: t, title: s.title, h: s.h, ti }));
    return Core.schedule({ goal, exam, today, tasks, blocked: [], sessions: [], over: [], reminder: "08:00",
      avail: Object.fromEntries(DN.map(d => [d, d === "sat" || d === "sun" ? we : wd])) });
  },
  replan(S, reason) {
    const miss = S.sessions.filter(s => !s.done && s.date < S.today && s.id !== "REVISION").reduce((a, s) => a + s.h, 0);
    S.sessions = S.sessions.filter(s => s.done || s.date >= S.today); Core.schedule(S);
    const left = Math.round(Object.values(Core.remaining(S)).reduce((a, h) => a + Math.max(0, h), 0) * 10) / 10;
    return `Replanned (${reason}). Missed ${r2(miss)}h, ${left}h left before ${S.exam}.`;
  },
  apply(S, action, arg) {
    if (action === "done") { S.sessions[arg].done = true; return ""; }
    if (action === "missed") return Core.replan(S, "missed days");
    if (action === "avail") { for (const k in arg) if (DN.includes(k.slice(0, 3).toLowerCase())) S.avail[k.slice(0, 3).toLowerCase()] = Math.max(0, +arg[k] || 0); return Core.replan(S, "hours changed"); }
    if (action === "block") { if (!S.blocked.includes(arg)) S.blocked.push(arg); return Core.replan(S, arg + " blocked"); }
    if (action === "unblock") { S.blocked = S.blocked.filter(x => x !== arg); return Core.replan(S, arg + " freed"); }
    if (action === "drop") {
      const ids = Object.keys(S.tasks).filter(k => S.tasks[k].topic.toLowerCase().includes(arg.toLowerCase()));
      ids.forEach(k => delete S.tasks[k]); S.sessions = S.sessions.filter(s => s.done || !ids.includes(s.id)); Core.schedule(S);
      return ids.length ? `Dropped ${ids.length} subtasks.` : "No such topic.";
    }
    return "";
  },
  message(S, day) {
    const todo = S.sessions.filter(s => s.date === day && !s.done), missed = S.sessions.filter(s => !s.done && s.date < day).length;
    const hrs = Math.round(todo.reduce((a, s) => a + s.h, 0) * 10) / 10;
    const names = [...new Set(todo.map(s => s.id === "REVISION" ? "Revision" : S.tasks[s.id].topic))].slice(0, 3).join(", ");
    return { title: todo.length ? `Study today: ${hrs}h` : "Nothing planned today",
             body: (todo.length ? names : "Enjoy the break.") + (missed ? `. ${missed} missed session(s), open the app to replan.` : "") };
  },
};
if (typeof module !== "undefined") module.exports = Core;
