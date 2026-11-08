const STORAGE_KEY = "pomodoro-desk-v1";
const CIRCUMFERENCE = 2 * Math.PI * 96;

const defaults = {
  settings: {
    focus: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoStart: false,
    sound: true,
  },
  tasks: [],
  mode: "focus",
  running: false,
  endsAt: null,
  remainingMs: 25 * 60 * 1000,
  focusStreak: 0,
  currentTaskId: null,
  filter: "open",
  today: todayKey(),
  todayCount: 0,
};

const state = load();

const els = {
  time: document.getElementById("time"),
  phase: document.getElementById("phaseLabel"),
  ring: document.getElementById("ring"),
  focusLine: document.getElementById("focusLine"),
  toggleBtn: document.getElementById("toggleBtn"),
  resetBtn: document.getElementById("resetBtn"),
  skipBtn: document.getElementById("skipBtn"),
  pips: document.getElementById("pips"),
  today: document.getElementById("todayStats"),
  form: document.getElementById("addForm"),
  input: document.getElementById("taskInput"),
  list: document.getElementById("taskList"),
  empty: document.getElementById("emptyState"),
  openCount: document.getElementById("openCount"),
  clearDone: document.getElementById("clearDone"),
  settingsForm: document.getElementById("settingsForm"),
  toast: document.getElementById("toast"),
};

els.ring.style.strokeDasharray = String(CIRCUMFERENCE);

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    render();
  });
});

els.toggleBtn.addEventListener("click", toggle);
els.resetBtn.addEventListener("click", resetTimer);
els.skipBtn.addEventListener("click", () => finishSegment(true));
els.form.addEventListener("submit", addTask);
els.clearDone.addEventListener("click", () => {
  state.tasks = state.tasks.filter((task) => !task.done);
  if (state.currentTaskId && !state.tasks.some((task) => task.id === state.currentTaskId)) {
    state.currentTaskId = null;
  }
  persist();
  render();
});
els.settingsForm.addEventListener("change", saveSettings);
els.list.addEventListener("click", onListClick);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
});

syncSettingsForm();
render();
setInterval(tick, 250);

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function load() {
  const next = structuredClone(defaults);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return next;
    next.settings = { ...defaults.settings, ...saved.settings };
    next.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
    next.mode = saved.mode || "focus";
    next.focusStreak = saved.focusStreak || 0;
    next.currentTaskId = saved.currentTaskId || null;
    next.filter = saved.filter || "open";
    next.today = saved.today || todayKey();
    next.todayCount = saved.todayCount || 0;
    next.running = Boolean(saved.running && saved.endsAt);
    next.endsAt = saved.endsAt || null;
    next.remainingMs = saved.remainingMs ?? minutes(next.settings[next.mode]);
  } catch {
    return structuredClone(defaults);
  }
  if (next.today !== todayKey()) {
    next.today = todayKey();
    next.todayCount = 0;
  }
  if (next.running && next.endsAt && next.endsAt <= Date.now()) {
    next.running = false;
    next.remainingMs = 0;
    queueMicrotask(() => finishSegment(false));
  }
  return next;
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      settings: state.settings,
      tasks: state.tasks,
      mode: state.mode,
      running: state.running,
      endsAt: state.endsAt,
      remainingMs: state.remainingMs,
      focusStreak: state.focusStreak,
      currentTaskId: state.currentTaskId,
      filter: state.filter,
      today: state.today,
      todayCount: state.todayCount,
    })
  );
}

function minutes(value) {
  return Math.max(1, Number(value) || 1) * 60 * 1000;
}

function durationOf(mode) {
  return minutes(state.settings[mode]);
}

function remaining() {
  if (state.running && state.endsAt) return Math.max(0, state.endsAt - Date.now());
  return Math.max(0, state.remainingMs);
}

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function currentTask() {
  return state.tasks.find((task) => task.id === state.currentTaskId && !task.done) || null;
}

function tick() {
  if (state.today !== todayKey()) {
    state.today = todayKey();
    state.todayCount = 0;
    persist();
  }
  if (state.running && remaining() <= 0) finishSegment(false);
  else paintTimer();
}

function paintTimer() {
  const total = durationOf(state.mode);
  const left = remaining();
  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, left / total));
  els.time.textContent = format(left);
  els.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
  document.title = state.running ? `${format(left)} · 番茄钟` : "番茄钟 · 待办";
  const task = currentTask();
  const modeName = { focus: "专注", short: "短休", long: "长休" }[state.mode];
  els.phase.textContent = state.running ? `正在${modeName}` : left === total ? `准备${modeName}` : `${modeName}已暂停`;
  els.focusLine.textContent = task
    ? `当前专注：${task.title}`
    : state.mode === "focus"
      ? "先选一项待办，或直接开始一轮。"
      : "休息一下，下一轮会更稳。";
  els.toggleBtn.textContent = state.running ? "暂停" : left === total ? "开始" : "继续";
  document.body.dataset.mode = state.mode;
}

function render() {
  paintTimer();
  document.querySelectorAll(".mode").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === state.filter);
  });

  const open = state.tasks.filter((task) => !task.done);
  els.openCount.textContent = open.length ? `${open.length} 项未完成` : "全部完成";
  els.today.innerHTML = `今日完成<strong>${state.todayCount} 个番茄</strong>`;

  els.pips.innerHTML = "";
  for (let i = 0; i < state.settings.longEvery; i += 1) {
    const pip = document.createElement("span");
    pip.className = `pip${i < state.focusStreak ? " is-filled" : ""}`;
    els.pips.append(pip);
  }

  const visible = state.tasks.filter((task) => {
    if (state.filter === "open") return !task.done;
    if (state.filter === "done") return task.done;
    return true;
  });

  els.list.innerHTML = "";
  visible.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task";
    if (task.done) item.classList.add("is-done");
    if (task.id === state.currentTaskId && !task.done) item.classList.add("is-current");
    item.dataset.id = task.id;

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check-btn";
    check.dataset.action = "toggle";
    check.setAttribute("aria-label", task.done ? "标为未完成" : "标为完成");
    check.textContent = task.done ? "✓" : "";

    const body = document.createElement("div");
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = task.title;
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = task.pomodoros ? `已投入 ${task.pomodoros} 个番茄` : "还没有投入番茄";
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (!task.done) {
      const focus = document.createElement("button");
      focus.type = "button";
      focus.className = "focus-btn";
      focus.dataset.action = "focus";
      const selected = task.id === state.currentTaskId;
      focus.classList.toggle("is-on", selected);
      focus.textContent = selected ? "专注中" : "专注";
      actions.append(focus);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.dataset.action = "delete";
    remove.setAttribute("aria-label", "删除");
    remove.textContent = "删除";
    actions.append(remove);

    item.append(check, body, actions);
    els.list.append(item);
  });

  const emptyCopy = {
    open: "清单是空的。写下一件现在就能开始的小事。",
    done: "还没有完成的事项。",
    all: "还没有任何事项。",
  };
  els.empty.hidden = visible.length > 0;
  els.empty.textContent = emptyCopy[state.filter];
  els.clearDone.hidden = !state.tasks.some((task) => task.done);
}

function switchMode(mode) {
  if (state.running) {
    state.running = false;
    state.remainingMs = remaining();
    state.endsAt = null;
  }
  state.mode = mode;
  state.remainingMs = durationOf(mode);
  state.endsAt = null;
  persist();
  render();
}

function toggle() {
  if (state.running) {
    state.remainingMs = remaining();
    state.running = false;
    state.endsAt = null;
  } else {
    if (state.remainingMs <= 0) state.remainingMs = durationOf(state.mode);
    state.running = true;
    state.endsAt = Date.now() + state.remainingMs;
    if (Notification.permission === "default") Notification.requestPermission();
  }
  persist();
  render();
}

function resetTimer() {
  state.running = false;
  state.endsAt = null;
  state.remainingMs = durationOf(state.mode);
  persist();
  render();
}

function finishSegment(skipped) {
  const finishedMode = state.mode;
  const wasRunningOrDue = state.running || state.remainingMs <= 0 || skipped;
  if (!wasRunningOrDue && !skipped) return;

  state.running = false;
  state.endsAt = null;

  if (!skipped && finishedMode === "focus") {
    state.todayCount += 1;
    state.focusStreak += 1;
    const task = currentTask();
    if (task) task.pomodoros += 1;
    showToast(task ? `完成一个番茄：${task.title}` : "完成一个番茄。");
    chime();
    notify("专注结束", task ? `「${task.title}」完成一轮。` : "这一轮专注结束了。");
  } else if (!skipped) {
    showToast(finishedMode === "short" ? "短休结束。" : "长休结束。");
    chime();
    notify("休息结束", "可以开始下一轮专注。");
  }

  let next = "focus";
  if (!skipped && finishedMode === "focus") {
    if (state.focusStreak >= state.settings.longEvery) {
      state.focusStreak = 0;
      next = "long";
    } else next = "short";
  }

  state.mode = next;
  state.remainingMs = durationOf(next);
  if (!skipped && state.settings.autoStart) {
    state.running = true;
    state.endsAt = Date.now() + state.remainingMs;
  }
  persist();
  render();
}

function addTask(event) {
  event.preventDefault();
  const title = els.input.value.trim();
  if (!title) return;
  const task = { id: crypto.randomUUID(), title, done: false, pomodoros: 0 };
  state.tasks.unshift(task);
  if (!currentTask()) state.currentTaskId = task.id;
  els.input.value = "";
  persist();
  render();
  els.input.focus();
}

function onListClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const item = button.closest(".task");
  const task = state.tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;

  if (button.dataset.action === "toggle") {
    task.done = !task.done;
    if (task.done && state.currentTaskId === task.id) {
      state.currentTaskId = state.tasks.find((entry) => !entry.done)?.id || null;
    }
    if (!task.done && !currentTask()) state.currentTaskId = task.id;
  } else if (button.dataset.action === "focus") {
    state.currentTaskId = task.id;
    if (state.mode !== "focus") switchMode("focus");
  } else if (button.dataset.action === "delete") {
    state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
    if (state.currentTaskId === task.id) {
      state.currentTaskId = state.tasks.find((entry) => !entry.done)?.id || null;
    }
  }
  persist();
  render();
}

function saveSettings() {
  const data = new FormData(els.settingsForm);
  const next = {
    focus: clamp(data.get("focus"), 1, 90, 25),
    short: clamp(data.get("short"), 1, 30, 5),
    long: clamp(data.get("long"), 1, 60, 15),
    longEvery: clamp(data.get("longEvery"), 2, 8, 4),
    autoStart: data.get("autoStart") === "on",
    sound: data.get("sound") === "on",
  };
  const durationChanged = next[state.mode] !== state.settings[state.mode];
  state.settings = next;
  if (!state.running && durationChanged) state.remainingMs = durationOf(state.mode);
  if (state.focusStreak >= state.settings.longEvery) state.focusStreak = state.settings.longEvery - 1;
  syncSettingsForm();
  persist();
  render();
}

function syncSettingsForm() {
  for (const [key, value] of Object.entries(state.settings)) {
    const field = els.settingsForm.elements[key];
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  }
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

let toastTimer = 0;
function showToast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function notify(title, body) {
  try {
    if (Notification.permission === "granted") new Notification(title, { body });
  } catch {
    /* 通知不可用时只保留页面内提示 */
  }
}

function chime() {
  if (!state.settings.sound) return;
  let audio;
  try {
    audio = new AudioContext();
  } catch {
    return;
  }
  const now = audio.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02 + index * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + index * 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + index * 0.12);
    osc.stop(now + 0.5 + index * 0.12);
  });
  setTimeout(() => audio.close(), 1200);
}
