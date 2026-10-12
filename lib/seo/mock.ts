// DEMO δεδομένα για το SEO Tags module — χρησιμοποιούνται ΜΟΝΟ όταν το
// WordPress API δεν απαντά (π.χ. τοπικά πίσω από firewall). Δεν ανακατεύονται
// ποτέ με πραγματικά δεδομένα.

import type { WpTag, TrendItem } from "./types";
import type { GscRow } from "./gsc";

const T = (id: number, name: string, slug: string, count: number): WpTag => ({
  id,
  name,
  slug,
  count,
  path: `/tag/${slug}/`,
});

export const MOCK_TAGS: WpTag[] = [
  T(394, "Lifestyle", "lifestyle", 203),
  T(145, "ΦΩΤΙΑ", "fotia", 114),
  T(146, "Φωτιά", "fotia-2", 37),
  T(147, "Πυρκαγιά", "pyrkagia", 52),
  T(148, "Πυρκαγιές", "pyrkagies", 9),
  T(197, "ΕΛΛΗΝΙΚΗ ΑΣΤΥΝΟΜΙΑ", "elliniki-astinomia", 99),
  T(393, "ΜΟΥΝΤΙΑΛ 2026", "mountial-2026", 97),
  T(395, "Mundial 2026", "mundial-2026", 4),
  T(398, "Εθνική Ελλάδας", "ethniki-elladas", 81),
  T(399, "Εθνική ομάδα", "ethniki-omada", 12),
  T(400, "Κυριάκος Μητσοτάκης", "kyriakos-mitsotakis", 88),
  T(401, "Μητσοτάκης", "mitsotakis", 26),
  T(402, "Μητσοτάκη", "mitsotaki", 2),
  T(410, "Ντόναλντ Τραμπ", "ntonalnt-trab", 64),
  T(411, "Τραμπ", "trab", 21),
  T(412, "Trump", "trump", 3),
  T(420, "Κακοκαιρία", "kakokairia", 71),
  T(421, "κακοκαιρία", "kakokairia-2", 5),
  T(430, "Σεισμός", "seismos", 45),
  T(431, "Σεισμοί", "seismoi", 6),
  T(440, "ΑΕΚ", "aek", 60),
  T(441, "AEK", "aek-2", 3),
  T(442, "ΠΑΟΚ", "paok", 48),
  T(443, "Ολυμπιακός", "olympiakos", 51),
  T(444, "Παναθηναϊκός", "panathinaikos", 47),
  T(450, "Αντώνης Σαμαράς", "antonis-samaras", 19),
  T(451, "Σαμαράς", "samaras", 7),
  T(460, "ΝΑΤΟ", "nato", 12),
  T(461, "Ρωσία", "rosia", 58),
  T(462, "Ουκρανία", "oukrania", 61),
  T(470, "Κρήτη", "kriti", 55),
  T(471, "Ηράκλειο", "irakleio", 14),
  T(472, "Λασίθι", "lasithi", 3),
  T(480, "ΕΛΓΑ", "elga", 8),
  T(481, "Ακρίβεια", "akriveia", 33),
  T(482, "Ενοίκια", "enoikia", 1),
  T(490, "Τροχαίο", "trochaio", 29),
  T(491, "Τροχαία", "trochaia", 4),
  T(500, "Γιορτή μήλου Ζαγοράς", "giorti-milou-zagoras", 1),
  T(501, "Ξενοδοχεία Μυκόνου", "xenodocheia-mykonou", 1),
  T(502, "Μετεωρολόγοι", "meteorologoi", 0),
  T(503, "Πυροσβεστική", "pyrosvestiki", 24),
];

const Q = (key: string, impressions: number, clicks: number, position = 8): GscRow => ({
  key,
  impressions,
  clicks,
  position,
});

export const MOCK_QUERIES: GscRow[] = [
  Q("φωτια τωρα", 48000, 2100, 6.2),
  Q("φωτιά σήμερα", 31000, 1300, 7.1),
  Q("πυρκαγια αττικη", 12000, 420, 9.4),
  Q("σεισμος τωρα", 52000, 1900, 8.8),
  Q("σεισμός κρήτη", 9100, 380, 7.5),
  Q("καιρος αυριο", 66000, 900, 14.1),
  Q("καιρός κολυδάς", 22000, 610, 10.2),
  Q("καιρος μαρουσακης", 18000, 480, 11.3),
  Q("κακοκαιρια", 15000, 700, 6.4),
  Q("ειδησεις τωρα", 27000, 820, 12.5),
  Q("μουντιαλ 2026", 41000, 1500, 5.2),
  Q("εθνικη ελλαδας προγραμμα", 14000, 900, 4.9),
  Q("εθνικη ελλαδας κανάλι", 9800, 1200, 3.1),
  Q("παοκ καλαματα καναλι", 7600, 300, 8.3),
  Q("αεκ παοκ", 12000, 260, 11.9),
  Q("ολυμπιακος", 9000, 120, 18.2),
  Q("μητσοτακης", 11000, 210, 9.9),
  Q("σαμαρας κομμα", 16000, 640, 6.6),
  Q("σαμαρας νεο κομμα ονομα", 6800, 300, 5.8),
  Q("καμμενος σαμαρας", 4200, 160, 7.4),
  Q("τραμπ", 13000, 180, 12.6),
  Q("τραμπ δασμοι", 5200, 140, 8.4),
  Q("νατο ρωσια", 6100, 150, 9.1),
  Q("ελγα αποζημιωσεις", 8800, 610, 4.4),
  Q("ελγα δηλωσεις ζημιων", 5100, 420, 3.9),
  Q("επιδομα θερμανσης 2026", 24000, 1100, 6.0),
  Q("επιδομα θερμανσης αιτηση", 17000, 980, 5.5),
  Q("συνταξεις νοεμβριου 2026", 21000, 1250, 5.1),
  Q("πληρωμες συνταξεων", 9900, 520, 6.7),
  Q("ακριβεια σουπερ μαρκετ", 4300, 120, 10.4),
  Q("ενοικια", 3900, 60, 16.0),
  Q("τροχαιο σημερα", 8700, 330, 7.8),
  Q("τροχαιο καρδιτσα", 3100, 140, 6.9),
  Q("ηρακλειο δομη μεταναστων", 2600, 110, 7.2),
  Q("τυφωνας σαιμον", 7400, 260, 8.1),
  Q("τροπικος κυκλωνας", 3600, 90, 9.7),
  Q("πυροσβεστικη τωρα", 6600, 240, 7.3),
  Q("15 οκτωβριου αργια", 9200, 180, 9.0),
  Q("alpha news", 38000, 9800, 1.4),
  Q("alphatv live", 61000, 21000, 1.1),
];

const now = new Date();
const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toUTCString();

export const MOCK_TRENDS: TrendItem[] = [
  { title: "αντώνης σαμαράς", traffic: "500+", trafficNum: 500, pubDate: minsAgo(20), news: [] },
  { title: "ηράκλειο", traffic: "500+", trafficNum: 500, pubDate: minsAgo(35), news: [] },
  { title: "νατο", traffic: "500+", trafficNum: 500, pubDate: minsAgo(50), news: [] },
  { title: "15 οκτωβρίου", traffic: "500+", trafficNum: 500, pubDate: minsAgo(75), news: [] },
  { title: "παοκ καλαματα καναλι", traffic: "200+", trafficNum: 200, pubDate: minsAgo(10), news: [] },
  { title: "πάνος καμμένος", traffic: "200+", trafficNum: 200, pubDate: minsAgo(30), news: [] },
  { title: "καρδίτσα", traffic: "200+", trafficNum: 200, pubDate: minsAgo(55), news: [] },
  { title: "πυροσβεστική", traffic: "200+", trafficNum: 200, pubDate: minsAgo(90), news: [] },
  { title: "τροπικός κυκλώνας", traffic: "100+", trafficNum: 100, pubDate: minsAgo(60), news: [] },
];
