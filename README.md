# alphanews · Newsroom Dashboard

Dashboard για τον αρχισυντάκτη του **alphanews**, με δεδομένα από το **Google Analytics 4 (GA4)**:

- **Real-time** (αυτή τη στιγμή): ενεργοί χρήστες, top άρθρα που διαβάζονται τώρα, κατανομή ανά συσκευή & χώρα, sparkline τελευταίων 30′.
- **🔥 Ειδοποίηση «απογείωσης»**: όταν ένα άρθρο ανεβαίνει απότομα ανάμεσα σε δύο ανανεώσεις, εμφανίζεται banner + badge (🔥 +N) δίπλα στο άρθρο. Έτσι ο αρχισυντάκτης πιάνει αμέσως ποιο θέμα «τραβάει».
- **Ιστορικά** με σύγκριση περιόδου: **24ωρο / Εβδομάδα / Μήνας** — προβολές, χρήστες, συνεδρίες, μέση διάρκεια, engagement, γράφημα τάσης, top άρθρα, πηγές επισκεψιμότητας.
- **Φίλτρο ανά ενότητα** (Πολιτική / Αθλητικά / Οικονομία …): όλα τα ιστορικά στοιχεία φιλτράρονται στην επιλεγμένη ενότητα.

> 💡 Τρέχει αμέσως σε **DEMO mode** (ψεύτικα δεδομένα) χωρίς καμία ρύθμιση. Μόλις βάλεις τα GA4 credentials, κουμπώνει αυτόματα στα πραγματικά δεδομένα.

### Scope: μόνο alphanews

Το dashboard μετράει **μόνο ειδήσεις** — όχι σειρές/live/ψυχαγωγία. Εφαρμόζεται καθολικό φίλτρο σε όλα τα ειδησεογραφικά paths (`NEWS_PATHS` στο `lib/sections.ts`: `/koinonia/`, `/politika/`, `/kosmos/`, `/ugeia/`, `/oikonomia/`, `/athlitika/`, `/politismos/`, `/tech/`, `/video-moments/`, `/newscast/alpha-news`, `/news/`).

**Σημείωση real-time:** το GA4 Realtime API δεν φιλτράρει κατά ενότητα. Γι' αυτό:
- Ο αριθμός **«ενεργοί χρήστες τώρα»** είναι όλου του alphatv.gr (με σαφή σήμανση).
- Το **«Top ειδήσεις σήμερα»** προέρχεται από το standard Data API (φιλτραρισμένο κατά path → 100% ειδήσεις, ανανεώνεται σε κάθε refresh).
- Αν εξαντληθεί προσωρινά το realtime quota, το headline δείχνει «—» αλλά οι ειδήσεις ενημερώνονται κανονικά.

---

## 1. Τρέξιμο τοπικά

```bash
npm install
npm run dev
```

Άνοιξε το <http://localhost:3000>. Χωρίς credentials θα δεις το **DEMO** (το badge «DEMO — χωρίς σύνδεση GA4» πάνω δεξιά).

Για production build τοπικά:

```bash
npm run build
npm run start
```

---

## 2. Σύνδεση με το πραγματικό GA4 (μία φορά)

Χρειάζεσαι δύο πράγματα: το **Property ID** και ένα **service account** (δωρεάν λογαριασμός «ρομπότ» που διαβάζει το GA4).

### 2α. Βρες το GA4 Property ID

1. Μπες στο [analytics.google.com](https://analytics.google.com) με τον λογαριασμό που έχει το alphanews.
2. **Admin** (κάτω αριστερά, γρανάζι) → στήλη **Property** → **Property details** (ή Property Settings).
3. Πάνω δεξιά υπάρχει το **Property ID** — ένας αριθμός π.χ. `123456789`. Σημείωσέ τον.

### 2β. Φτιάξε service account στο Google Cloud (δωρεάν)

1. Πήγαινε στο [console.cloud.google.com](https://console.cloud.google.com).
2. Φτιάξε (ή διάλεξε) ένα **project** πάνω αριστερά (π.χ. «alphanews-dashboard»).
3. Ενεργοποίησε το API: αναζήτησε **«Google Analytics Data API»** → **Enable**.
4. Αριστερό μενού → **APIs & Services → Credentials** → **Create Credentials → Service account**.
   - Όνομα: π.χ. `alphanews-dashboard`. → **Create and continue** → **Done** (ρόλους δεν χρειάζεται).
5. Κλικ στο service account που μόλις έφτιαξες → καρτέλα **Keys** → **Add key → Create new key → JSON** → κατεβαίνει ένα αρχείο `.json`. **Φύλαξέ το — δεν ξανακατεβαίνει.**
6. Άνοιξε το JSON και σημείωσε δύο πεδία: `client_email` (π.χ. `...@...iam.gserviceaccount.com`) και `private_key`.

### 2γ. Δώσε στο service account πρόσβαση στο GA4

1. Πίσω στο [analytics.google.com](https://analytics.google.com) → **Admin** → **Property** → **Property Access Management**.
2. **+** (πάνω δεξιά) → **Add users**.
3. Βάλε το **`client_email`** του service account, ρόλος **Viewer** (Αναγνώστης) — αρκεί. → **Add**.

### 2δ. Βάλε τα στοιχεία στο `.env.local`

Αντίγραψε το `.env.local.example` σε `.env.local` και συμπλήρωσε:

```env
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=alphanews-dashboard@your-project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...πολλούς χαρακτήρες...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ Το `private_key` μπαίνει σε **μία γραμμή**, μέσα σε διπλά εισαγωγικά, κρατώντας τα `\n` όπως ακριβώς είναι στο JSON.

Κάνε restart (`npm run dev`). Το badge «DEMO» εξαφανίζεται → βλέπεις πραγματικά δεδομένα.

---

## 3. Δωρεάν deploy στο Vercel (για να το βλέπει η ομάδα)

1. Φτιάξε λογαριασμό στο [vercel.com](https://vercel.com) (Hobby plan = δωρεάν).
2. Ανέβασε τον κώδικα σε ένα **private GitHub repo** (μην ανεβάσεις ποτέ το `.env.local` ή το JSON — τα μπλοκάρει ήδη το `.gitignore`).
3. Στο Vercel: **Add New → Project → Import** το repo. Framework: **Next.js** (αναγνωρίζεται αυτόματα).
4. Πριν το deploy, **Environment Variables** → πρόσθεσε τις **4 μεταβλητές OAuth** (όπως στο `.env.local`):
   `GA4_PROPERTY_ID`, `GA4_OAUTH_CLIENT_ID`, `GA4_OAUTH_CLIENT_SECRET`, `GA4_OAUTH_REFRESH_TOKEN`.
5. **Deploy**. Σε ~1 λεπτό παίρνεις ένα URL τύπου `https://alphanews-dashboard.vercel.app`.

> Η σύνδεση γίνεται με **OAuth** (ο λογαριασμός Google που έχει πρόσβαση στο GA4), όχι service account. Το refresh token παράγεται με `node get-oauth-token.mjs <client_id> <client_secret>` και ισχύει εφόσον το OAuth app είναι σε κατάσταση **In production**.

### Προστασία πρόσβασης (προαιρετικό αλλά συνιστάται)

Για να μην είναι δημόσιο το URL: στο Vercel → **Settings → Deployment Protection → Vercel Authentication** (απαιτεί login με τον οργανισμό σου), ή βάλε ένα απλό password protection.

---

## Πώς δουλεύει (αρχιτεκτονική)

```
Browser (React)  ──fetch──►  /api/realtime   ─┐
                 ──fetch──►  /api/historical ─┤──►  lib/ga4.ts  ──►  GA4 Data API
                                               │         │
                                               │         └─ αν λείπουν credentials ή σφάλμα ► lib/mock.ts (demo)
```

- Το **real-time** ανανεώνεται αυτόματα κάθε **15 δευτερόλεπτα**.
- Τα **ιστορικά** φορτώνουν όποτε αλλάζεις περίοδο (24ωρο/Εβδομάδα/Μήνας).
- Τα credentials μένουν **μόνο στο backend** (serverless) — ποτέ δεν φτάνουν στον browser.

### Δομή αρχείων

| Αρχείο | Ρόλος |
|---|---|
| `app/page.tsx` | Το UI του dashboard |
| `app/api/realtime/route.ts` | Endpoint real-time |
| `app/api/historical/route.ts` | Endpoint ιστορικών (`?range=24h\|7d\|30d`) |
| `lib/ga4.ts` | Κλήσεις στο GA4 Data API + mapping |
| `lib/mock.ts` | Demo δεδομένα (fallback) |
| `lib/types.ts` | Κοινοί τύποι |
| `components/TrendChart.tsx` | Γράφημα τάσης (Recharts) |
| `components/Sparkline.tsx` | Sparkline real-time |

---

## Σημειώσεις & περιορισμοί GA4

- Στο **real-time** το GA4 δεν δίνει «πηγή επισκεψιμότητας» — γι' αυτό οι πηγές εμφανίζονται μόνο στα ιστορικά. Στο real-time δείχνουμε συσκευή & χώρα.
- Το real-time καλύπτει τα **τελευταία 30 λεπτά** (όριο του GA4).
- Τα «Top άρθρα τώρα» βασίζονται στον τίτλο σελίδας (`unifiedScreenName`).
- Τα ιστορικά νούμερα της «σημερινής» ημέρας είναι ακόμη ανοιχτά (δεν έχουν κλείσει 24ωρο) — φυσιολογικό.

## ⚙️ Ρύθμιση ενοτήτων (σημαντικό για το φίλτρο)

Το φίλτρο ενότητας βασίζεται στη δομή των URL του alphatv.gr. Οι κατηγορίες είναι
ήδη ρυθμισμένες στο `lib/sections.ts` (Κοινωνία `/koinonia/`, Πολιτική
`/politika/`, Κόσμος `/kosmos/`, Υγεία `/ugeia/`, Οικονομία `/oikonomia/`,
Αθλητικά `/athlitika/`, Πολιτισμός `/politismos/`, Τεχνολογία `/tech/`, Video
Moments `/video-moments/`, Δελτία ειδήσεων `/newscast/alpha-news`). Αν προστεθεί
νέα κατηγορία, πρόσθεσε μια γραμμή με το αντίστοιχο slug.

> Πού το βρίσκεις: GA4 → **Reports → Engagement → Pages and screens** → κοίτα τη
> στήλη **Page path** για να δεις τα πραγματικά slugs ανά κατηγορία.

Στο **DEMO mode** το φίλτρο δουλεύει ενδεικτικά (μειώνει τα νούμερα ανά ενότητα).
Με πραγματικά δεδομένα GA4 φιλτράρει σωστά βάσει `pagePath`.

> ℹ️ Η ειδοποίηση «απογείωσης» συγκρίνει τους ενεργούς αναγνώστες κάθε άρθρου σε
> δύο διαδοχικές ανανεώσεις (κάθε 15″). Το κατώφλι (π.χ. +20 αναγνώστες) ρυθμίζεται
> στο `app/page.tsx` (μεταβλητή `hot`).

## Ιδέες για επέκταση

- Auto-refresh και στα ιστορικά (π.χ. κάθε 5′).
- Push/email ειδοποίηση όταν ένα άρθρο «απογειώνεται» (πέρα από το on-screen banner).
- Σύγκριση με YouTube (μέσω YouTube Analytics API) στο ίδιο dashboard.
- Εξαγωγή ημερήσιας αναφοράς (PDF/email) με τα top άρθρα.
