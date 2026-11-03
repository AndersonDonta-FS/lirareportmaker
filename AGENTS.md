<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- The LIRA PDF is built entirely in the browser with pdf-lib (`src/lib/lira/pdf/build.ts`); nothing about a report is stored server-side, because the user only wants fill-out-and-download.
- Report finding rules (XRF positive, calibration exclusion, dust hazard, wording counts) live only in `src/lib/lira/rules.ts` and are covered by `rules.test.ts`; the PDF and UI must call these instead of re-deriving.
- Fixed artwork comes from `public/lira/`: `letterhead.pdf` (blank letterhead stripped from the user's sample) and `fixed-pages.pdf` (PCS, certifications, glossary, resources with page numbers removed); regenerate them from a new sample rather than redrawing, so they stay pixel-identical.
- Fonts in `public/lira/fonts` are pre-subset with pyftsubset and embedded with pdf-lib WITHOUT `subset: true`, because pdf-lib's runtime subsetting drops glyphs.
- Lab-report reading is the only server code: `src/lib/lira/lab.functions.ts` sends the PDF to the AI Gateway (Responses surface, strict JSON schema) and returns editable rows; failures fall back to manual entry.
