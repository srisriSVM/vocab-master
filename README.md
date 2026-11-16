# Vocabulary Master ✦

A free, private, Quizlet-style vocabulary study app for school words. Hosted as a static site on GitHub Pages; no database, login, or API key needed.

## Features

- Word lists organized by unit/week, with **word**, **part of speech**, **definition**, and **example sentence**
- Create empty word lists (Unit 2, Level 3, etc.); edit, delete, and manually add words
- Bulk paste or import **.txt / .csv** vocabulary files, with preview and duplicate detection
- Flashcards with **I remembered / Still learning** progress tracking
- Multiple-choice practice (word → definition and definition → word)
- Spelling practice and **fill-in-the-blank context questions** using two additional sentences for every school vocabulary word
- Test Mode with **Mixed**, **Fill in the blanks only**, or **Multiple choice only**
- Optional **word suggestions when typing** (starts after 2 letters; shows at most 5 words from the selected list). Turn suggestions off for a harder test.
- Per-word learning levels, review scheduling, test history, and progress dashboard
- Automatic saving to the browser's **localStorage**
- **Download JSON backup** and **Restore JSON backup**

## Deploy on GitHub Pages

The repository includes a GitHub Actions workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. If the deployment has not started, open **Actions → Deploy vocabulary app to GitHub Pages → Run workflow**.
4. Visit **https://srisriSVM.github.io/vocab-master/** once the deployment reports success.

The website is plain HTML, CSS, and JavaScript. It does not require Node, npm, React, or any build step. GitHub Pages serves the committed files.

## Starter vocabulary

The current 32 school vocabulary words are in [`data/vocabulary.json`](data/vocabulary.json), based on a photographed school vocabulary notebook. Each school word includes its notebook example and two different context sentences. The app uses the fresh examples for fill-in-the-blank tests, rather than repeating the notebook sentence.

To add a new photographed list later, send the photo to ChatGPT and request an **append to `data/vocabulary.json`**. When that file changes, the app merges newly added seed words into existing browser data upon page reload, without wiping progress. Locally edited or locally deleted starter words are respected on that device.

### Text import

Choose **My word lists → Create word list** to make an empty unit first, or choose **Import words** to add vocabulary in bulk. Then paste or upload a file with one entry per line. Supported formats:

```text
Dour | Adjective | Severe; gloomy | The garbage collector was dour.
Eschew | To avoid or shun
Conundrum | Noun | A difficult puzzle | We faced a conundrum.
```

Tab-separated fields and basic CSV files are also supported. In the two-column format, the part of speech is set to "Other". Preview the detected words before importing.

You can create separate word lists such as "Week 1", "Unit 2", or "School Test".

## How progress works

Each word tracks its total correct and incorrect answers, learning level (0–5), and next review date. Correct answers advance the review level with intervals of 1, 3, 7, 14, and 30 days; missed answers lower the level and make the word due again. A word counts as **mastered at level 3**. Flashcard self-assessments and practice/test answers all update progress.

The app saves every word edit and every answer to this browser.

### Testing school vocabulary

Open **Test Mode** after choosing a word list at the top. Select:

- **Mixed test** for definitions, word choices, spelling and sentence blanks.
- **Fill in the blanks only** for a test with ten missing-word questions. The original school words have alternative sentences specifically written for this.
- **Multiple choice only** when you want no typed answers.

You can keep **Show word suggestions while typing** on to make typing easier. Suggestions appear only after at least two characters, include no more than five prefix matches, and are taken from the currently selected word list. Use the arrow keys and Enter or tap a suggestion, then select **Check answer**. Turn off the toggle for strict recall practice. The test remembers the selected question type and suggestion setting when you choose **Practice again**. In Quick Practice, spelling and sentence blanks also offer suggestions.

This does not require an AI API or external service. It does **not** synchronize devices automatically. Use **My word lists → Backup / restore** to download one JSON containing words, learning history, and progress. Upload it to a **private** GitHub repository if desired, or move it between devices and restore it.

**Privacy note:** `data/vocabulary.json` is public because this GitHub Pages repository is public. Keep private names, personal details, and learning progress out of that file. Your local progress and manually entered words are not automatically committed to GitHub.

## Developer notes

- Main app: [`app.js`](app.js)
- Styling: [`styles.css`](styles.css)
- Starter data: [`data/vocabulary.json`](data/vocabulary.json)
- GitHub Pages deployment: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

There are no external JavaScript dependencies. Fonts load from Google Fonts if available and fall back to system fonts. To work on the site locally, serve the folder with a small static web server, for example `python3 -m http.server 8000`. Opening `index.html` directly as `file://` may prevent the JSON fetch from working.

## Limitations

- Browser data can be lost if website storage is cleared or the browser evicts it. Download periodic backups.
- Quiz questions are generated from the supplied word definitions; no AI service or paid API is used.
- A complete GitHub commit from within the learner's browser is not supported, intentionally: no GitHub token or private API credential is stored in public JavaScript.

## Validation

Every GitHub Pages deployment first runs the dependency-free smoke test: `node tests/smoke.cjs`.
