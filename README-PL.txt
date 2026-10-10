IPTV Player – wersja testowa na iPhone (PWA)

WAŻNE
- To jest osobna kopia projektu. Oryginalny projekt Electron/Windows nie został zmieniony.
- Ta wersja jest prototypem webowym/PWA, a nie natywnym plikiem IPA.
- Nie każdy strumień będzie działał w Safari. Największa szansa jest dla HLS (.m3u8). MPEG-TS bezpośrednio może nie działać na iOS.
- Pobieranie playlisty z URL może być blokowane przez CORS po stronie serwera. Wtedy spróbuj wczytać plik M3U z iPhone'a. Nie dodano obejścia CORS ani serwera proxy.
- Korzystaj tylko z playlist i strumieni, do których masz prawo dostępu.

JAK OPUBLIKOWAĆ ZA DARMO (np. GitHub Pages)
1. Utwórz nowe publiczne repozytorium na GitHubie.
2. Prześlij zawartość tego folderu (index.html, app.js, style.css, manifest.webmanifest, sw.js, lib/, icons/).
3. Settings > Pages > Deploy from a branch > main > /(root) > Save.
4. Otwórz wygenerowany adres HTTPS na iPhonie w Safari.
5. Udostępnij znajomym adres strony. Na iPhonie: Udostępnij > Dodaj do ekranu początkowego.

TESTOWANIE LOKALNE
Nie otwieraj index.html przez file://, ponieważ Service Worker i PWA wymagają HTTPS albo localhost. Uruchom stronę przez lokalny serwer lub opublikuj ją na hostingu HTTPS.

Oryginalny folder projektu Windows pozostaje bez zmian. To jest osobny wariant do testowania.


POPRAWKA CZARNEGO EKRANU
Ta wersja ma awaryjne ukrywanie ekranu startowego. Po podmianie na hostingu odśwież stronę na iPhonie. Jeśli wcześniej dodałeś ją do ekranu początkowego, zamknij ją całkowicie i otwórz ponownie. Service worker ma nową wersję pamięci podręcznej (v2).


POPRAWKA WCZYTYWANIA PLAYLISTY (v3)
- Plik M3U/M3U8 jest teraz czytany przez FileReader, co poprawia zgodność z Safari na iPhonie.
- Jeśli plik jest nieprawidłowy albo nie zawiera kanałów, aplikacja pokaże komunikat zamiast pozostawiać pusty ekran.
- Po aktualizacji hostingu odśwież stronę i zamknij, a następnie ponownie otwórz aplikację dodaną do ekranu początkowego.
