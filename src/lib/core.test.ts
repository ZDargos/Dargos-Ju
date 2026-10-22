import { describe, expect, it, beforeEach } from 'vitest';
import { parseSentenceCsv } from './csv';
import { getContent } from './content';
import { setState, getState } from './store';
import { buildExtraPractice, buildSession, cardKey, gradeCard } from './srs';
import { termDifficulty } from './stats';
import { mutate, vocabOf } from '../games/common';
import { opsFor, project, tilesFor, wordsFor } from './learn';
import { cleanEnglish, normalizeEnglish, tokenizeEnglish } from './english';
import { DEFAULT_SETTINGS } from '../types';
import { drawSentence } from './deck';
import { BADGES, XP_RULES, badgeStatus, challengesFor, computeXp, dayKey, levelFor, xpForLevel } from './xp';

describe('csv', () => {
  it('parses quoted fields, BOM and header', () => {
    const rows = parseSentenceCsv('﻿Chinese,English\n我是中国人。,I am Chinese\n"你好，朋友","Hello, friend"\r\n');
    expect(rows).toEqual([
      { zh: '我是中国人。', en: 'I am Chinese' },
      { zh: '你好，朋友', en: 'Hello, friend' },
    ]);
  });
});

describe('sessions', () => {
  const content = getContent();
  const levels = content.levels.map((l) => l.level);
  beforeEach(() => {
    setState({ userId: null, cards: {}, logs: [], dirtyCards: {}, unsyncedLogs: {}, settings: { ...DEFAULT_SETTINGS, sessionSize: 30, newPerDay: 30 } });
  });

  it('has the bundled levels', () => {
    expect(content.sentences.length).toBe(705);
    expect(levels).toEqual([13, 14, 15, 16, 17, 18, 19]);
  });

  it('never includes both directions of a sentence', () => {
    // Make every card seen and due in both directions.
    const s = getState().settings;
    for (const sen of content.sentences.slice(0, 60)) {
      gradeCard(sen.id, 'r', 3, false);
      gradeCard(sen.id, 'p', 1, false);
    }
    setState((st) => ({
      cards: Object.fromEntries(Object.entries(st.cards).map(([k, v]) => [k, { ...v, card: { ...v.card, due: new Date(Date.now() - 1000).toISOString() } }])),
    }));
    const session = buildSession(content, levels, { ...s, newPerDay: 0 });
    expect(session.length).toBe(30);
    expect(new Set(session.map((i) => i.sid)).size).toBe(session.length);
    const extra = buildExtraPractice(content, levels, s);
    expect(new Set(extra.map((i) => i.sid)).size).toBe(extra.length);
  });

  it('introduces reading before producing in both mode and respects the daily new limit', () => {
    const session = buildSession(content, levels, { ...getState().settings, newPerDay: 10 });
    expect(session.length).toBe(10);
    expect(session.every((i) => i.dir === 'r' && i.kind === 'new')).toBe(true);
  });

  it('wrong answers come back soon, right answers on new cards go to the next step', () => {
    const sid = content.sentences[0].id;
    const dueWrong = gradeCard(sid, 'r', 1, false);
    expect(dueWrong.getTime() - Date.now()).toBeLessThan(5 * 60000);
    expect(getState().cards[cardKey(sid, 'r')].card.state).toBeGreaterThan(0);
    expect(getState().logs.at(-1)?.mode).toBe('new');
  });

  it('ranks words that keep being missed as hardest', () => {
    const target = content.sentences.filter((s) => s.tokens.includes('门口')).slice(0, 4);
    const others = content.sentences.filter((s) => !s.zh.includes('门')).slice(0, 20);
    for (const s of target) gradeCard(s.id, 'r', 1, false);
    for (const s of others) gradeCard(s.id, 'r', 3, false);
    const d = termDifficulty(content, getState().logs, 'zh');
    const top = d.words.r.filter((t) => t.seen >= 3)[0];
    expect(top.term).toBe('门口');
    expect(d.chars.r.filter((t) => t.seen >= 3).slice(0, 2).map((t) => t.term)).toContain('门');
  });
});

describe('game mutations', () => {
  it('always produce a sentence that differs from the original', () => {
    const content = getContent();
    for (const lang of ['zh', 'en'] as const) {
      const ops = opsFor(lang);
      const sentences = content.sentences.map((s) => project(s, lang));
      const vocab = vocabOf(sentences.map((s) => s.tokens), ops);
      for (const s of sentences.slice(0, 200)) {
        const m = mutate(s.tokens, vocab, ops);
        if (m) expect(ops.normalize(ops.join(m.tokens))).not.toBe(ops.normalize(s.target));
      }
    }
  });
});

describe('English mode', () => {
  const content = getContent();
  beforeEach(() => {
    setState({ userId: null, cards: {}, logs: [], dirtyCards: {}, unsyncedLogs: {}, settings: { ...DEFAULT_SETTINGS, sessionSize: 30, newPerDay: 30 } });
  });

  it('cleans translation notes into playable English', () => {
    expect(cleanEnglish('My name is Bread (literally: steamed bun)')).toBe('My name is Bread.');
    expect(cleanEnglish('It is midday/noon.')).toBe('It is midday.');
    expect(cleanEnglish('Hello , friend !!')).toBe('Hello, friend!');
  });

  it('tokenizes words, contractions and numbers', () => {
    expect(tokenizeEnglish("Don't take the A380 at 3:30.")).toEqual(["Don't", 'take', 'the', 'A380', 'at', '3:30', '.']);
  });

  it('compares answers ignoring case, punctuation and contractions', () => {
    expect(normalizeEnglish("Don't go!")).toBe(normalizeEnglish('do not go'));
    expect(normalizeEnglish("I'm here.")).toBe(normalizeEnglish('i am here'));
    expect(normalizeEnglish('I am here')).not.toBe(normalizeEnglish('I was here'));
  });

  it('every sentence has playable English with tiles and dictionary words', () => {
    let withGloss = 0;
    let words = 0;
    for (const s of content.sentences) {
      const ls = project(s, 'en');
      expect(ls.target.length).toBeGreaterThan(0);
      expect(ls.native).toBe(s.zh);
      expect(tilesFor(ls, content).length).toBeGreaterThan(0);
      for (const w of ls.tokens.filter(opsFor('en').isWord)) {
        words++;
        if (content.enLexicon[w.toLowerCase()]) withGloss++;
      }
    }
    // Nearly every English word has phonetics and a Chinese meaning.
    expect(withGloss / words).toBeGreaterThan(0.97);
  });

  it('tiles start lowercase so the capital letter does not give away the first word', () => {
    const s = content.sentences.find((x) => /^The /.test(x.enClean))!;
    expect(tilesFor(project(s, 'en'), content)[0]).toBe('the');
  });

  it('keeps English progress separate from Chinese progress', () => {
    const sid = content.sentences[0].id;
    gradeCard(sid, 'r', 3, false, 'en');
    expect(getState().cards[cardKey(sid, 'r', 'en')]).toBeDefined();
    expect(getState().cards[cardKey(sid, 'r')]).toBeUndefined();
    expect(getState().logs.at(-1)?.lang).toBe('en');
    // English sessions only count English cards.
    const levels = content.levels.map((l) => l.level);
    const session = buildSession(content, levels, { ...getState().settings, learning: 'en' });
    expect(session.some((i) => i.sid === sid && i.kind !== 'new')).toBe(false);
  });

  it('treats dialogue labels like "A:" as labels, not words or tiles', () => {
    const s = content.sentences.find((x) => x.enClean.startsWith('A: '))!;
    for (const lang of ['zh', 'en'] as const) {
      const ls = project(s, lang);
      const ops = opsFor(lang);
      expect(ls.tokens[0]).toMatch(/^A[:：]$/);
      expect(tilesFor(ls, content)).not.toContain('A');
      expect(ops.normalize(ops.join(tilesFor(ls, content)))).toBe(ops.normalize(ls.target));
    }
  });

  it('mistakes keep English capitals at the start of the sentence', () => {
    const ops = opsFor('en');
    const tokens = ['What', 'opinions', 'does', 'his', 'son', 'have', '?'];
    for (let n = 0; n < 50; n++) {
      const m = mutate(tokens, ['what', 'opinions', 'son'], ops, ['swap', 'missing', 'replace', 'extra']);
      if (!m) continue;
      const first = m.tokens.find(ops.isWord)!;
      expect(first[0]).toBe(first[0].toUpperCase());
      expect(m.tokens.slice(m.tokens.indexOf(first) + 1)).not.toContain('What');
    }
  });

  it('tracks English words by dictionary form', () => {
    const s = content.sentences.find((x) => /went/.test(x.enClean));
    if (s) expect(wordsFor(s, 'en', content)).toContain('go');
  });
});

describe('game sentence deck', () => {
  // Tests run in Node, which has no localStorage.
  const mem = new Map<string, string>();
  globalThis.localStorage ??= {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };

  it('deals every sentence once, at random, before any repeats', () => {
    localStorage.clear();
    const pool = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}` }));
    const first = Array.from({ length: 50 }, () => drawSentence('word-order', 'zh', pool)!.id);
    expect(new Set(first).size).toBe(50);
    const second = Array.from({ length: 50 }, () => drawSentence('word-order', 'zh', pool)!.id);
    expect(new Set(second).size).toBe(50);
    expect(second.join()).not.toBe(first.join());
    // The new pass doesn't open with the sentences that ended the last one.
    expect(first.slice(-20)).not.toContain(second[0]);
  });

  it('keeps a separate deck per game and language', () => {
    localStorage.clear();
    const pool = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
    for (let i = 0; i < 10; i++) drawSentence('dictation', 'zh', pool);
    const other = Array.from({ length: 10 }, () => drawSentence('dictation', 'en', pool)!.id);
    expect(new Set(other).size).toBe(10);
  });
});

describe('XP', () => {
  const day = (n: number, h = 12) => new Date(2026, 0, 1 + n, h).toISOString();
  const cards = (n: number, d: number, mode: 'new' | 'review' | 'extra' = 'review') =>
    Array.from({ length: n }, (_, i) => ({ id: `${d}-${mode}-${i}`, sid: 's', dir: 'r' as const, grade: 3 as const, at: new Date(Date.parse(day(d)) + i * 5000).toISOString(), mode }));
  const now = Date.parse(day(9, 20));

  it('gives the same XP for every grade and ignores answers tapped through', () => {
    const logs = cards(5, 9).map((l, i) => ({ ...l, grade: ((i % 3) + 1) as 1 | 2 | 3 }));
    const quick = [{ ...logs[0], id: 'q', at: new Date(Date.parse(logs[0].at) + 500).toISOString() }];
    const s = computeXp({ logs: [...logs, ...quick], rounds: [], vs: [], liveVoices: 0, goalHistory: [], now });
    const plain = Math.round(5 * XP_RULES.card);
    expect(s.today.xp - s.today.challengesDone * XP_RULES.challenge - (s.today.challengesDone === 3 ? XP_RULES.sweep : 0)).toBe(plain);
  });

  it('grows the streak bonus to +60% by day 7 and resets after a missed day', () => {
    const logs = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((d) => cards(6, d));
    const s = computeXp({ logs, rounds: [], vs: [], liveVoices: 0, goalHistory: [], now: Date.parse(day(7, 20)) });
    expect(s.days.map((d) => d.multiplier)).toEqual([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.6]);
    expect(s.streak).toBe(8);
    const gap = [0, 1, 2, 4].flatMap((d) => cards(6, d));
    const g = computeXp({ logs: gap, rounds: [], vs: [], liveVoices: 0, goalHistory: [], now: Date.parse(day(4, 20)) });
    expect(g.days.at(-1)!.multiplier).toBe(1);
    expect(g.bestStreak).toBe(3);
  });

  it('keeps past days on the goal they had', () => {
    const logs = [0, 1].flatMap((d) => cards(6, d));
    const history = [{ from: dayKey(day(1)), xp: 300 }];
    const s = computeXp({ logs, rounds: [], vs: [], liveVoices: 0, goalHistory: history, now: Date.parse(day(1, 20)) });
    expect(s.days[0].met).toBe(true);
    expect(s.days[1].goal).toBe(300);
  });

  it('counts voice lines in total XP but not toward daily goals', () => {
    const s = computeXp({ logs: [], rounds: [], vs: [], liveVoices: 3, goalHistory: [], now });
    expect(s.total).toBe(30);
    expect(s.today.xp).toBe(0);
  });

  it('levels and badges follow XP', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(5))).toBe(5);
    expect(levelFor(xpForLevel(5) - 1)).toBe(4);
    const s = computeXp({ logs: cards(120, 9), rounds: [], vs: [], liveVoices: 0, goalHistory: [], now });
    expect(badgeStatus(BADGES.find((b) => b.id === 'cards')!, s).tier).toBe(1);
  });

  it('daily challenges are the same for everyone on a day and never use self-grades', () => {
    expect(challengesFor('2026-10-22')).toEqual(challengesFor('2026-10-22'));
    for (let d = 1; d <= 28; d++) {
      const cs = challengesFor(`2026-02-${String(d).padStart(2, '0')}`);
      expect(cs).toHaveLength(3);
      expect(new Set(cs.map((c) => c.kind)).size).toBe(3);
    }
  });
});
