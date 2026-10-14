export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type Bag = Record<Resource, number>;
export interface Vertex { id: number; x: number; y: number; tiles: number[]; edges: number[]; owner: string | null; level: number }
export interface Edge { id: number; a: number; b: number; owner: string | null; tiles: number[] }
export interface Tile { id: number; x: number; y: number; resource: Resource | 'desert'; number: number; vertices: number[] }
export interface Card { id: string; type: string; bought: number }
export interface Player { bot: boolean; id: string; name: string; color: string; points: number; resources?: Bag; cards?: Card[]; resourceCount: number; cardCount: number; knights: number; roadLength: number }
export interface State { accountLinked: boolean; lastRoll: { dice: number[]; player: string; turn: number; resources: Bag } | null; code: string; host: string; practice: boolean; ai: boolean; maxPlayers: number; me: string; phase: string; active: number; revision: number; turn: number; bank: Bag; board: { tiles: Tile[]; vertices: Vertex[]; edges: Edge[]; ports: { id: number; type: Resource | 'any'; vertices: number[] }[] }; dice: number[] | null; robber: number; longest: string | null; army: string | null; winner?: string; built: boolean; playedCard: boolean; freeRoads: number; discard: Record<string, number>; victims: string[]; offers: { id: string; from: string; to: string | null; give: Bag; want: Bag }[]; deckCount: number; log: { text: string; turn: number }[]; legal: { settlements: number[]; roads: number[]; cities: number[]; robber: number[] }; players: Player[]; rates: Bag }
export const resources: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const labels: Record<Resource, string> = { wood: 'Drewno', brick: 'Glina', sheep: 'Wełna', wheat: 'Zboże', ore: 'Ruda' };
export const blankBag = (): Bag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const costs: Record<string, Partial<Bag>> = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
export const cardNames: Record<string, string> = { knight: 'Rycerz', roads: 'Budowa dróg', plenty: 'Rok urodzaju', monopoly: 'Monopol', point: 'Punkt zwycięstwa' };

export const cardDescriptions: Record<string, string> = {
  knight: 'Przesuń złodzieja na inny teren produkcyjny. Wybierz sąsiadującego przeciwnika i zabierz mu jedną losową kartę surowca. Zagrani rycerze liczą się do największej armii.',
  roads: 'Postaw do dwóch dróg bez opłat. Każda musi łączyć się z Twoją siecią i spełniać zwykłe zasady budowy. Nie przekraczaj limitu 15 dróg.',
  plenty: 'Weź z banku dwa wybrane surowce, jednakowe lub różne. Możesz wybrać tylko dostępne karty; jeśli została jedna, weź jedną.',
  monopoly: 'Wybierz jeden rodzaj surowca. Wszyscy przeciwnicy oddają Ci wszystkie karty tego rodzaju ze swojej ręki.',
  point: 'Daje 1 punkt zwycięstwa od razu. Pozostaje ukryty przed przeciwnikami do końca gry. Tej karty nie zagrywasz.',
};
