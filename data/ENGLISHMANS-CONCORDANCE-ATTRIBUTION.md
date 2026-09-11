# Englishman's-style concordance — attribution and scope

`englishmans-concordance.db` is an offline index that groups KJV English tagged
words and phrases by Strong's number, then adds the corresponding original-language
lemma data. It provides the practical lookup function of an Englishman's
concordance: original lemma → every tagged KJV occurrence → verse reference.

It is **not** a transcription of George V. Wigram's historical *Englishman's
Greek Concordance* or *Englishman's Hebrew and Chaldee Concordance*. Those classic
books are public domain, but their editorial order, headings, and printed text are
separate works.

## Sources

- KJV word/phrase tags and morphology: CrossWire KJV Strong/Morphology OSIS module
  (`kjv-osis-2013010915.zip`), obtained from
  <https://www.crosswire.org/~dmsmith/kjv2011/>. Keep CrossWire attribution when
  redistributing this generated index.
- Lemma, transliteration, definition, and KJV-rendering metadata: Open Scriptures'
  Strong's JSON digitisation, <https://github.com/openscriptures/strongs>. Its
  digitisation is CC BY-SA; retain attribution and share-alike terms for derivative
  data.

The King James Version itself is public domain. This database is generated from the
two local source databases by `scripts/build_englishmans_concordance.py`.
