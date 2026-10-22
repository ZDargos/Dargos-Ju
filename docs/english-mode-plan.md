# English-learning mode: plan

A switch in Settings turns Dargos Ju from "learn Chinese" into "learn English" for Chinese speakers.
It uses the same sentences in reverse, the whole app switches to Chinese, and anything that only
makes sense for Chinese learners is hidden or swapped for its English equivalent.

## 1. Switching modes

- **Choosing a mode:** Settings gets a switch: **I'm learning: 中文 Chinese / 英语 English**. New
  users pick a mode the first time they open the app. The choice is saved to the account, so it
  follows you to every device.
- **App language:** in English mode the whole app is in Simplified Chinese: buttons, menus, game
  instructions, stats, error messages, notifications, the login screen and the admin page.
  Settings also has an override (Auto / 中文 / English) for anyone who wants it different.
- **Login screen:** it shows in Chinese if the phone or browser is set to Chinese, so a Chinese
  speaker can sign up without reading English.
- **Separate progress:** each mode has its own card schedules, history, stats and game results.
  Switching back and forth loses nothing.

## 2. Studying (flashcards)

| | Chinese mode (today) | English mode |
|---|---|---|
| Reading card | See Chinese, translate to English | See English, translate to Chinese |
| Producing card | See English, say the Chinese | See Chinese, say the English |
| Answer side | Chinese words with pinyin | English words with phonetics (音标) and Chinese meaning |
| Audio | Chinese voice | English voice, which every phone and computer already has |

Grading stays the same (错了 / 基本对 / 对了), and so do FSRS scheduling, levels, the daily new-card
limit and the rule of one direction per sentence per session.

## 3. What English learners need that the app doesn't have yet

1. **Clean English sentences.** The English side was written as translation notes, not as model
   English. A few examples:
   - Some lines have notes or alternatives: "My name is bread (literally: I am called Bread.)" and
     "He asked me my name / he asked me what I'm yelling."
   - Some have grammar slips: "We very happy together." and "I always rest by the river.."
   - One has a broken character: "what I�m yelling".

   I'll proofread all 705 English lines and save corrected versions in a separate file. Your CSVs
   stay untouched. English mode uses the corrected text, and the notes and alternatives still
   show on the flashcard answer.
2. **An English–Chinese dictionary.** CC-CEDICT only goes from Chinese to English. I'd add
   **ECDICT**, a free English-Chinese dictionary (MIT license). It has Chinese meanings,
   phonetics, parts of speech, how common each word is, and word forms (go / went / gone). Only
   the entries the app needs get bundled, so it stays small.
3. **Phonetics (音标) instead of pinyin.** The 拼 button becomes an **音标** button that shows
   pronunciation over English words.
4. **Word forms.** Hardest-word stats count "go", "goes" and "went" as one word (from ECDICT's
   word forms), so the stats show which words someone struggles with, not which spellings.
5. **English-specific game mistakes.** Spot the error and Close call use the mistakes Chinese
   speakers actually make in English:
   - a / an / the, and dropped articles
   - in / on / at / to
   - is / are / was / were, and do / does / did
   - he / she / him / her
   - plural -s
   - tense (go / went)
   - much / many and few / little
6. **Fair checking.** Answers ignore capital letters and punctuation, treat "don't" the same as
   "do not", and word tiles start in lowercase so the capital letter doesn't give away the first
   word.

## 4. Games in English mode

- **Word order:** you see the Chinese and put English word tiles in order.
- **Sentence builder:** you translate Chinese into English with a word bank that has extra
  English words. Free build uses English words.
- **Spot the error:** an English sentence with one wrong, missing or extra word.
- **Close call:** you see the Chinese and pick the right English from options that differ by one
  detail.
- **Dictation:** you hear English, then rebuild it with tiles or type it.
- **Everything else:** green and red tiles, stats, vs and the after-match summary all work the
  same way.

## 5. Features that change or disappear in English mode

| Feature | English mode |
|---|---|
| 拼 pinyin button | Becomes the 音标 phonetics button |
| "Characters" tab in hardest words | Hidden (word forms are grouped instead) |
| Tap-a-word dictionary | English word → phonetics, Chinese meanings, word forms |
| Chinese voice check in Settings | English voice check |
| Word-split fixing on the admin page | English sentences are split automatically, so there's nothing to fix |

## 6. Friends, vs and notifications

- **Matches:** players are matched with people learning the same language. A challenge carries
  the challenger's mode, so both players get the same kind of game.
- **Leaderboards:** they count answers in both modes combined, so friends learning different
  languages can still compete. This could also be per mode instead (see the questions below).
- **Notifications:** they arrive in each person's own app language.

## 7. Accessibility

- **Screen readers:** each piece of text is tagged with its language, so the phone reads Chinese
  in a Chinese voice and English in an English voice instead of mangling one of them.
- **Text size:** a new setting (normal / large / extra large) for everything.
- **Not color alone:** right and wrong always show a word or symbol as well as a color.
- **Touch targets and labels:** large buttons stay, and every icon button gets a spoken label in
  the app's language.

## 8. Keeping both modes working in future updates

- **Coding rule:** all text goes through one translation file with Chinese and English versions,
  and every feature reads "which language is being learned" from one place.
- **Automatic check:** a test fails if any text is missing its Chinese or English version.
- **Instructions for future work:** a `CLAUDE.md` file in the repository says every change must
  work in both modes and lists what to check. That covers future versions of me and anyone else
  working on the code.

## 9. Order of work

1. Translation system, the mode switch, separate progress, flashcards, the Chinese interface and
   CLAUDE.md.
2. Cleaned English sentences, ECDICT, phonetics, and English versions of all five games.
3. Vs, friends, notifications and stats per mode.

The English mode switch stays hidden until all three steps are done, so nobody sees half of it.

## Questions

1. Can I add the **ECDICT** English–Chinese dictionary? (Recommended: yes.)
2. Can I **proofread and correct the English sentences** for English mode, keeping your CSVs as
   they are? (Recommended: yes.)
3. Should **leaderboards** combine both modes or be separate? (Recommended: combined.)
