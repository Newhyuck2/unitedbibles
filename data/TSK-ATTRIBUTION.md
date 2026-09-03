# Treasury of Scripture Knowledge

`treasury-of-scripture-knowledge.db` contains the classic **Treasury of Scripture Knowledge (TSK)** reference table. Each entry connects a KJV word or phrase anchor to its semicolon-separated target passages.

Source table: [`narthur/tsk-cli`](https://github.com/narthur/tsk-cli), distributed as a developer-oriented `tskxref.txt` table. The classic CrossWire TSK module is listed as **Public Domain**.

The database retains the raw target-reference notation from the source. It does not include the copyrighted *New Treasury of Scripture Knowledge* or other enhanced commercial editions.

Rebuild with `python scripts/import_tsk.py`.
