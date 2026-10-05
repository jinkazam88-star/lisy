# Lisy na hale

Mobilní aplikace pro předávání směny: 20 lisů, běžící výrobek a 4 další v pořadí,
katalog výrobků, předání přes QR kód nebo soubor. Funguje bez serveru i bez signálu,
data jsou uložená v telefonu.

## Jak ji dostat do telefonů

Aplikace je jen složka souborů. Musí běžet z adresy **https://** (kvůli kameře a instalaci na plochu).
Nejjednodušší je nahrát ji zdarma na Netlify:

1. Otevři https://app.netlify.com/drop a zaregistruj se (zdarma).
2. Přetáhni tam celou složku `lisy-app`.
3. Dostaneš adresu typu `https://neco.netlify.app`. Můžeš ji přejmenovat v nastavení webu.
4. Adresu pošli seřizovačům. V telefonu ji otevřou a dají:
   - **Android (Chrome):** menu ⋮ → *Přidat na plochu / Instalovat aplikaci*
   - **iPhone (Safari):** tlačítko Sdílet → *Přidat na plochu*

Na Vercelu nebo GitHub Pages to funguje stejně. Je to statický web, nic se nesestavuje.

## Jak se předává směna

1. Vedoucí, který končí: **Předání → Předat směnu**. Ukáže se QR kód. Když je dat hodně,
   kódy se střídají (Kód 1 z 3 atd.).
2. Nástupce: **Předání → Načíst od předchozí směny → Naskenovat QR kód**, namíří telefon
   a počká, až načte všechny kódy. Pak dá **Převzít směnu**.
3. Pokud nejsou vedle sebe: **Poslat jako soubor** (WhatsApp, e-mail). Nástupce soubor
   uloží a v aplikaci dá **Otevřít soubor**.

Převzetím se stav lisů v telefonu nahradí předaným stavem. Katalog výrobků se jen doplní.

## Pravidla

- Běžící výrobek nejde přesunout ani smazat. Nejdřív se musí **Zastavit**.
- Po přesunu nebo smazání běžícího výrobku lis stojí. Další výrobek se nasadí tlačítkem **Nasadit…**.
- **Hotovo, nasadit další** ukončí běžící výrobek a posune Další 1 na Běží.
- Směny: ranní 6–14, odpolední 14–22, noční 22–6 (v `app.js`, funkce `shiftInfo`).
- Počet lisů: `PRESS_COUNT` v `app.js` (platí pro první spuštění). Lisy jdou přejmenovat v aplikaci.

## Aktualizace aplikace

Po změně souborů zvyš v `sw.js` číslo `CACHE` (např. `lisy-v2`) a nahraj složku znovu.
Telefony si novou verzi stáhnou při příštím otevření se signálem. Data v telefonech zůstanou.

## Soubory

- `index.html`, `styles.css`, `app.js` – aplikace
- `sw.js`, `manifest.webmanifest`, `icons/` – offline režim a ikona na ploše
- `vendor/` – knihovny pro QR kódy (qrcode-generator, jsQR) a kompresi (lz-string), MIT licence
- `fonts/` – písma Barlow (OFL licence)
