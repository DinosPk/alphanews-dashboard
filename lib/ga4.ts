diff --git a/lib/ga4.ts b/lib/ga4.ts
index 62086af..70bfedb 100644
--- a/lib/ga4.ts
+++ b/lib/ga4.ts
@@ -142,25 +142,18 @@ export async function getRealtime(): Promise<RealtimeData> {
         metrics: [{ name: "activeUsers" }],
         dimensionFilter: newsScope,
       }),
-      // Χώρες σήμερα — εξαιρώντας bots (μέση διάρκεια < 10s = data-center traffic)
+      // Χώρες σήμερα. ΠΡΟΣΟΧΗ: μην βάζεις metricFilter σε αυτό το report.
+      // Το metricFilter εφαρμόζεται ΑΝΑ ΓΡΑΜΜΗ (ανά χώρα), όχι ανά session —
+      // και το averageSessionDuration καταρρέει όταν συνυπάρχει με φίλτρο
+      // pagePath, οπότε έκοβε ολόκληρες χώρες (Ελλάδα: 50 αντί για ~2.600).
+      // Το anti-bot φιλτράρισμα γίνεται σε επίπεδο GA4 property (Admin →
+      // Data Settings → «Εξαίρεση γνωστών bots»), όχι εδώ.
       client.runReport({
         property,
         dateRanges: today,
         dimensions: [{ name: "country" }],
-        metrics: [
-          { name: "activeUsers" },
-          { name: "averageSessionDuration" },
-        ],
+        metrics: [{ name: "activeUsers" }],
         dimensionFilter: newsScope,
-        metricFilter: {
-          filter: {
-            fieldName: "averageSessionDuration",
-            numericFilter: {
-              operation: "GREATER_THAN",
-              value: { doubleValue: 10 },
-            },
-          },
-        },
         orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
         limit: 6,
       }),
