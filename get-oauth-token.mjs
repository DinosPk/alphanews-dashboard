// Βοηθητικό: παίρνει OAuth refresh token για το GA4, συνδέοντας τον δικό σου
// λογαριασμό Google. Τρέξε:
//   node get-oauth-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Θα τυπώσει ένα URL. Άνοιξέ το στον browser, κάνε login με το Gmail που έχει
// πρόσβαση στο GA4, και δώσε «Allow». Μετά γράφει μόνο του το .env.local.

import http from "node:http";
import fs from "node:fs";
import { OAuth2Client } from "google-auth-library";

const clientId = process.argv[2];
const clientSecret = process.argv[3];
const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}`;
const ENV_PATH = "C:/Users/k.papakonstantinou/alphanews-dashboard/.env.local";
const PROPERTY_ID = "354865093";

if (!clientId || !clientSecret) {
  console.error("Χρήση: node get-oauth-token.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const oauth = new OAuth2Client(clientId, clientSecret, redirectUri);
const authUrl = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // αναγκάζει να επιστραφεί refresh_token
  scope: ["https://www.googleapis.com/auth/analytics.readonly"],
});

console.log("AUTH_URL:" + authUrl);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err) {
      res.end("Σφάλμα: " + err);
      console.log("RESULT_ERROR:" + err);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.end("Περιμένω κωδικό εξουσιοδότησης…");
      return;
    }
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
      res.end("Δεν επιστράφηκε refresh token. Δοκίμασε ξανά.");
      console.log("RESULT_ERROR:no_refresh_token");
      server.close();
      process.exit(1);
    }

    const env =
      `GA4_PROPERTY_ID=${PROPERTY_ID}\n` +
      `GA4_OAUTH_CLIENT_ID=${clientId}\n` +
      `GA4_OAUTH_CLIENT_SECRET=${clientSecret}\n` +
      `GA4_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    fs.writeFileSync(ENV_PATH, env);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<h2>✅ Έτοιμο!</h2><p>Η σύνδεση ολοκληρώθηκε. Μπορείς να κλείσεις αυτή " +
        "την καρτέλα και να γυρίσεις στο Claude.</p>"
    );
    console.log("RESULT_OK:refresh_token_saved");
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (e) {
    res.end("Σφάλμα: " + (e?.message || e));
    console.log("RESULT_ERROR:" + (e?.message || e));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("LISTENING:" + redirectUri);
});
