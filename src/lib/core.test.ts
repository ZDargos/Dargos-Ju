import { describe, expect, it, beforeEach } from 'vitest';
import { parseSentenceCsv } from './csv';
import { getContent } from './content';
import { setState, getState } from './store';
import { buildExtraPractice, buildSession, cardKey, gradeCard } from './srs';
import { termDifficulty } from './stats';
import { mutate, normalize } from '../games/common';
import { DEFAULT_SETTINGS } from '../types';

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
    const d = termDifficulty(content, getState().logs);
    const top = d.words.r.filter((t) => t.seen >= 3)[0];
    expect(top.term).toBe('门口');
    expect(d.chars.r.filter((t) => t.seen >= 3).slice(0, 2).map((t) => t.term)).toContain('门');
  });
});

describe('game mutations', () => {
  it('always produce a sentence that differs from the original', () => {
    const content = getContent();
    const vocab = [...new Set(content.sentences.flatMap((s) => s.tokens))];
    for (const s of content.sentences.slice(0, 200)) {
      const m = mutate(s.tokens, vocab);
      if (m) expect(normalize(m.tokens.join(''))).not.toBe(normalize(s.zh));
    }
  });
});
