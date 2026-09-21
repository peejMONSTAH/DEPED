/**
 * Self-hosted webfonts.
 *
 * These families used to be pulled from fonts.googleapis.com at runtime, via a
 * <link> in index.html and an @import at the top of index.css. That meant the
 * whole typography of Digital 201 depended on reaching Google: on a filtered
 * DepEd division network, or offline, every screen silently fell back to the
 * default system font. It also put a third-party request on every page load.
 *
 * Serving them from our own origin removes both problems, and drops the two
 * render-blocking round trips to Google that used to sit in front of first paint.
 *
 * Only the latin subset is imported, and only the weights the stylesheet
 * actually asks for. Plus Jakarta Sans is published up to 800 - the old
 * stylesheet requested 900, which Google clamped to 800 anyway, so nothing
 * changes visually.
 */

// Plus Jakarta Sans - primary UI family (--font-sans)
import '@fontsource/plus-jakarta-sans/latin-300.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';

// Inter - secondary sans, and the fallback inside --font-sans
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-900.css';

// JetBrains Mono - reference numbers, IDs, monospaced data (--font-mono)
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
