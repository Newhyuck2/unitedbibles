# Interlinear original-language data

`data/interlinear/<book>/<chapter>.json` holds the word-by-word Hebrew/Aramaic Old Testament and Greek New Testament interlinear shown by the app's HEB/GRK versions. Each token is `[original, transliteration, English gloss, Strong's code, morphology]`.

The original-language text (the first field) follows the text shown by Bible Hub's interlinear (https://biblehub.com/interlinear/). Transliteration, gloss, Strong's code and morphology come from STEP Bible wherever the word lines up.

## Old Testament (HEB)

- **Hebrew/Aramaic text:** Westminster Leningrad Codex (WLC), taken from the Berean Standard Bible translation tables (`bsb_tables.tsv`, https://bereanbible.com). **Public domain.**
  - Ketiv forms are shown as written, with their pointing.
  - Paragraph markers (פ / ס) stay attached to the word they follow, as Bible Hub shows them.
- **Transliteration, gloss, Strong's code, morphology:** STEP Bible Data, dataset **TAHOT** (https://github.com/STEPBible/STEPBible-Data). For Ketiv words, TAHOT's Ketiv (K=) fields are used.
  - License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution required: **STEP Bible (www.STEPBible.org), based on work at Tyndale House, Cambridge.**

## New Testament (GRK)

- **Greek base text:** Eberhard Nestle, *Η ΚΑΙΝΗ ΔΙΑΘΗΚΗ* (British and Foreign Bible Society, 1904). This is the base text created by Diego Renato dos Santos (https://sites.google.com/site/nestle1904/), with morphology, lemmas and Strong's numbers by Ulrik Sandborg-Petersen, from https://github.com/biblicalhumanities/Nestle1904. The text is public domain and the morphology is **CC0**.
- **Variant readings:** shown inline in Bible Hub's notation:
  - {TR} Scrivener's Textus Receptus
  - ⧼RP⧽ Robinson-Pierpont Byzantine
  - (WH) Westcott-Hort
  - 〈NE〉 Nestle only
  - [NA] Nestle-Aland 27
  - ‹SBL› SBLGNT
  - `*` / `**` a Nestle word replaced by the reading NA and SBL agree on
  - « » ⇔ a word-order variant

  The readings are derived from the per-word edition tags in STEP Bible Data, dataset **TAGNT** (CC BY 4.0, attribution as above).
- **Transliteration, gloss, Strong's code, morphology:** TAGNT. Where TAGNT has no matching word:
  - glosses come from the Berean Interlinear Bible (public domain), via biblicalhumanities/Nestle1904;
  - Strong's numbers and morphology come from the Nestle 1904 data.

Where Bible Hub's interlinear presents the Greek differently from these sources, the app follows Bible Hub's presentation, except for Bible Hub's own typos. This covers:
- capitalization, spelling and accents from Bible Hub's copy of Nestle 1904
- word division and compound marks (‿ ¦)
- the variant marks and bracketed critical-edition words in about 90 verses

The words themselves remain those of the public-domain editions above.

## Display font

The ⧼ ⧽ variant brackets are drawn from `assets/fonts/interlinear-marks.woff`. This is a 2-glyph subset of Noto Sans Math by The Noto Project Authors, released under the SIL Open Font License 1.1 (see `assets/fonts/OFL-NotoSansMath.txt`).

## Rebuilding

Place the sources under `data/_sources/` (gitignored):
- `stepbible/` — the TAHOT and TAGNT files
- `berean/bsb_tables.tsv`
- `nestle1904/` — `morph/Nestle1904.csv` and `glosses/berean-interlinear-glosses.xml`

Then run `python scripts/build_interlinear_hebrew.py` and `python scripts/build_interlinear_greek.py`.
