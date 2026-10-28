import { appPath } from './app-path';
export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type Bag = Record<Resource, number>;
export interface Vertex { id: number; x: number; y: number; tiles: number[]; edges: number[]; owner: string | null; level: number }
export interface Edge { id: number; a: number; b: number; owner: string | null; tiles: number[] }
export interface Tile { id: number; x: number; y: number; resource: Resource | 'desert'; number: number; vertices: number[] }
export interface Card { id: string; type: string; bought: number }
export type Faction = 'dwarves' | 'rock-elves' | 'forest-elves' | 'humans';
export const factions: Record<Faction, { name: string; description: string }> = {
  dwarves: { name: 'Krasnoludy z Podziemi', description: 'Każdy Mitril w obronie daje 2 Pancerza.' },
  'rock-elves': { name: 'Elfy Skalne', description: 'Kamienne Echo: raz na najazd opóźnij bitwę o 1 turę.' },
  'forest-elves': { name: 'Elfy Leśne', description: 'Wpłata Eterycznych Ziół chroni jeden Twój Trakt przy porażce.' },
  humans: { name: 'Ludzie z Równin', description: 'Pierwsza wpłata w najazdzie daje darmowy surowiec. Nie wpłacisz go ponownie w tej fazie.' },
};
export const watchtowerImage = (faction: Faction) => appPath(`/game/aetherii/watchtower-${faction}.webp`);
export interface Contribution { resources: Bag; armor: number; rewarded: boolean }
export interface Raid { started: number; dueTurn: number; delayed: boolean; contributions: Record<string, Contribution> }
export interface Battle { won: boolean; strength: number; required: number; turn: number; heroes: string[]; punished: string[] }
export interface Player { faction: Faction; heroPoints: number; lockedReward?: Partial<Bag>; bot: boolean; id: string; name: string; color: string; points: number; resources?: Bag; cards?: Card[]; resourceCount: number; cardCount: number; knights: number; roadLength: number }
export interface State { communication?: { enabled: boolean; approved: boolean; voice: boolean; closed: boolean }; bonusRoll: boolean; boardSize: number; botCount: number; humanLimit: number; threat: number; raid: Raid | null; lastBattle: Battle | null; consecutiveDefeats: number; penaltyTurns: number; cataclysm: boolean; accountLinked: boolean; lastRoll: { dice: number[]; player: string; turn: number; resources: Bag } | null; code: string; host: string; practice: boolean; ai: boolean; maxPlayers: number; me: string; phase: string; active: number; revision: number; turn: number; bank: Bag; board: { hexRadius?: number; tiles: Tile[]; vertices: Vertex[]; edges: Edge[]; ports: { id: number; type: Resource | 'any'; vertices: number[] }[] }; dice: number[] | null; robber: number | null; longest: string | null; army: string | null; winner?: string; built: boolean; playedCard: boolean; freeRoads: number; discard: Record<string, number>; victims: string[]; offers: { id: string; from: string; to: string | null; give: Bag; want: Bag }[]; deckCount: number; log: { text: string; turn: number }[]; legal: { settlements: number[]; roads: number[]; cities: number[]; robber: number[] }; players: Player[]; rates: Bag }
export const resources: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const labels: Record<Resource, string> = { wood: 'Pradawne Drewno', brick: 'Runiczny Kamień', sheep: 'Eteryczne Zioła', wheat: 'Zapasy', ore: 'Mitril' };
export const shortLabels: Record<Resource, string> = { wood: 'Drewno', brick: 'Kamień', sheep: 'Zioła', wheat: 'Zapasy', ore: 'Mitril' };
export const blankBag = (): Bag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const costs: Record<string, Partial<Bag>> = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
export const cardNames: Record<string, string> = { ward: 'Runiczna Tarcza', roads: 'Magiczne Trakty', plenty: 'Dar Aetherii', monopoly: 'Zew Żywiołów', point: 'Kronika Chwały' };

export const cardDescriptions: Record<string, string> = {
  ward: 'Dodaj 2 Pancerza do swojego wkładu w aktualnym najazdzie. Zagraj po rzucie, przed budową. Liczy się do nagrody Bohatera Aetherii.',
  roads: 'Postaw do dwóch Traktów Handlowych bez opłat. Każdy musi łączyć się z Twoją siecią. Limit: 15 Traktów.',
  plenty: 'Weź z banku dwa wybrane surowce, jednakowe lub różne. Możesz wybrać tylko dostępne karty; jeśli została jedna, weź jedną.',
  monopoly: 'Wybierz jeden rodzaj surowca. Wszyscy przeciwnicy oddają Ci wszystkie karty tego rodzaju ze swojej ręki.',
  point: 'Daje 1 punkt zwycięstwa od razu. Pozostaje ukryty przed przeciwnikami do końca gry. Tej karty nie zagrywasz.',
};
