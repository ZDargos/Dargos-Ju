// What the Study page studies: the sentences of the selected levels, or their words (plus "My words").

import { sentenceUnits, type StudyUnit } from './srs';
import { vocabFor } from './vocab';
import { myVocab } from './myWords';
import type { Content } from './content';
import type { Settings } from '../types';

export function studyUnits(content: Content, settings: Settings, words: boolean, levels: number[] = settings.studyLevels): StudyUnit[] {
  if (!words) return sentenceUnits(content, levels);
  const kind = settings.learning === 'zh' ? settings.wordKind ?? 'both' : 'words';
  return [...myVocab(settings.learning), ...vocabFor(content, settings.learning, levels, kind)]
    .filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i)
    .map((v) => ({ id: v.id, level: v.level }));
}
