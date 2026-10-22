# Dargos Ju

Learn Chinese one sentence at a time. Flashcards scheduled with FSRS, sentence games, and stats on
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

## Android

Needs Android Studio's SDK (`ANDROID_HOME`) and JDK 21 (`JAVA_HOME`).

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Credits

Dictionary data: [CC-CEDICT](https://cc-cedict.org/) by MDBG, CC BY-SA 4.0 (`data/dict/`).
