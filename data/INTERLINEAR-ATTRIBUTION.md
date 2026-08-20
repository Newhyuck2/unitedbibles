# Interlinear original-language data

`interlinear-stepbible.db` is an offline SQLite database of the Hebrew/Aramaic Old Testament and Greek New Testament word-level interlinear data.

For every token it preserves the original spelling (including attached punctuation), transliteration, English gloss, Strong's/extended Strong's code, morphology, and the upstream contextual fields. `verses` retains the upstream punctuated verse line.

Source: [STEP Bible Data](https://github.com/STEPBible/STEPBible-Data), datasets **TAHOT** and **TAGNT**, revision recorded inside the database.

License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution required: **STEP Bible (www.STEPBible.org), based on work at Tyndale House, Cambridge.**

Rebuild with `python scripts/import_interlinear_stepbible.py` after cloning the upstream source into `data/_sources/stepbible`.
