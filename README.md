# Dargos Ju

Learn Chinese one sentence at a time, or switch to English-learning mode (for Chinese speakers) in
Settings. Flashcards scheduled with FSRS, sentence games, live matches against friends, and stats on
your hardest sentences, words and characters. Runs as a website and as an Android app.

## How it works

- **Sentences** live in `data/sentences/*.csv` (`Chinese,English`, UTF-8). The number in the file
  name is the level, so `chinese_sentence_pairs_LVL_20.csv` becomes Level 20 on the next build.
- **Word splits** are made once at build time (jieba, checked against CC-CEDICT) and saved in
  `data/segmentation.json`. Edit that file to fix a split; saved splits always win. Splits can also
  be fixed in the app's admin page.
- **Scheduling**: each sentence has a reading card (Chinese → English) and a producing card
  (English → Chinese), scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs).
  Wrong = Again, Mostly right = Hard, Right = Good. A session never shows both cards of a sentence.
- **Accounts**: Supabase email login. Progress is private per user (row-level security). Sign-ups
  are invite-only; the first account is the admin. Schema: `supabase/schema.sql`.

## Two modes

Settings → Language → "I'm learning" switches between learning Chinese and learning English. Both
modes use the same sentences, reversed; each keeps its own cards, stats and game history, and the
app's interface follows the mode (Chinese when learning English) unless set in "App language".

- English shown to learners is a cleaned version of the CSV's English (`src/lib/english.ts`), with
  hand corrections in `data/english-corrections.json`. The CSVs themselves are never edited.
- English phonetics and Chinese meanings come from ECDICT (`data/dict/ecdict-subset.json.gz`,
  rebuilt with `scripts/make-ecdict-subset.py`).
- Interface text is written in English inside `t()` and translated in `src/i18n/zh.ts`.
  `node scripts/i18n-keys.ts` lists strings missing a translation; the tests fail if any are.
- Rules for keeping both modes working are in `CLAUDE.md`.

## Sentence audio

Every sentence has natural-voice audio in both languages, made once with Azure neural voices
(free tier) and stored in `public/audio/<lang>/<key>.mp3`, so it sounds the same on every device
and works offline (bundled in the Android app; cached on first play on the web). Anything without
a file (single words, sentences added in the admin page) uses the device's speech.

- `.github/workflows/audio.yml` makes audio for new or changed sentences automatically. It needs
  the repository secrets `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
- `data/audio-manifest.json` lists each file's text, voice and source. To replace one with a
  native-speaker recording, overwrite its mp3 and set `"source": "human"`; the generator never
  overwrites human recordings.
- **Lend your voice** (Study page → `/voice`): native speakers record sentences in their own
  language. A recording plays instead of the neural audio while it stands; listeners rate it
  good or bad, and once it has enough votes with enough of them bad (admin page: default 10 votes,
  51% bad) it is trashed and the sentence needs a voice again. Recordings live in the public
  `voices` Supabase storage bucket (about 15 KB each, 1 MB cap); trashed files are deleted by the
  `voice-cleanup` Edge Function. New sentences join the pool automatically.

## XP and progress

Reviews, games, vs matches and voice lines earn XP (`src/lib/xp.ts`). A streak day means the
daily goal was reached; the streak bonus grows 10% a day up to +60% on day 7 and resets after a
missed day. Three daily challenges, levels with titles, nine badge families and per-level mastery
appear on the Progress page (`/progress`). Each player's total XP is saved on their profile so
friends see their level.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # outputs dist/
```

## iPhone and offline use

The website is an installable web app. On iPhone or iPad, open it in Safari, tap Share, then
**Add to Home Screen**. A service worker (`public/sw.js`) caches the app so it opens and works
offline; reviews are stored on the device and synced when the connection returns.

## Android (no longer maintained)

The app is now used only as the website and iPhone home-screen app. The Android project is kept
for reference but isn't updated.


Needs Android Studio's SDK (`ANDROID_HOME`) and JDK 21 (`JAVA_HOME`).

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Credits

Dictionary data: [CC-CEDICT](https://cc-cedict.org/) by MDBG, CC BY-SA 4.0, and
[ECDICT](https://github.com/skywind3000/ECDICT) by skywind3000, MIT (`data/dict/`).
