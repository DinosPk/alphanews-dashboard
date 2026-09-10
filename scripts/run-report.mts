// Τρέχει την πλήρη ημερήσια αναφορά τοπικά και γράφει ΚΑΝΟΝΙΚΑ στο Google
// Sheet — χρήσιμο για την πρώτη δοκιμή και για να γεμίσουμε παλιές ημέρες.
//
//   npm run report               → χθες
//   npm run report 2026-09-08    → συγκεκριμένη ημέρα

import { runAuthorCountsReport } from "../lib/authorReport";
import { formatGreekDate } from "../lib/time";

const day = process.argv[2];
const result = await runAuthorCountsReport(day);

console.log(`Ημέρα: ${formatGreekDate(result.day)}`);
console.log(`Σύνολο άρθρων: ${result.totalArticles}`);
console.log(`Συντάκτες: ${result.authors.length}`);
console.log(`Sheet: ${result.spreadsheetUrl}`);
