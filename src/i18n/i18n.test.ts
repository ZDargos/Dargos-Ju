import { describe, expect, it } from 'vitest';
import zh from './zh';
import { missingKeys, placeholderMismatches } from '../../scripts/i18n-keys.ts';

// Both modes must be fully usable: every interface string needs a Chinese translation.
describe('interface translations', () => {
  it('every t() and msg() string has Chinese in zh.ts', () => {
    expect(missingKeys(zh)).toEqual([]);
  });
  it('translations keep their {placeholders}', () => {
    expect(placeholderMismatches(zh)).toEqual([]);
  });
});
