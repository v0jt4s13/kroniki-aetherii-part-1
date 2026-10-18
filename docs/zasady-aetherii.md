# Uściślenia reguł Kronik Aetherii

Źródło: [instrukcja autora](https://docs.google.com/document/d/1p6f3Cdwg4lqFfnI_wwpzwNWJxTPqIQF3SADTpmbqkEA/edit), odczytana 14 października 2026. Nie zmieniano dokumentu źródłowego.

Instrukcja opisuje główną mechanikę, lecz nie określa wszystkich parametrów potrzebnych serwerowi. Poniższe decyzje są jawnie przyjętymi uzupełnieniami, a nie dodatkowymi zapisami instrukcji.

- Użytkownik zatwierdził zachowanie dotychczasowych kosztów i dostosowanie kart do fantasy. Pięć zasobów: Pradawne Drewno (`wood`), Runiczny Kamień (`brick`), Eteryczne Zioła (`sheep`), Zapasy (`wheat`), Mitril (`ore`). Stabilne identyfikatory zapewniają zgodność zapisów.
- 19 heksów to 4 Drewna, 3 Kamienia, 4 Ziół, 4 Zapasów, 3 Mitrilu i 1 pustkowie bez numeru. Pustkowie nie produkuje surowców; losowanie zachowuje zakaz sąsiadujących 6/8 w nowych grach.
- Koszty: Trakt = Drewno + Kamień; Strażnica = Drewno + Kamień + Zioła + Zapasy; Cytadela = 2 Zapasy + 3 Mitrile; Magia = Zioła + Zapasy + Mitril. Limity pionków: 15/5/4. Bank: 19 każdego surowca.
- Talia: 14 Runicznych Tarcz (+2 Pancerza przy najazdzie), 5 Kronik Chwały (+1 ukryty PZ), po 2 Magiczne Trakty (2 darmowe Trakty), Dary Aetherii (2 surowce) i Zewy Żywiołów (przejęcie surowca od przeciwników). Jedna karta akcji na turę, po rzucie i od następnej tury po zakupie. Runiczna Tarcza działa w mobilizacji; pozostałe karty rozpoczynają fazę budowy i magii.
- Każdy wpłacony surowiec daje 1 Pancerza, a Mitril Krasnoludów 2. Wpłacone karty pozostają poza bankiem do rozstrzygnięcia, po czym wracają do banku również przy Kataklizmie. Zaklęcie obronne zalicza się do wkładu w Pancerzu.
- Bohater Aetherii otrzymuje trwały 1 PZ za każdą samodzielnie wygraną nagrodę. Remisy liderów dają karty bez PZ, do wyczerpania talii, w kolejności graczy. Najdłuższy Trakt i dawna największa armia nie dają PZ, bo nie występują w nowej instrukcji.
- Przy remisie najmniejszego wkładu karę otrzymują wszyscy remisujący. Niszczy się własny Trakt o najwyższym identyfikatorze, o ile ochrona Elfów Leśnych go nie osłoni. Brak Traktów oznacza odrzucenie połowy ręki w dół, w kolejności Drewno/Kamień/Zioła/Zapasy/Mitril. Niejasne „grozi mu brak zasobów” nie wprowadza dodatkowego automatycznego progu. Wkład zerowy nie zwalnia z utraty istniejącego Traktu.
- Bonus ludzi wybiera gracz spośród zasobów obecnych w banku. Pierwsza wpłata wymaga dostępnego bonusu; surowiec jest blokowany przed ponowną wpłatą do końca tej tury, ale może posłużyć do handlu lub budowy. Bonus przyznawany jest raz na najazd.
- Ochrona Elfów Leśnych wynika z co najmniej jednej wpłaty Ziół w bieżącym najazdzie i zapobiega jedynej grożącej temu graczowi utracie Traktu.
- Globalna kara działa przez następne N tur graczy (N = liczba graczy), także jeśli rzut 7 nie daje produkcji. Po sprawdzeniu pełnego zapotrzebowania banku odejmuje się jeden rzeczywiście produkowany surowiec każdemu graczowi, w powyższej kolejności zasobów. Nie może zejść poniżej zera.
- „Druga porażka z rzędu” oznacza drugą lub kolejną porażkę przy 100% zagrożenia. Zwycięska obrona zeruje licznik kolejnych porażek.

## Migracja wcześniejszych zapisów

Przy odczycie starego `rooms.json` serwer tworzy jednorazową kopię `rooms.pre-aetherii.json` z prawami 0600. Nowe zasady otrzymują wersję `aetherii-1`. Zachowuje się identyfikatory pokojów, konta, sesje, zasoby i postawione budowle; frakcje przydziela się według miejsc. Rycerze stają się Runicznymi Tarczami; pustynia pozostaje nieprodukcyjnym pustkowiem; złodziej i stare nagrody przestają działać. Początkowe zagrożenie po migracji wynosi 0%.

Rozstawione wcześniej cztery budowle w grach dwuosobowych pozostają na planszy. Rozpoczęte rozstawienie zachowuje już wykonane kroki; jeśli nie minął drugi komplet, pozostały plan skraca się do dwóch par na gracza. Nowe rozgrywki zawsze zaczynają od dwóch par. Migracja istniejącego terenu nie przelosowuje innych żetonów, więc odziedziczony układ może różnić się od ograniczeń nowego losowania.

## Warianty po pierwszej partii (14 października 2026)

Na prośbę użytkownika nowe pokoje pozwalają wybrać 19, 23 lub 25 heksów. To rozszerzenie instrukcji źródłowej. Ustawienia można zmieniać przed startem, bez modyfikowania już rozpoczętych partii. Większa wyspa zachowuje środkowe 19 pól i dodaje przeciwległe pary pól przy brzegu. Rozkład surowców (Drewno/Kamień/Zioła/Zapasy/Mitril): 19 = 4/3/4/4/3; 23 = 5/4/4/5/4; 25 = 5/4/5/5/5. Każdy rozmiar zawiera dodatkowo dokładnie jedno pustkowie, wliczone w całkowitą liczbę heksów. Dodatkowe żetony dla 23 pól: 6/8/9/10; dla 25 także 4/11. Żetony 6/8 nadal nie sąsiadują. Pozostaje 9 portów i bank 19 kart każdego rodzaju.

W trybie ze znajomymi można rezerwować 1, 2 lub 3 miejsca dla SI; takie partie zawsze mają cztery frakcje i wymagają odpowiednio 3, 2 lub 1 osoby. Dopiero przy starcie SI otrzymuje pozostałe frakcje. Gospodarz zmienia obsadę wyłącznie w lobby i nie może usunąć miejsca zajętego przez człowieka. Odliczanie najazdu i wymagany Pancerz uwzględniają wszystkich czterech graczy, w tym SI. Dotychczasowy pojedynek człowieka z jednym komputerem pozostaje dostępny osobno.

Dziennik po rzucie zapisuje sumę faktycznie otrzymanych surowców osobno dla każdego gracza. Liczby uwzględniają bank i karę produkcji; odrzucenie kart po siódemce nie jest traktowane jako ujemna produkcja. Log nie ujawnia prywatnych rąk ani Kart Magii.

## Dublety (14 października 2026)

Na życzenie użytkownika każdy wynik z dwiema jednakowymi kośćmi daje obowiązkowy dodatkowy rzut. Dotyczy to wszystkich sześciu par, także 1+1 i 6+6. Następny dublet ponownie przedłuża serię, bez limitu liczby powtórzeń. Każdy rzut oddzielnie uruchamia produkcję i wpis do dziennika; niedobory banku oraz kara produkcji działają przy każdym rzucie.

Cała seria odbywa się przed handlem, mobilizacją i budową, w tej samej turze tego samego gracza. Nie zmienia numeru tury ani terminu najazdu, nie odnawia zdolności frakcji i limitu jednej Karty Magii. Pierwszy wynik bez pary kończy serię. Jeśli jest to 7, normalnie rozpoczyna/zwiększa najazd i wymusza odrzucanie kart, po czym przechodzi się do dalszych faz. Oczekujący dodatkowy rzut jest zachowywany w zapisie gry i po odświeżeniu. SI powtarza rzuty według tych samych reguł.

## Pustkowie i czerwone numery

Przywrócono jedno nieprodukcyjne pole bez żetonu liczbowego w nowych partiach 19/23/25 heksów. Wcześniejsze lobby bez pustkowia otrzymuje poprawioną planszę przy starcie. Już rozpoczęte partie zachowują swój układ, żeby nie odbierać graczom produkcji w trakcie gry.

Czerwone 6 i 8 wyróżniają najczęstsze wyniki dające zasoby: każda suma ma 5 kombinacji z 36 możliwych wyników dwóch kości, czyli około 13,9%. Dla porównania 2 i 12 mają po 1/36. Najczęstsza suma 7 (6/36) uruchamia najazd i nie daje produkcji. Czerwony kolor nie oznacza zagrożenia ani kary. Dublety nie zmieniają prawdopodobieństw pojedynczego rzutu.
