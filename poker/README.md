# All-In Island Poker

Texas Hold'em in the browser: solo against AI, live tables, private tables with friends, real accounts, a friends list with streaks, and an island map where higher-stakes tables unlock as you level up.

**Play:** https://bb8832.github.io/ore-miner-/poker/ (after step 1 below)

Solo play works right away. Accounts, friends and online tables work once Firebase is connected (steps 2–5, about 5 minutes, free).

## 1. Turn on GitHub Pages
Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
After a minute the game is at `https://bb8832.github.io/ore-miner-/poker/`.

## 2. Create a Firebase project
1. Go to https://console.firebase.google.com → **Add project** (Google Analytics can be off).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Authentication → Settings → Authorized domains → Add domain:** `bb8832.github.io`

## 3. Create the database
1. **Build → Realtime Database → Create database** (any location, start in **locked mode**).
2. Open the **Rules** tab, replace everything with the contents of [`database.rules.json`](database.rules.json), and click **Publish**.

## 4. Connect the game
1. **Project settings (gear icon) → General → Your apps → Web (`</>`)** → register an app (no hosting needed).
2. Copy the values from the `firebaseConfig` it shows into [`firebase-config.js`](firebase-config.js), including `databaseURL`
   (if it's missing, copy the URL shown at the top of the Realtime Database page).
3. Commit the file. These keys are meant to be public; the database rules protect the data.

## 5. Play
Open the link, create an account (username + email + password), and send the link to friends.
Find each other by username in **Friends**, add each other, then open a private table and hit **Invite**.

## How online play works
* The first player at a table runs the game (AI and dealing) and the others send their moves through the database.
  If that player leaves, someone else at the table takes over automatically.
* Each player's hole cards are stored where only that player can read them.
* Chips are play money and are saved from each player's browser, so a determined player could edit their own chip count.
  Fine for friends; don't use it for anything with real value.

## Files
* `index.html` – page and styles
* `engine.js` – poker rules, hand ranking, side pots, AI players
* `app.js` – screens, accounts, friends, online tables
* `firebase-config.js` – your Firebase settings
* `database.rules.json` – security rules to paste into Firebase
