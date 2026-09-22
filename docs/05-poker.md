# ♠️ Texas Hold'em + Video Poker

**Status:** 📝 Design fertig · Assets fehlen · Ordner: `public/assets/poker/` (teilt Chips/Karten mit Blackjack)

## Texas Hold'em (vs. 5 KI-Gegner)

- No-Limit, Blinds 5/10 Spielgeld, Buy-in 1.000.
- 5 KI-Gegner mit eigenen Stilen:
  | Name | Stil |
  |---|---|
  | „The Kingpin“ | tight-aggressiv |
  | „Lucky Mary“ | loose-passiv, callt viel |
  | „Blaze“ | Bluffer, hohe Aggression |
  | „Dr. Kush“ | mathematisch, Pot-Odds |
  | „Couch Rookie“ | unberechenbar, Anfängerfehler |
- Look: „Haze Kings Lounge“ (Cannabis-Edition), siehe Asset-Guide. Video Poker heißt hier **„Kush or Better“** (Regeln = Jacks or Better).
- KI: Handstärke per Monte-Carlo (Equity gegen Zufallshände) + Stil-Parameter (VPIP, Aggression, Bluff-Frequenz), kleine Zufallsvarianz → nicht vorhersehbar.
- Präsentation: ovaler Tisch, Avatare mit Timer-Ring, Chips fliegen in den Pot, Community-Cards werden nacheinander aufgedeckt, Showdown mit Hervorhebung der 5 Gewinnkarten + Handname („FULL HOUSE“ als Gold-Text).

## Video Poker (Jacks or Better, 9/6)

- RTP 99,54 % bei optimaler Strategie.
- 5 Karten, Halten per Klick, Draw. Paytable-Leiste oben (Royal Flush 800x bei max. Einsatz).
- Double-Up optional.

## Asset-Liste

Prompts → [Asset-Guide › Blackjack & Poker](06-asset-guide.md#blackjack--poker).

`table_poker`, `dealer_button`, `avatar_shark`, `avatar_lucky`, `avatar_maverick`, `avatar_professor`, `avatar_rookie`, `avatar_player`, `logo_poker`, `logo_videopoker` + gemeinsame: `card_back`, `court_J/Q/K`, `chip_*`, `bg_room`
