// Διαγνωστικό: ελέγχει ότι το WP REST API του alphatv.gr απαντάει και δείχνει
// τι βρήκε για μια συγκεκριμένη ημέρα — χωρίς να αγγίξει καθόλου το Sheet.
//
//   npm run cms:probe              → χθες
//   npm run cms:probe 2026-09-08   → συγκεκριμένη ημέρα

import { countByAuthor, getArticlesForAthensDay } from "../lib/cms";
import { athensYesterday, formatGreekDate } from "../lib/time";

const day = process.argv[2] ?? athensYesterday();

const base = process.env.CMS_BASE_URL || "https://www.alphatv.gr";
console.log(`CMS: ${base}`);
console.log(`Ημέρα: ${formatGreekDate(day)} (00:00–23:59 ώρα Ελλάδας)\n`);

const articles = await getArticlesForAthensDay(day);
const counts = countByAuthor(articles);

console.log(`Σύνολο άρθρων: ${articles.length}`);
console.log(`Συντάκτες: ${counts.length}\n`);

const width = Math.max(10, ...counts.map((c) => c.authorName.length));
for (const { authorName, count } of counts) {
  console.log(`${authorName.padEnd(width)}  ${String(count).padStart(4)}`);
}

if (articles.length > 0) {
  console.log("\nΔείγμα (πρώτα 5 άρθρα):");
  for (const a of articles.slice(0, 5)) {
    console.log(`  ${a.publishedAtAthens}  ${a.authorName}  —  ${a.title}`);
    console.log(`         ${a.url}`);
  }
}

if (counts.some((c) => c.authorName.startsWith("Άγνωστος συντάκτης"))) {
  console.log(
    "\n⚠️  Κάποια άρθρα δεν έχουν όνομα συντάκτη — το /wp-json/wp/v2/users " +
      "μάλλον είναι κλειστό. Βάλε CMS_WP_USER + CMS_WP_APP_PASSWORD στο .env.local."
  );
}
