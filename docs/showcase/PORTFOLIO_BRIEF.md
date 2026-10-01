# Brief: add Finance Buddy to Sam's portfolio site

For: a Claude Code session working in **Sam's existing portfolio website repository**.
Assets come from this public repo: `Sam-UX-Designer/Finance-buddy`, branch `claude/laughing-hamilton-q3oseg`.

---

## Paste this into the portfolio's Claude Code session

> Read the brief at
> https://raw.githubusercontent.com/Sam-UX-Designer/Finance-buddy/claude/laughing-hamilton-q3oseg/docs/showcase/PORTFOLIO_BRIEF.md
> and do exactly what it says in this portfolio repository. Do not create a new website or a new repository.
> In the "What I Built" section, replace the third project ("To Do List") with Finance Buddy, using the
> Finance Buddy mascot as its logo, and add a Finance Buddy project page inside this site.
> Use only the real screenshots and logo files listed in the brief.

---

## 1. What to do (and what not to do)

**Do**
1. **Update the existing "What I Built" section.** It has three project cards. Replace the **third** card, currently **"To Do List"**, with **Finance Buddy**:
   - change its title, description, tags and link (copy in section 3);
   - change its logo/icon to the Finance Buddy mascot (`brand/mascot.png`; `brand/mascot-animated.svg` if the card can show an SVG).
   Leave the other two cards exactly as they are.
2. **Add a Finance Buddy project page inside the existing site** (a landing / case-study page for this one project). Follow the site's existing routing and page pattern. If other projects already have detail pages, copy their structure; otherwise use a route like `/projects/finance-buddy`. The third card links to this page.
3. Use the site's existing framework, layout, header, footer, fonts loading and components. The new page should feel like part of the portfolio, dressed in Finance Buddy's look (section 5).

**Don't**
- Don't create a new website, a new repository or a separate deployment.
- Don't redesign or restyle the rest of the portfolio.
- Don't hotlink images from GitHub in production. Copy them into the portfolio's own assets folder (section 6).
- Don't use stock images or mock-ups that aren't in this brief. Every screenshot must be a real one from the list.
- Don't invent numbers (users, downloads, revenue, ratings). See content rules in section 7.

---

## 2. What Finance Buddy is (context)

Finance Buddy is a personal finance app for India, for **iOS, Android and the web**. Designed by **Sam** (product designer) and built with **Claude Code**.

It connects your bank accounts through India's RBI-regulated **Account Aggregator** network (consent-based; the app never asks for bank passwords). It brings your money into one place, and it has **Super Intelligence**: a friendly mascot assistant that answers questions from your own numbers.

- Live demo: https://finance-buddy-theta.vercel.app
- Code: https://github.com/Sam-UX-Designer/Finance-buddy

---

## 3. Copy for the "What I Built" card (third card)

- **Title:** Finance Buddy
- **Description (one line):** A personal finance app for India with a Super Intelligence that explains your money.
- **Shorter, if the card needs it:** Your money, all in one place, explained by a friendly AI buddy.
- **Tags:** Product design · iOS · Android · Web · AI
- **Logo/icon:** `brand/mascot.png` (transparent PNG). If the card shows logos on a square tile, use `brand/app-icon.png` (mascot on white).
- **Link:** the new Finance Buddy project page.

---

## 4. The Finance Buddy project page: sections, copy and screenshots

Order the sections like this. Copy can be tightened to match the portfolio's voice, but keep the meaning.

### 4.1 Hero
- Animated mascot (`brand/mascot-animated.svg`) next to or above the title.
- **Title:** Finance Buddy
- **Headline:** Your money, all in one place. Explained.
- **Sub-headline:** A personal finance app for India. Connect your bank accounts safely, see everything at a glance, and ask Super Intelligence anything about your money.
- **Buttons:** "Try the live demo" → https://finance-buddy-theta.vercel.app (primary) · "View the code" → GitHub (secondary)
- **Visual:** two phones side by side: `03-home-light.png` and `04-home-dark.png`.
- **Small line under the buttons:** iOS · Android · Web

### 4.2 The problem, in one line
"Money in India is spread across banks, cards, mutual funds, FDs and EPF. Nobody shows you the full picture, or what to do next."

### 4.3 How it works (3 steps, with icons or numbers)
1. **Connect safely.** Approve access through India's RBI-regulated Account Aggregator. No bank passwords, ever. (`01-sign-in-dark.png`)
2. **See everything at once.** Balances, spending, investments and net worth on one screen. (`03-home-light.png`)
3. **Ask Super Intelligence.** Plain-language answers from your own numbers. (`07-super-intelligence-chat-dark.png`)

### 4.4 The "aha" moment
- **Heading:** The moment it clicks
- **Text:** Right after connecting, your net worth counts up and Super Intelligence shows three things it has already found, like how your investments are doing and which payments are coming up.
- **Screenshot:** `02-aha-reveal-light.png` (or `02-aha-reveal-dark.png` on a dark section)

### 4.5 Features: alternate text and screenshot left/right, or use a bento grid
| Feature | What to say | Screenshot |
|---|---|---|
| **Home that adapts** | Swipe through your bank cards; tilt the phone and the card shines; tap to flip for details. Today's spending, this month, investments and upcoming payments on one screen. Long-press to rearrange or hide cards; cards that changed since your last visit move to the top. | `04-home-dark.png`, `05-bank-card-dark.png`, `06-home-customize-light.png` |
| **Super Intelligence** | A friendly mascot that answers from your own numbers: "Why did I spend more this month?", "Show my subscriptions". A weekly brief, quick-reply suggestions, and chat history grouped by date. | `07-super-intelligence-chat-dark.png`, `07b-super-intelligence-light.png`, `09-chat-history-light.png` |
| **Plans that fit you** | Super Intelligence asks five quick questions (income, spending, emergency buffer, expected returns), pre-filled from your bank data, so every forecast uses your real numbers. | `08-super-intelligence-setup-dark.png`, `12-plan-dark.png` |
| **Every transaction, clear** | Real merchant logos, search, filters by type, account, category, month or a custom date range on a calendar. Fix a category once and it's remembered. | `10-activity-light.png`, `11-activity-filter-calendar-dark.png` |
| **Your net worth** | Mutual funds, fixed deposits, EPF, savings and money you've lent, with how it has grown since January. | `13-wealth-light.png` |
| **Goals and forecasts** | Goals with projections, a cash forecast until your next salary with a safety buffer, and budgets. | `12-plan-dark.png` |
| **Works on desktop too** | A real web app with a sidebar, not a stretched phone screen. | `desktop-home-light.png`, `desktop-home-dark.png`, `desktop-super-intelligence-light.png` |

### 4.6 Design details (a short "Design" section)
- **Feels native:** an Apple-style floating glass tab bar with a sliding lens, large titles that collapse as you scroll, haptics on the phone, light and dark mode.
- **A mascot with personality:** it floats, blinks and gives a happy little shake. It stays still for people who turn on Reduce Motion.
- **Accessible:** screen-reader labels, large touch targets, and Reduce Motion and Reduce Transparency respected.

### 4.7 Privacy (a short trust strip with 3 to 4 points)
- Consent-based access through India's RBI-regulated Account Aggregator network
- Never asks for bank passwords
- Sensitive data encrypted; your financial data isn't used to train AI models
- Delete your account any time

### 4.8 How it was built (short, factual)
- Designed by Sam; built with **Claude Code**.
- **App:** Expo and React Native (one codebase for iOS, Android and web), TypeScript.
- **Backend:** API on Vercel; Supabase Postgres with row-level security.
- **Finance engine:** a tested calculation engine. Super Intelligence answers come from it, so numbers are computed, not guessed.

### 4.9 Closing call to action
- "Try Finance Buddy" → live demo; "View the code" → GitHub.
- Optional, only if Sam agrees: "Demo login: any 10-digit mobile number, code 123456. The demo uses sample data."

---

## 5. Look and feel (match Finance Buddy)

**Overall style:** plain, minimal, Apple-native. Solid surfaces and lots of whitespace. **Don't** use colourful gradient page backgrounds; the only gradient is the mascot itself.

**Colours**
| Token | Light | Dark |
|---|---|---|
| Page background | `#F2F2F7` | `#000000` |
| Card surface | `#FFFFFF` | `#1C1C1E` |
| Muted surface / secondary button | `#EDEDF0` | `#2C2C2E` |
| Border / divider | `#E5E5EA` | `#2C2C2E` |
| Text | `#0A0A0B` | `#FFFFFF` |
| Secondary text | `#6B6B73` | `#98989F` |
| Tertiary text | `#8E8E93` | `#6C6C70` |
| Primary button | `#0A0A0B` with white text | `#FFFFFF` with black text |
| Positive (money in, gains) | `#16A34A` | `#22C55E` |
| Negative (money out) | `#E5484D` | `#F2555A` |
| Info / links | `#2F6BFF` | `#5B8CFF` |

**Mascot gradient (accent only, sparingly):** cyan `#14ACFD` → blue `#353DFD` → violet `#483AFC` → lavender `#AB95FC` → pink `#FE5FE7`. Fine for a thin accent line, a glow behind the hero mascot, or a highlight on a tag. Not for big backgrounds.

**Type:** Inter (400 / 500 / 600 / 700). Big, tight headlines (bold, letter-spacing about −0.02em); body 15 to 17px with relaxed line-height. Sentence case.

**Shapes:** card radius 16px (large cards 20px), buttons 14 to 16px or full pill, chips full pill. Soft shadows only on floating elements.

**Phone screenshots:** show them in a simple rounded phone frame (radius about 44px, thin dark bezel) or as rounded screenshots (radius about 28px) with a soft shadow. Don't use busy 3D device mock-ups.

**Motion:** gentle fade-and-rise as sections scroll in, 200 to 400ms. Respect `prefers-reduced-motion` (no movement; the mascot SVG already handles this).

**Dark mode:** if the portfolio supports dark mode, use the light screenshots in light mode and the dark ones in dark mode where both exist.

---

## 6. Assets: copy these into the portfolio repo

Base URL (public): `https://raw.githubusercontent.com/Sam-UX-Designer/Finance-buddy/claude/laughing-hamilton-q3oseg/docs/showcase/`

Download each file into the portfolio's assets folder (for example `public/projects/finance-buddy/`). Convert to WebP or AVIF, make responsive sizes (for example 1x and 2x), and lazy-load everything below the hero. Phone screenshots are 780×1688 (390×844 at 2x); desktop ones are 2880×1800.

**Brand**
| File | Use | Alt text |
|---|---|---|
| `brand/mascot.png` | Card logo, small logo uses (transparent, 1024px) | Finance Buddy mascot |
| `brand/mascot-animated.svg` | Hero mascot. Self-contained animated SVG: it floats, blinks and smiles. Use as `<img>`; it stops moving with Reduce Motion | Finance Buddy mascot |
| `brand/app-icon.png` | App icon (mascot on white, 1024px), for square logo tiles | Finance Buddy app icon |
| `brand/mascot-body.png` | Only if rebuilding the animation in code (body without face; face geometry is in the SVG) | (decorative) |
| `brand/favicon-196.png` | Small icon if the page needs one | (decorative) |

**Screens**
| File | Shows | Alt text |
|---|---|---|
| `screens/01-sign-in-dark.png` | Sign-in with the mascot, Account Aggregator trust points | Finance Buddy sign-in screen with the mascot |
| `screens/02-aha-reveal-light.png` / `02-aha-reveal-dark.png` | Net worth reveal and "What I already found" | Net worth revealed after connecting accounts, with three findings |
| `screens/03-home-light.png` | Home: mascot greeting, total balance card, spending | Finance Buddy home screen in light mode |
| `screens/03b-home-scrolled-light.png` | Home scrolled: This Month, Super Intelligence card, investments | Home screen with this month's summary and an insight |
| `screens/04-home-dark.png` | Home in dark mode | Finance Buddy home screen in dark mode |
| `screens/05-bank-card-dark.png` | A bank card (HDFC) after swiping | Swipeable bank card |
| `screens/06-home-customize-light.png` | Home edit mode: move or hide cards | Customising the home screen |
| `screens/07-super-intelligence-chat-dark.png` | Super Intelligence answering about subscriptions | Super Intelligence answering a question |
| `screens/07b-super-intelligence-light.png` | Super Intelligence home with weekly brief and setup card | Super Intelligence weekly brief |
| `screens/08-super-intelligence-setup-dark.png` | Super Intelligence asking setup questions | Super Intelligence setting up your money profile |
| `screens/09-chat-history-light.png` | Chat history grouped by date | Chat history |
| `screens/10-activity-light.png` | Transactions with merchant logos | Transactions list |
| `screens/11-activity-filter-calendar-dark.png` | Filter with custom date range calendar | Filtering transactions by a custom date range |
| `screens/12-plan-dark.png` | Net worth projection; set up with Super Intelligence | Net worth projection |
| `screens/13-wealth-light.png` | Net worth breakdown and allocation | Wealth overview |
| `screens/desktop-home-light.png` / `desktop-home-dark.png` | Desktop web app with sidebar | Finance Buddy on desktop |
| `screens/desktop-super-intelligence-light.png` | Super Intelligence on desktop | Super Intelligence on desktop |

---

## 7. Content rules

- **Sample data:** the screenshots and the live demo use sample data. Don't claim real users, real bank connections in production, downloads, ratings or revenue. If a line implies live bank connections, add "Demo uses sample data".
- **Name:** always "Super Intelligence" in text. Don't use the abbreviation "SI" on the page.
- **Money:** Indian format with ₹ and lakh grouping (₹1,60,072), as in the app.
- **Bank and merchant logos** in screenshots belong to their owners. Add a small footer note on the project page: "Bank and merchant logos are trademarks of their owners, shown for illustration."
- **Voice:** short, clear, friendly. No jargon ("AA", "FIP", "RLS") in visitor-facing copy; say "India's RBI-regulated Account Aggregator network", "your banks" and "secure database rules".

---

## 8. Quality requirements

- **Responsive:** looks right at 375px (phone), 768px (tablet) and 1440px (desktop). No horizontal scrolling. Phone screenshots stack on mobile.
- **Accessible:** real headings in order (one h1), alt text from section 6, focus styles visible, text contrast at least 4.5:1, links and buttons labelled.
- **Performance:** optimized images (WebP or AVIF, responsive `srcset`), lazy-load below the hero. Keep the page fast; don't add a heavy animation library just for this page.
- **SEO:** page title "Finance Buddy — Personal finance app with Super Intelligence | Sam", meta description from the hero sub-headline, Open Graph image (`03-home-light.png` or a composed image of the hero).
- **Links:** live demo and GitHub open in a new tab with `rel="noopener noreferrer"`.

---

## 9. Done when

- [ ] "What I Built" still has three cards; the third now says **Finance Buddy** (no "To Do List" anywhere), shows the **mascot logo**, and links to the new page.
- [ ] The other two cards and the rest of the site are unchanged.
- [ ] The Finance Buddy page exists inside the existing site (same header and footer), with every section from section 4.
- [ ] Every image is a real screenshot or logo from section 6, copied into the portfolio repo (not hotlinked) and optimized.
- [ ] The look matches section 5: plain surfaces, Inter, Finance Buddy colours; gradient only on the mascot.
- [ ] The hero mascot animates, and stays still with Reduce Motion.
- [ ] Works at 375 / 768 / 1440px, in light (and dark, if the site supports it).
- [ ] Live demo and GitHub links work.
- [ ] The site builds without errors, and its existing checks or tests still pass.

## 10. Out of scope

- Changes to the Finance Buddy app itself.
- New pages for other projects, or a redesign of the portfolio.
- Writing blog posts or adding analytics.
