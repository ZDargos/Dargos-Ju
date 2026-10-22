/**
 * Marks an interface string that is stored in a table and translated later with t(label).
 * It returns the text unchanged; the i18n test finds msg('...') and t('...') strings and checks
 * each one has a Chinese translation in zh.ts. Has no imports so build scripts can use it.
 */
export const msg = <T extends string>(text: T): T => text;
