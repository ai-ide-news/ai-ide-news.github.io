// Translations of the Learn guide (see scripts/learn.mjs), one file per language: { name, locale, dir, ui, ch }.
// With English, these are the world's five most-spoken languages: Mandarin Chinese, Hindi, Spanish and Arabic.
// Each chapter's narration is its title plus its paragraphs (narrationFor in learn.mjs); recordings live in
// static/audio/learn/<lang>/ with a manifest of text hashes, just like the English ones.
import zh from './zh.mjs';
import hi from './hi.mjs';
import es from './es.mjs';
import ar from './ar.mjs';

export const TRANSLATIONS = { zh, hi, es, ar };
