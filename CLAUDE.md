# Dargos Ju: rules for changes

The app has two modes that must both keep working after every change:

- **Learning Chinese** (`settings.learning === 'zh'`, the default): interface in English.
- **Learning English** (`settings.learning === 'en'`, for Chinese speakers): same sentences reversed,
  interface in Chinese by default.

Before calling any feature done, check it in both modes.

## Interface text

- Every string a person can see (labels, buttons, `aria-label`, `title`, `placeholder`, `alert`,
  `confirm`, errors shown on screen) goes through `t('English text')` from `src/i18n`.
  Use `{name}` placeholders for values, never string concatenation: `t('{n} left', { n })`.
- Strings kept in tables and translated later with `t(label)` are wrapped in `msg('...')`
  (`src/i18n/msg.ts`) so the checker finds them.
- Add the Chinese for every new string to `src/i18n/zh.ts`. `node scripts/i18n-keys.ts` lists what's
  missing; `src/i18n/i18n.test.ts` fails the build if anything is untranslated or a placeholder is lost.
- Components that show text call `useT()` (or `const t = useT()`) so they re-render when the language changes.
- Language names come from `langName()` / `langParams()`; level names from `levelName()`.
- Server-sent text (the `notify-challenge` Edge Function) picks the recipient's language from
  `user_settings.settings` (`uiLang`, else Chinese when `learning === 'en'`).

## The language being learned

- Never assume the learned language is Chinese. Go through `src/lib/learn.ts`:
  - `project(sentence, lang)` gives a `LearnSentence` with `target` (language being learned),
    `native` (the other) and `tokens`.
  - `opsFor(lang)` gives word tests, tile tests, answer normalising, joining tokens, confusable
    words and the speech language.
  - `lexiconFor`, `lookup`, `tilesFor`, `wordsFor` for pronunciation, meanings, tiles and word stats.
- The mode comes from `settings.learning`; screens that need a fixed mode for their whole life
  (a study session, a game, a vs match) read it once and provide it with `LearnContext`.
- Speech: `speak(text, rate, lang)` plays the sentence's pre-made audio (`public/audio`, keyed by
  `audioKey(lang, text)` of the exact text) and falls back to device speech; voice checks: `voiceStatus(lang)`.
  Any new text the app speaks as a whole sentence should be added to `scripts/make-audio.ts`.
  Never overwrite audio whose manifest entry has `"source": "human"`.
  People's recordings (`lib/voices.ts`, tables `voice_recordings`/`voice_votes`) play before the
  neural audio while they stand; they're keyed by the same `audioKey`, so a recording only matches
  the exact text it was made for.
- Pronunciation display: pinyin in Chinese mode, IPA phonetics in English mode (`components/Pinyin.tsx`).
- Mark text in each language with `lang="zh-CN"` / `lang="en"` and the `zh` class for Chinese, so
  screen readers and fonts are right.

## Data

- Progress is separate per mode: card keys `sid|dir` (Chinese) and `en:sid|dir` (English);
  `review_logs.lang` and `game_rounds.lang` are `'zh'` or `'en'` (missing means `'zh'`).
  New per-user data that depends on the mode must record the language too.
- Leaderboards combine both modes. Vs matches allow players on different modes
  (`matches.lang_a/lang_b`); a tie on score goes to the faster time per word (`decideWinner`).
- Never edit the sentence CSVs. English fixes go in `data/english-corrections.json`; word-split fixes
  in `data/segmentation.json`. Run `npm run sentences` after changing data.
- Sentences added in the admin page store `en_clean` and `en_lex` so they work in English mode.

## Platforms

Since 2026-10-22 the app is used only as the website and the iPhone home-screen web app. The
Android project (`android/`) is no longer maintained: don't build or ship APKs, and don't spend
effort keeping native Android code in step. Test on phone-width browsers (Safari on iPhone matters most).

## Checks before committing

`npx tsc --noEmit -p .` and `npm test` must pass. Try the change in the browser in both modes
(Settings → Language), at phone width.
