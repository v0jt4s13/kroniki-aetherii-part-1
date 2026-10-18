import type { ReactNode } from 'react';
import { CubeIcon, ExternalLinkIcon, LayersIcon, LightningBoltIcon, MagicWandIcon, ReaderIcon, StarIcon, TargetIcon, TimerIcon } from '@radix-ui/react-icons';
import { appPath } from './app-path';
import { cardDescriptions, cardNames, costs, factions, labels, resources, watchtowerImage, type Faction } from './game-types';

const buildNames: Record<string, string> = { road: 'Trakt Handlowy', settlement: 'Strażnica', city: 'Cytadela', development: 'Karta Magii' };
const buildPoints: Record<string, string> = { settlement: '1 PZ', city: '2 PZ' };
const turnSteps = ['Rzut 2K6', 'Handel i mobilizacja', 'Budowa i magia', 'Bitwa i koniec tury'];

const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) =>
  <section className="rules-section"><h3><span className="rules-icon" aria-hidden="true">{icon}</span>{title}</h3>{children}</section>;
const Chips = ({ items }: { items: string[] }) => <ul className="rules-chips">{items.map(t => <li key={t}>{t}</li>)}</ul>;

// Same rules text as before, laid out as cards: goal, turn flow, costs with resource icons, faction crests.
export default function RulesPanel() {
  return <div className="rules">
    <section className="rules-hero">
      <img src={appPath('/game/aetherii/dragon.webp')} alt="" draggable={false}/>
      <div>
        <strong className="rules-goal">10 PZ</strong>
        <p>Kroniki Aetherii: Korona i Cień · 2–4 graczy. Cel: 10 PZ we własnej turze. Gdy najazd jest aktywny, zwycięstwo sprawdzamy dopiero po bitwie. Kataklizm oznacza porażkę wszystkich.</p>
      </div>
    </section>

    <Section icon={<LayersIcon/>} title="Przygotowanie">
      <Chips items={['Plansza 19 · 23 · 25', '1 pustkowie', '2 Strażnice + 2 Trakty']}/>
      <p>Wybierz planszę 19, 23 lub 25 heksów. W pokoju ze znajomymi możesz zastąpić 1–3 graczy przez SI. Jedno pole jest pustkowiem bez numeru i nie produkuje surowców. Każdy wybiera inną frakcję. Rozstawcie po 2 Strażnice i 2 Trakty w kolejności wężykowej. Surowce otrzymujesz wyłącznie z heksów przy drugiej Strażnicy.</p>
    </Section>

    <Section icon={<TimerIcon/>} title="Tura">
      <ol className="rules-steps">{turnSteps.map((t, i) => <li key={t}><b>{i + 1}</b><span>{t}</span></li>)}</ol>
      <p className="rules-callout"><strong>Dublet:</strong> każdy dublet daje obowiązkowy kolejny rzut; rzucaj do pierwszego wyniku bez pary.</p>
      <p>Strażnica produkuje 1, Cytadela 2. Gdy bank nie pokrywa całego zapotrzebowania, nikt nie dostaje danego surowca.</p>
      <div className="rules-odds"><span className="rules-token hot">6</span><span className="rules-token hot">8</span><p>Czerwone 6 i 8 oznaczają najczęstsze wyniki produkujące surowce: każdy ma szansę 5/36 (około 13,9%).</p></div>
    </Section>

    <Section icon={<LightningBoltIcon/>} title="Najazd">
      <Chips items={['Zagrożenie +20%', 'Surowiec = 1 Pancerza', 'Mitril Krasnoludów = 2']}/>
      <p>Przy 7 nie ma produkcji; mając ponad 7 kart, oddajesz połowę w dół. Zagrożenie rośnie o 20%. Pierwsza siódemka uruchamia bitwę po jednej rundzie, na koniec tury gracza poprzedzającego aktywującego. Kolejne siódemki zwiększają zagrożenie, bez zmiany terminu. Wpłaty są nieodwracalne: każdy surowiec daje 1 Pancerza, Mitril Krasnoludów daje 2.</p>
    </Section>

    <Section icon={<StarIcon/>} title="Frakcje">
      <div className="rules-factions">{(Object.entries(factions) as [Faction, typeof factions[Faction]][]).map(([id, f]) =>
        <div key={id} className="rules-faction" data-faction={id}>
          <span className="faction-art"><img src={watchtowerImage(id)} alt="" draggable={false}/></span>
          <span className="faction-text"><strong>{f.name}</strong><small>{f.description}</small></span>
        </div>)}
      </div>
    </Section>

    <Section icon={<TargetIcon/>} title="Bitwa">
      <Chips items={['Pancerz = gracze × 3']}/>
      <p>Potrzebujecie Pancerza równego liczbie graczy × 3. Zwycięstwo zeruje zagrożenie. Największy wkład daje 1 PZ Bohatera Aetherii; remisujący zamiast PZ dostają po Karcie Magii, o ile talia wystarcza.</p>
      <p>Porażka przy 100% zagrożenia i co najmniej jednej poprzedniej porażce z rzędu wywołuje Kataklizm. Inaczej najmniejszy wkład oznacza utratę Traktu (przy remisie karę otrzymują wszyscy remisujący); bez Traktów traci się połowę surowców. Wpłata Ziół Elfów Leśnych chroni jeden Trakt. Następna pełna runda przynosi każdemu o 1 surowiec mniej przy każdym rzucie. Zagrożenie spada do 20%.</p>
    </Section>

    <Section icon={<CubeIcon/>} title="Budowa i handel">
      <ul className="rules-costs">{Object.entries(costs).map(([k, v]) => <li key={k}>
        <strong>{buildNames[k]}</strong>
        <span className="rules-price">{resources.filter(r => v[r]).map(r => <span key={r} className="rules-res" title={labels[r]}><img src={appPath(`/game/aetherii/icon-${r}.webp`)} alt={labels[r]} draggable={false}/><b>{v[r]}</b></span>)}</span>
        {buildPoints[k] && <em>{buildPoints[k]}</em>}
      </li>)}</ul>
      <p>Bank 4:1, porty 3:1 / 2:1. Strażnica: 1 PZ, Cytadela: 2 PZ. Limity: 15 Traktów, 5 Strażnic, 4 Cytadele. Najdłuższy Trakt nie daje dodatkowych punktów.</p>
    </Section>

    <Section icon={<MagicWandIcon/>} title="Karty Magii">
      <div className="rules-cards">{Object.entries(cardDescriptions).map(([k, v]) => <div key={k} className="rules-card"><strong>{cardNames[k]}</strong><span>{v}</span></div>)}</div>
      <p>Jedna karta akcji na turę, po rzucie, nie w turze zakupu. Runiczna Tarcza działa w mobilizacji.</p>
    </Section>

    <a className="rules-link" href="https://docs.google.com/document/d/1p6f3Cdwg4lqFfnI_wwpzwNWJxTPqIQF3SADTpmbqkEA/edit" target="_blank" rel="noreferrer"><ReaderIcon aria-hidden="true"/>Otwórz zasady Kronik Aetherii<ExternalLinkIcon aria-hidden="true"/></a>
  </div>;
}
