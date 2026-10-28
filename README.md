# Arturitto MoneyBot AI v1.0 (starter)

Darmowy prototyp polskiej strony z okazjami. **Nie generuje jeszcze prowizji**: wymaga zatwierdzonego programu afiliacyjnego i legalnego źródła ofert.

## Uruchomienie
1. Wgraj zawartość ZIP do repozytorium GitHub.
2. Wejdź w Settings → Pages → Build and deployment → Source: GitHub Actions.
3. W zakładce Actions uruchom workflow `Publish site` (albo poczekaj na push do `main`).
4. Link do strony pojawi się w Settings → Pages.

## Oferty
Edytuj `data/offers.json`. Każda oferta musi zawierać prawdziwą cenę, źródło i link. Nie wstawiaj linków partnerskich bez zgody programu. Na razie w zestawie nie ma ofert.

## Automatyzacja
Workflow `Offer checks` uruchamia walidację ofert co 3 godziny. Nie scrapuje sklepów ani nie publikuje fikcyjnych ofert. Integracje z API partnerów dodamy po otrzymaniu kluczy i zgód.

## Kontrola przychodów
Plik `data/revenue.json` to **ręcznie aktualizowana ewidencja pomocnicza**, nie księgowość. Panel pokazuje sumę w bieżącym kwartale i próg ostrzegawczy 9000 zł. Nie gwarantuje nieprzekroczenia limitu, bo opóźnione prowizje mogą naliczać się po zatrzymaniu publikacji. Dane są PUBLICZNE w tym repozytorium i stronie: nie umieszczaj tu prawdziwych danych finansowych, osobowych ani kluczy API. Przed rozpoczęciem zarabiania przeniesiemy księgowanie do prywatnego systemu.

## Podatki
Ustal z doradcą podatkowym rezydencję i rozliczenia PL/CZ oraz kwalifikację przychodów afiliacyjnych. Bot nie zastępuje rozliczeń podatkowych.
