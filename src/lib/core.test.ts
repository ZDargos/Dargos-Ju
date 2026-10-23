import { describe, expect, it, beforeEach } from 'vitest';
import { parseSentenceCsv } from './csv';
import { getContent } from './content';
import { setState, getState } from './store';
import { buildExtraPractice, buildFullDeck, buildSession, cardKey, fullDeckProgress, gradeCard, markFullDeckDone, sentenceUnits, setCardsHidden } from './srs';
import { termDifficulty } from './stats';
import { mutate, vocabOf } from '../games/common';
import { opsFor, project, tilesFor, wordsFor } from './learn';
import { cleanEnglish, normalizeEnglish, tokenizeEnglish } from './english';
import { DEFAULT_SETTINGS } from '../types';
import { drawSentence } from './deck';
import { glossOf, vocabFor } from './vocab';
import { choiceQuestions, duelAnswerOk, duelSeconds, wordSequence } from './vocabGame';
import { pinyinLettersMatch, pinyinMatches, toSapi } from './pinyin';
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
    const session = buildSession(sentenceUnits(content, levels), { ...s, newPerDay: 0 });
    expect(session.length).toBe(30);
    expect(new Set(session.map((i) => i.sid)).size).toBe(session.length);
    const extra = buildExtraPractice(sentenceUnits(content, levels), s);
    expect(new Set(extra.map((i) => i.sid)).size).toBe(extra.length);
  });

  it('introduces reading before producing in both mode and respects the daily new limit', () => {
    const session = buildSession(sentenceUnits(content, levels), { ...getState().settings, newPerDay: 10 });
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
    const session = buildSession(sentenceUnits(content, levels), { ...getState().settings, learning: 'en' });
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
    const first = Array.from({ length: 50 }, () => drawSentence('close-call', 'zh', pool)!.id);
    expect(new Set(first).size).toBe(50);
    const second = Array.from({ length: 50 }, () => drawSentence('close-call', 'zh', pool)!.id);
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

describe('word study', () => {
  const content = getContent();
  const levels = content.levels.map((l) => l.level);

  it('takes words from the sentence splits, without duplicates across levels', () => {
    const one = vocabFor(content, 'zh', [levels[0]], 'words');
    const all = vocabFor(content, 'zh', levels, 'words');
    expect(new Set(all.map((v) => v.id)).size).toBe(all.length);
    expect(all.length).toBeGreaterThan(one.length);
    const tokenWords = new Set(content.sentences.filter((s) => s.level === levels[0]).flatMap((s) => s.tokens));
    for (const v of one) expect(tokenWords.has(v.text)).toBe(true);
    expect(one.every((v) => v.py && v.gloss)).toBe(true);
  });

  it('has single characters in Chinese mode and dictionary forms in English mode', () => {
    const chars = vocabFor(content, 'zh', levels, 'chars');
    expect(chars.every((v) => [...v.text].length === 1)).toBe(true);
    const en = vocabFor(content, 'en', levels);
    expect(en.length).toBeGreaterThan(300);
    expect(en.some((v) => v.text === 'went')).toBe(false);
    expect(en.every((v) => v.text === v.text.toLowerCase() || v.text === 'I')).toBe(true);
  });

  it('schedules word cards separately from sentence cards', () => {
    setState({ cards: {}, logs: [], settings: { ...DEFAULT_SETTINGS, newPerDay: 5, wordsNewPerDay: 7, sessionSize: 30 } });
    const units = vocabFor(content, 'zh', levels, 'both').map((v) => ({ id: v.id, level: v.level }));
    const session = buildSession(units, getState().settings);
    expect(session).toHaveLength(7);
    expect(session.every((i) => i.sid.startsWith('w:'))).toBe(true);
    expect(buildSession(sentenceUnits(content, levels), getState().settings)).toHaveLength(5);
  });
});

describe('pinyin', () => {
  it('accepts tone numbers or marks, spaces optional, v for ü', () => {
    expect(pinyinMatches('ni3hao3', 'nǐ hǎo')).toBe(true);
    expect(pinyinMatches('nǐhǎo', 'nǐ hǎo')).toBe(true);
    expect(pinyinMatches('Ni3 Hao3', 'nǐ hǎo')).toBe(true);
    expect(pinyinMatches('lv4', 'lǜ')).toBe(true);
    expect(pinyinMatches('ma', 'ma')).toBe(true);
    expect(pinyinMatches('ma5', 'ma')).toBe(true);
  });
  it('requires the right tones', () => {
    expect(pinyinMatches('ni hao', 'nǐ hǎo')).toBe(false);
    expect(pinyinMatches('ni2hao3', 'nǐ hǎo')).toBe(false);
    expect(pinyinLettersMatch('ni2hao3', 'nǐ hǎo')).toBe(true);
    expect(pinyinMatches('', 'nǐ')).toBe(false);
  });
  it('makes Azure readings', () => {
    expect(toSapi('nǐ hǎo')).toBe('ni 3 hao 3');
    expect(toSapi('lǜ')).toBe('lv 4');
    expect(toSapi('le')).toBe('le 5');
  });
});

describe('vocabulary games', () => {
  const content = getContent();
  const levels = content.levels.map((l) => l.level);
  const zh = vocabFor(content, 'zh', levels);
  const en = vocabFor(content, 'en', levels);

  it('speed questions have four different options including the answer, the same for the same seed', () => {
    const a = choiceQuestions(zh, 7);
    const b = choiceQuestions([...zh].reverse(), 7);
    for (let i = 0; i < 40; i++) {
      const q = a(i);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(4);
      expect(q.options.some((o) => o.id === q.item.id)).toBe(true);
      expect(b(i).item.id).toBe(q.item.id);
    }
  });

  it('pinyin mode never offers two options that sound the same', () => {
    const q = choiceQuestions(zh, 11, 'sound');
    for (let i = 0; i < 60; i++) {
      const pys = q(i).options.map((o) => o.py.toLowerCase());
      expect(new Set(pys).size).toBe(4);
    }
  });

  it('deals every word once before repeating', () => {
    const small = zh.slice(0, 20);
    const seq = wordSequence(small, 3);
    expect(new Set(Array.from({ length: 20 }, (_, i) => seq(i).id)).size).toBe(20);
  });

  it('duel answers: pinyin without tones is fine, English must be spelled right', () => {
    const word = zh.find((v) => v.text === '电话') ?? zh.find((v) => v.py.includes(' '))!;
    const letters = word.py.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s/g, '');
    expect(duelAnswerOk(letters, word, 'zh')).toBe(true);
    expect(duelAnswerOk(word.py, word, 'zh')).toBe(true);
    expect(duelAnswerOk('xyz', word, 'zh')).toBe(false);
    const pang = zh.find((v) => v.text === '胖');
    if (pang) {
      expect(duelAnswerOk('pang', pang, 'zh')).toBe(true);
      expect(duelAnswerOk('pan', pang, 'zh')).toBe(true);
    }
    const go = en.find((v) => v.text === 'go')!;
    expect(duelAnswerOk('Go', go, 'en')).toBe(true);
    expect(duelAnswerOk('goo', go, 'en')).toBe(false);
  });

  it('duel clock runs from 15 seconds down to 6', () => {
    expect(duelSeconds(0)).toBe(15);
    expect(duelSeconds(4)).toBe(12);
    expect(duelSeconds(100)).toBe(6);
    expect(duelSeconds(0, 'easy')).toBe(25);
    expect(duelSeconds(12, 'easy')).toBe(10);
    expect(duelSeconds(0, 'medium')).toBe(20);
    expect(duelSeconds(50, 'medium')).toBe(6);
  });

  it('speed round XP comes from the net score, so random tapping earns nothing', () => {
    const at = (i: number) => new Date(2026, 9, 25, 12, 0, i).toISOString();
    const rounds = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, game: 'speed-meaning', mode: 'solo' as const, correct: i % 4 === 0, ms: 600, at: at(i) }));
    const s = computeXp({ logs: [], rounds, vs: [], liveVoices: 0, goalHistory: [], now: Date.parse(at(30)) });
    const challenge = s.today.challengesDone * XP_RULES.challenge + (s.today.challengesDone === 3 ? XP_RULES.sweep : 0);
    expect(s.today.xp - challenge).toBe(0);
  });
});

describe('full deck and hidden cards', () => {
  const content = getContent();
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

  it('goes through every card once per pass, readings first, then reshuffles', () => {
    localStorage.clear();
    setState({ cards: {}, logs: [], settings: { ...DEFAULT_SETTINGS, directions: 'both' } });
    const s = getState().settings;
    const units = sentenceUnits(content, [content.levels[0].level]).slice(0, 10);
    const first = buildFullDeck(units, s);
    expect(first).toHaveLength(20);
    expect(first.slice(0, 10).every((i) => i.dir === 'r')).toBe(true);
    for (const item of first.slice(0, 7)) markFullDeckDone(units, s, item);
    expect(fullDeckProgress(units, s)).toEqual({ done: 7, total: 20 });
    expect(buildFullDeck(units, s).map((i) => i.sid + i.dir)).toEqual(first.slice(7).map((i) => i.sid + i.dir));
    let complete = false;
    for (const item of first.slice(7)) complete = markFullDeckDone(units, s, item);
    expect(complete).toBe(true);
    expect(fullDeckProgress(units, s)).toEqual({ done: 0, total: 20 });
    // Another level combination has its own order.
    const other = sentenceUnits(content, [content.levels[1].level]).slice(0, 5);
    expect(fullDeckProgress(other, s)).toEqual({ done: 0, total: 10 });
  });

  it('hidden cards never come up in sessions or the full deck', () => {
    localStorage.clear();
    const units = sentenceUnits(content, [content.levels[0].level]).slice(0, 10);
    setState({ cards: {}, logs: [], settings: { ...DEFAULT_SETTINGS, directions: 'r', newPerDay: 50, sessionSize: 50 } });
    const hide = units.slice(0, 3).map((u) => cardKey(u.id, 'r'));
    setState({ settings: { ...getState().settings, ...setCardsHidden(hide, true, getState().settings) } });
    const s = getState().settings;
    const session = buildSession(units, s);
    expect(session.some((i) => hide.includes(cardKey(i.sid, i.dir)))).toBe(false);
    expect(session).toHaveLength(7);
    expect(buildFullDeck(units, s)).toHaveLength(7);
    setState({ settings: { ...s, ...setCardsHidden(hide.slice(0, 1), false, s) } });
    expect(buildSession(units, getState().settings)).toHaveLength(8);
  });
});

describe('chosen definitions', () => {
  it('a picked or written definition replaces the dictionary one', () => {
    const v = vocabFor(getContent(), 'zh', [getContent().levels[0].level])[0];
    setState({ settings: { ...DEFAULT_SETTINGS, glossOverrides: {} } });
    const plain = glossOf(v);
    setState({ settings: { ...DEFAULT_SETTINGS, glossOverrides: { [`zh:${v.text}`]: 'my meaning' } } });
    expect(glossOf(v)).toBe('my meaning');
    expect(glossOf(v, false)).toBe('my meaning');
    setState({ settings: { ...DEFAULT_SETTINGS } });
    expect(glossOf(v)).toBe(plain);
  });
});
