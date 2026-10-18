const KEY = 'qianli.save.v2';

function fresh() {
  return {
    v: 2,
    started: Date.now(),
    onboarded: false,
    cam: { x: 0.86, y: 0.5, z: 1 },
    beasts: {},
    seals: [],
    finale: 0,
    settings: { sound: 1, motion: 1 },
  };
}

function blankBeast() {
  return {
    clue: 0,
    woke: false,
    grade: null,
    ms: null,
    tries: 0,
    ghost: false,
    hard: null,
    found: false,
  };
}

const RANK = { 神品: 3, 妙品: 2, 能品: 1 };

export class SaveStore {
  constructor() {
    this.memoryOnly = false;
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return this._migrate(JSON.parse(raw));
    } catch {
      this.memoryOnly = true;
      return fresh();
    }
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return fresh();
    const next = fresh();
    next.started = data.started || next.started;
    next.onboarded = Boolean(data.onboarded);
    next.finale = data.finale || 0;
    next.seals = Array.isArray(data.seals) ? data.seals : [];
    if (data.cam) next.cam = { ...next.cam, ...data.cam };
    if (data.settings) next.settings = { ...next.settings, ...data.settings };
    if (data.beasts && typeof data.beasts === 'object') {
      Object.keys(data.beasts).forEach((id) => {
        next.beasts[id] = { ...blankBeast(), ...data.beasts[id] };
      });
    }
    next.v = 2;
    return next;
  }

  beast(id) {
    if (!this.data.beasts[id]) this.data.beasts[id] = blankBeast();
    return this.data.beasts[id];
  }

  /**
   * 保留更好的品第和更短的用时。代笔不盖掉已经拿到的朱印。
   */
  commitClear(id, result) {
    const row = this.beast(id);
    row.woke = true;
    row.found = true;
    row.clue = 3;
    row.tries = result.tries;
    if (result.ghost) {
      if (!row.grade) row.ghost = true;
      this.write();
      return row;
    }
    row.ghost = false;
    const better = !row.grade || (RANK[result.grade] || 0) > (RANK[row.grade] || 0);
    const faster = row.ms == null || result.ms < row.ms;
    if (better) row.grade = result.grade;
    if (faster || better) row.ms = result.ms;
    this.write();
    return row;
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.memoryOnly = false;
    } catch {
      this.memoryOnly = true;
    }
  }

  clear() {
    this.data = fresh();
    try {
      localStorage.removeItem(KEY);
    } catch {
      this.memoryOnly = true;
    }
  }
}
