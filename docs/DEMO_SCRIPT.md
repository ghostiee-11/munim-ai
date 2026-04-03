# MunimAI Demo Script — Fin-O-Hack Grand Finale

## Setup (Before Demo Starts)

1. Open Dashboard: `https://munim-ai.vercel.app` on the projector
2. Open WhatsApp page in a second tab
3. One teammate's phone visible (to receive "debtor" notification)
4. Hit `POST /api/demo/reset` to set clean seed data state
5. Hit the health endpoint to warm up the backend: `GET /health`

---

## ACT 1: The Morning (60 seconds)

**Narrate:**
> "It's 9 AM. Sunita ji opens her saree shop in Varanasi.
> She doesn't open any app. She doesn't type anything.
> But MunimAI has already sent her this morning briefing on WhatsApp."

**Action:** Switch to WhatsApp tab. Show the morning briefing:
```
Namaste Sunita ji! 🙏

Kal ka hisaab:
📈 Sale: Rs 34,500 (+12% last Tuesday se)
📉 Kharcha: Rs 12,400
💰 Munafa: Rs 22,100 (64% margin)

Aaj ke alerts:
📝 3 udhari due hain (Rs 25,000 total)
💳 PayScore: 74 (+2 last week se)
📋 GSTR-3B 18 din mein due — sab ready hai

Reply karein ya voice note bhejein! 🎤
```

**Action:** Switch to Dashboard. Show it alive:
- Live P&L: Income Rs 34,500 | Expense Rs 12,400 | Profit Rs 22,100
- PayScore gauge at 74
- Udhari tracker with 5 entries
- Activity feed scrolling

---

## ACT 2: Voice Commands — THE WOW MOMENT (120 seconds)

**Narrate:**
> "Sunita ji's hands are busy — wrapping sarees, serving customers.
> She doesn't stop to type. She SPEAKS to the Soundbox on her counter."

### Command 1: Log Expense
**Speak into mic:** "Muneem, Rs 5,000 rent diya"

**Watch Dashboard:**
- Expense: Rs 12,400 → Rs 17,400 (red flash + animation)
- Profit: Rs 22,100 → Rs 17,100 (slides down)
- Margin bar shifts from green to yellow zone
- Activity feed: "📢 Rs 5,000 rent logged"
- Soundbox confirms: "Rs 5,000 rent mein daal diya"

### Command 2: Simulate Paytm QR Payment
**Click "Simulate Payment" button** (or teammate scans QR)

**Watch Dashboard:**
- Income: Rs 34,500 → Rs 37,000 (green flash)
- Profit recovers: Rs 17,100 → Rs 19,600
- Customer ticker: "Sharma ji — Rs 2,500"

### Command 3: Big Expense (TRIGGER ALERT)
**Speak:** "Muneem, Rs 45,000 stock kharida Gupta Traders se"

**Watch Dashboard:**
- Expense SPIKES: Rs 17,400 → Rs 62,400 (BIG red flash)
- Profit goes NEGATIVE: Rs 19,600 → Rs -25,400 (turns RED)
- Margin bar turns fully red
- 🚨 **ALERT BANNER slides in from top:**
  "Aaj ka expense income se zyada ho gaya!
   Profit: -Rs 25,400. 3 udhari reminders bhejein?"
  [Haan, bhej do] [Baad mein]

**PAUSE for effect.** Let judges absorb this.

---

## ACT 3: Autonomous Collection (60 seconds)

**Narrate:**
> "This is where MunimAI becomes AGENTIC.
> Not advisory — not 'here's a chart.' AGENTIC — 'let me fix this for you.'"

### Trigger Collection
**Click "Haan, bhej do"** on the alert banner.

**Watch WhatsApp tab:**
3 collection messages appear instantly:
```
1. Tripathi ji — Rs 12,000
   "Namaste Tripathi ji, Sunita Saree Shop ki taraf se —
   Rs 12,000 pending hai. Ye link se bhej dijiye: paytm.me/..."

2. Mehra ji — Rs 5,000
   "Mehra ji, aapka Rs 5,000 abhi bhi pending hai..."

3. Sharma ji — Rs 8,000
   "Sharma ji, Rs 8,000 ka ek naya udhari note hua hai..."
```

**Show teammate's phone buzzing** (debtor receives message)

### Debtor Pays
**Teammate clicks Paytm link and "pays" Rs 8,000**
(Click "Simulate Collection" on demo panel)

**Watch Dashboard:**
- Udhari entry "Sharma ji" → turns GREEN with ✅
- Income: Rs 37,000 → Rs 45,000 (green flash)
- Profit recovers: -Rs 25,400 → -Rs 17,400
- Activity feed: "✅ Rs 8,000 collected (Sharma ji)"

---

## ACT 4: Intelligence Layer (60 seconds)

### Daily Summary
**Speak:** "Muneem, aaj kaisa raha?"

**MunimAI responds (TTS in Hindi):**
> "Sunita ji, aaj Rs 45,000 ki income hui. Kharcha Rs 62,400 —
> isme Rs 45,000 stock purchase tha. Agar stock hata dein toh
> aaj ka net positive Rs 19,600 hai. Aur Rs 8,000 udhari collect
> ho gaya. Baaki 2 reminders pe response nahi aaya."

### Flash Through Features (Quick Tour)
1. **Forecast page** (switch tab): 30-day cash flow chart with festival markers
   > "Navratri 7 din mein hai — revenue 80% badhega"

2. **PayScore gauge**: 74 → path to 80
   > "80 tak pahuncho toh Rs 3L loan milega 14% pe"

3. **GST page**: "GSTR-3B: Ready. 18 din baaki. Approve karo toh file kar doon?"

4. **Schemes page**: "MUDRA Shishu eligible — Rs 50,000 at 8.5%"

---

## ACT 5: The Pitch (60 seconds)

**Narrate:**
> "Let me tell you what just happened:
>
> This merchant tracked every expense,
> collected Rs 8,000 in pending payments,
> got a cash flow forecast,
> checked her credit score,
> and filed her GST —
>
> WITHOUT opening a single app.
> WITHOUT typing a single word.
> WITHOUT understanding a single English term.
>
> THAT is MunimAI.
>
> And here's why Paytm should build this:
>
> Every udhari collected → goes through a Paytm payment link.
> Every PayScore improvement → unlocks a Paytm Merchant Loan.
> Every GST filed → deepens the Paytm data moat.
> Every MunimAI action = Paytm revenue.
>
> 4.5 crore merchants. 1.37 crore Soundboxes.
> Zero acquisition cost. Rs 30 Cr/month revenue potential.
>
> Paytm gave 63 million businesses a way to ACCEPT money.
> MunimAI gives them a way to UNDERSTAND, PROTECT, and GROW that money.
>
> Every big business has a CFO.
> We believe every chai shop deserves an AI one.
>
> Built on Paytm. Built for Bharat. Built to make small businesses un-killable."

---

## Demo Panel Quick Reference

| Button | API Call | Effect |
|--------|---------|--------|
| Reset Data | POST /api/demo/reset | Restore clean seed data |
| Simulate Payment | POST /api/demo/simulate-payment | Incoming Rs 2,500 from Sharma ji |
| Simulate Collection | POST /api/demo/simulate-collection | Sharma ji pays Rs 8,000 via link |
| Trigger Alert | POST /api/demo/trigger-alert | Cash crunch alert |
| Send Briefing | POST /api/briefing/{id}/send | Morning briefing to WhatsApp |

## Timing: Total ~5 minutes
- Act 1: 60s (Morning briefing)
- Act 2: 120s (Voice commands — THE WOW)
- Act 3: 60s (Autonomous collection)
- Act 4: 60s (Intelligence tour)
- Act 5: 60s (Pitch)

## Fallback Plans
- If voice recognition fails → Type command in text input
- If WebSocket drops → Refresh page (auto-reconnects)
- If backend is slow → Pre-recorded demo video ready
- If internet fails at DTU → Backend running locally on laptop
