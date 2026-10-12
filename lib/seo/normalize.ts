// Κανονικοποίηση ελληνικού κειμένου για σύγκριση tags / queries / trends.
//
// Δύο επίπεδα κλειδιού:
//   exactKey    — πεζά, χωρίς τόνους/διαλυτικά, τελικό σ, χωρίς σημεία στίξης.
//                 «ΦΩΤΙΑ» = «Φωτιά» = «φωτιά» → σίγουρο διπλότυπο.
//   fuzzyKey    — exactKey → greeklish → «ελαφρύ» stemming ανά λέξη.
//                 «Πυρκαγιές» ≈ «Πυρκαγιά», «AEK» ≈ «ΑΕΚ», «Μητσοτάκη» ≈ «Μητσοτάκης»
//                 → πιθανό διπλότυπο (θέλει ανθρώπινο μάτι).

const GREEK_STOPWORDS = new Set(
  (
    "ο η το οι τα του της των τον την τη στο στη στην στον στα στις στους σε " +
    "και κι να θα με για απο από ως ειναι είναι εναι ενα ένα ενας ένας μια μία " +
    "που πως πώς τι ποιος ποια ποιο ποιοι ποιες ποτε πότε πού που δεν μη μην " +
    "αν ή η' οτι ότι μετα μετά πριν κατα κατά προς παρα παρά χωρις χωρίς " +
    "αυτο αυτό αυτη αυτή αυτος αυτός αυτα αυτά αυτοι αυτοί ολα όλα ολοι όλοι " +
    "εχει έχει εχουν έχουν ηταν ήταν θα πιο πολυ πολύ μονο μόνο ακομα ακόμα " +
    "σημερα σήμερα χθες αυριο αύριο τωρα τώρα νεα νέα νεο νέο νεος νέος βιντεο βίντεο video live " +
    // γενικοί όροι αναζήτησης που δεν είναι θέματα
    "ειδησεις ειδήσεις ειδηση είδηση καναλι κανάλι καναλια προγραμμα πρόγραμμα ωρα ώρα " +
    "news νεα ειδησεις online gr " +
    "εναντιον εναντίον vs live streaming επεισοδιο επεισόδιο επεισοδια επεισόδια σειρα σειρά " +
    "ιανουαριου φεβρουαριου μαρτιου απριλιου μαιου ιουνιου ιουλιου αυγουστου " +
    "σεπτεμβριου οκτωβριου νοεμβριου δεκεμβριου " +
    "the a an of in on for to and is"
  )
    .split(/\s+/)
    .map((w) => exactKey(w))
);

// Μικρή λίστα για τα «κύρια ονόματα» (εκεί το «Νέα» της «Νέας Δημοκρατίας» μετράει).
const PN_STOPWORDS = new Set(
  (
    "ο η το οι τα του της των τον την τη στο στη στην στον στα στις στους σε " +
    "και κι να θα με για απο ως ενα ενας μια που πως τι δεν μη μην αν οτι " +
    "μετα πριν κατα προς παρα χωρις αυτο αυτη αυτος αυτα αυτοι ολα"
  )
    .split(/\s+/)
    .map((w) => exactKey(w))
);

/** πεζά, χωρίς τόνους/διαλυτικά, ς→σ, μόνο γράμματα/ψηφία/κενά */
export function exactKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const DIGRAPHS: [RegExp, string][] = [
  [/ου/g, "u"],
  [/μπ/g, "b"],
  [/ντ/g, "d"],
  [/γκ/g, "g"],
  [/γγ/g, "g"],
  [/αι/g, "e"],
  [/ει/g, "i"],
  [/οι/g, "i"],
  [/αυ/g, "av"],
  [/ευ/g, "ev"],
];

const GR2LAT: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "ks", ο: "o", π: "p", ρ: "r", σ: "s",
  τ: "t", υ: "i", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

/** Φωνητική λατινική μορφή — ενώνει ελληνικά με greeklish/λατινικά. */
export function phonetic(s: string): string {
  let t = exactKey(s);
  for (const [re, rep] of DIGRAPHS) t = t.replace(re, rep);
  t = t.replace(/[α-ω]/g, (c) => GR2LAT[c] ?? c);
  // greeklish παραλλαγές προς κοινή μορφή
  t = t
    .replace(/ou/g, "u")
    .replace(/y/g, "i")
    .replace(/w/g, "o")
    .replace(/x/g, "ch") // greeklish: x = χ
    .replace(/(?<![ctp])h/g, "ch") // greeklish: h = χ (όχι στα th/ch/ph)
    .replace(/ph/g, "f")
    .replace(/nd|nt/g, "d") // mundial ≈ μουντιάλ, slug «ntonalnt» ≈ «Ντόναλντ»
    .replace(/mb|mp/g, "b")
    .replace(/n[gk]/g, "g")
    .replace(/(ai|ei|oi)/g, (m) => (m === "ai" ? "e" : "i"))
    .replace(/([a-z])\1+/g, "$1"); // διπλά σύμφωνα (λλ→λ)
  return t;
}

// Καταλήξεις από τη μεγαλύτερη στη μικρότερη (σε φωνητική μορφή).
const SUFFIXES = ["ion", "es", "os", "is", "as", "us", "on", "a", "i", "o", "e", "s"];

/** Ελαφρύ stemming μίας (φωνητικής) λέξης. */
function stemWord(w: string): string {
  if (w.length <= 4 || /^\d+$/.test(w)) return w;
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

export function fuzzyKey(s: string): string {
  return phonetic(s)
    .split(" ")
    .filter(Boolean)
    .map(stemWord)
    .join(" ");
}

/** Λέξεις (exactKey) χωρίς stopwords */
export function contentWords(s: string): string[] {
  return exactKey(s)
    .split(" ")
    .filter((w) => w.length > 1 && !GREEK_STOPWORDS.has(w));
}

export function isStopword(w: string): boolean {
  return GREEK_STOPWORDS.has(exactKey(w));
}

/** Fuzzy tokens ενός κειμένου (για phrase matching με stemming). */
export function fuzzyTokens(s: string): string[] {
  return fuzzyKey(s).split(" ").filter(Boolean);
}

/** Βρίσκει αν η φράση `needle` (σε fuzzy tokens) υπάρχει μέσα στο `hay`. */
export function containsPhrase(hay: string[], needle: string[]): number {
  if (!needle.length || needle.length > hay.length) return 0;
  let hits = 0;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    hits++;
  }
  return hits;
}

/**
 * n-grams (1..maxN) από ένα query, χωρίς n-grams που αρχίζουν/τελειώνουν σε
 * stopword. `key` = exactKey (για ομαδοποίηση), `surface` = όπως γράφτηκε
 * (πεζά, με τόνους αν υπήρχαν) για εμφάνιση.
 */
export function ngrams(s: string, maxN = 3): { key: string; surface: string }[] {
  const surf = s
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const keys = surf.map((w) => exactKey(w));
  const out: { key: string; surface: string }[] = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= keys.length; i++) {
      const g = keys.slice(i, i + n);
      if (!g[0] || !g[g.length - 1]) continue;
      if (GREEK_STOPWORDS.has(g[0]) || GREEK_STOPWORDS.has(g[g.length - 1])) continue;
      if (n === 1 && (g[0].length < 3 || /^\d+$/.test(g[0]))) continue;
      out.push({ key: g.join(" "), surface: surf.slice(i, i + n).join(" ") });
    }
  }
  return out;
}

/** Πόσους τόνους/διαλυτικά έχει (για να διαλέγουμε την «σωστή» γραφή). */
export function accentScore(s: string): number {
  return (s.normalize("NFD").match(/[\u0300-\u036f]/g) ?? []).length;
}

/**
 * Υποψήφια «οντότητες» από κείμενο άρθρου: διαδοχικές λέξεις με κεφαλαίο
 * πρώτο γράμμα (όχι στην αρχή πρότασης), ή ακρωνύμια (ΝΑΤΟ, ΕΛΓΑ).
 */
export function properNounPhrases(text: string): string[] {
  const out = new Map<string, number>();
  const sentences = text.split(/[.!;?…\n«»"“”:]+/);
  for (const sent of sentences) {
    const words = sent.trim().split(/\s+/).filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      if (run.length) {
        const phrase = run.join(" ").replace(/[,()[\]]/g, "").trim();
        if (phrase.length > 2 && !PN_STOPWORDS.has(exactKey(phrase))) {
          out.set(phrase, (out.get(phrase) ?? 0) + 1);
        }
      }
      run = [];
    };
    words.forEach((raw, idx) => {
      const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const isAcronym = w.length >= 2 && w === w.toUpperCase() && /\p{Lu}/u.test(w);
      const isCap = /^\p{Lu}\p{Ll}/u.test(w);
      const ok = (isAcronym || (isCap && idx > 0)) && !PN_STOPWORDS.has(exactKey(w));
      if (ok) run.push(w);
      else flush();
      if (/[,()]$/.test(raw)) flush();
    });
    flush();
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** Μορφή εμφάνισης για προτεινόμενο νέο tag: Title Case (όχι ΚΕΦΑΛΑΙΑ). */
export function displayCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) =>
      w.length <= 6 && w === w.toLocaleUpperCase("el") && /\p{Lu}/u.test(w)
        ? w // ακρωνύμιο (ΝΑΤΟ, ΑΕΚ)
        : w.charAt(0).toLocaleUpperCase("el") + w.slice(1).toLocaleLowerCase("el")
    )
    .join(" ")
    .replace(/σ(?=\s|$)/g, "ς");
}
