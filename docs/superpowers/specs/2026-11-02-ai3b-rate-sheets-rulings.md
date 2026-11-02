# ai3b rate sheets: builder rulings (2026-11-02)

Rulings on the rate-sheet part of the ai3 design (`2026-11-02-release-ai3-drafts-rates-travellers-design.md`, 3.2).

- **Parts, not pages only.** A sheet is divided in code into parts that fit one read (12,000 characters or 150 lines): a tab, or row ranges of a long tab for Excel; a few pages for a PDF. A sheet in more than one part answers the first read with its parts and uses no call; each part chosen is one call, said before. After a save the dialog offers the next part.
- **Words beside a row are the sheet's own.** The model names a numbered line; code shows that line and its place (`Sheet1, row 14`, `Page 2`). The printed number must occur in that line, else "Check this one". Photo rows are always "Check this one".
- **Scans are refused.** No spike was possible without a key, so a PDF with no text asks for photos (`RATE_SHEET_SCANNED`); photos go to the model as images.
- **Dates.** The model writes season dates as printed, with a year when the sheet gives one anywhere. Code reads day-first dates with a year; anything else is blank and the person chooses it. A season with the same dates as one the supplier has is reused; one that has ended is flagged. Another overlap is refused at save (`SEASON_OVERLAPS`).
- **Tax words** found beside a price go into the note ("Printed: + GST"); the price is never changed.
- **Save.** `suppliers.saveRateBatch` takes only checked rows (`checked: true` per row; the screen opens Save only when every row to be saved is ticked). A rate changes by id only while the row is still that rate; edited into another it is new. A row the supplier has at the same price is "already there" and left out; "Leave out" drops any row.
- **Audit.** Season and rate saves carry `aiFillId`; one `ai.fill-applied` entry per reading, with which rows the person changed (by hash).
- **Migration** `20261203100000_ai_rate_sheets` also allows `quote_days` and `travellers` in `ai_fill.target`, so whichever of ai3a and ai3b is applied second keeps every value allowed. ai3a's own migration must keep `rate_sheet` in that list if it rewrites the check.
- **Excel** is read by the existing bounded, threaded reader, now able to read a chosen tab; an old `.xls` is refused with the import screen's wording.
