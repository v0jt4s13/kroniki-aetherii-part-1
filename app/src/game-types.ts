import { tr } from './i18n';
import { appPath } from './app-path';
export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type Bag = Record<Resource, number>;
export interface Vertex { id: number; x: number; y: number; tiles: number[]; edges: number[]; owner: string | null; level: number }
export interface Edge { id: number; a: number; b: number; owner: string | null; tiles: number[] }
export interface Tile { id: number; x: number; y: number; resource: Resource | 'desert'; number: number; vertices: number[] }
export interface Card { id: string; type: string; bought: number }
export type Faction = 'dwarves' | 'rock-elves' | 'forest-elves' | 'humans';
export const factions: Record<Faction, { name: string; description: string }> = {
  dwarves: { get name() { return tr("ui.dwarves_of_the_depths"); }, get description() { return tr("ui.each_mithril_contributed_to_defense_grants_2_armor"); } },
  'rock-elves': { get name() { return tr("ui.stone_elves"); }, get description() { return tr("ui.stone_echo_delay_the_battle_by_1_turn_once_per_raid"); } },
  'forest-elves': { get name() { return tr("ui.forest_elves"); }, get description() { return tr("ui.contributing_ethereal_herbs_protects_one_of_your_trade_routes_on"); } },
  humans: { get name() { return tr("ui.humans_of_the_plains"); }, get description() { return tr("ui.your_first_contribution_in_a_raid_grants_a_free_resource_you_cann"); } },
};
export const watchtowerImage = (faction: Faction) => appPath(`/game/aetherii/watchtower-${faction}.webp`);
export interface Contribution { resources: Bag; armor: number; rewarded: boolean }
export interface Raid { started: number; dueTurn: number; delayed: boolean; contributions: Record<string, Contribution> }
export interface Battle { won: boolean; strength: number; required: number; turn: number; heroes: string[]; punished: string[] }
export interface Player { faction: Faction; heroPoints: number; lockedReward?: Partial<Bag>; bot: boolean; id: string; name: string; color: string; points: number; resources?: Bag; cards?: Card[]; resourceCount: number; cardCount: number; knights: number; roadLength: number }
export interface State { communication?: { enabled: boolean; approved: boolean; voice: boolean; closed: boolean }; bonusRoll: boolean; boardSize: number; botCount: number; humanLimit: number; threat: number; raid: Raid | null; lastBattle: Battle | null; consecutiveDefeats: number; penaltyTurns: number; cataclysm: boolean; accountLinked: boolean; lastRoll: { dice: number[]; player: string; turn: number; resources: Bag } | null; code: string; host: string; practice: boolean; ai: boolean; maxPlayers: number; me: string; phase: string; active: number; revision: number; turn: number; bank: Bag; board: { hexRadius?: number; tiles: Tile[]; vertices: Vertex[]; edges: Edge[]; ports: { id: number; type: Resource | 'any'; vertices: number[] }[] }; dice: number[] | null; robber: number | null; longest: string | null; army: string | null; winner?: string; built: boolean; playedCard: boolean; freeRoads: number; discard: Record<string, number>; victims: string[]; offers: { id: string; from: string; to: string | null; give: Bag; want: Bag }[]; deckCount: number; log: { text: string; turn: number; message?: { key: string; args?: unknown[] } }[]; legal: { settlements: number[]; roads: number[]; cities: number[]; robber: number[] }; players: Player[]; rates: Bag }
export const resources: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const labels: Record<Resource, string> = { get wood() { return tr("ui.ancient_timber"); }, get brick() { return tr("ui.runic_stone"); }, get sheep() { return tr("ui.ethereal_herbs"); }, get wheat() { return tr("ui.supplies"); }, get ore() { return tr("ui.mithril"); } };
export const shortLabels: Record<Resource, string> = { get wood() { return tr("ui.timber"); }, get brick() { return tr("ui.stone"); }, get sheep() { return tr("ui.herbs"); }, get wheat() { return tr("ui.supplies"); }, get ore() { return tr("ui.mithril"); } };
export const blankBag = (): Bag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const costs: Record<string, Partial<Bag>> = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
export const cardNames: Record<string, string> = { get ward() { return tr("ui.runic_shield"); }, get roads() { return tr("ui.magic_routes"); }, get plenty() { return tr("ui.gift_of_aetheria"); }, get monopoly() { return tr("ui.call_of_the_elements"); }, get point() { return tr("ui.chronicle_of_glory"); } };

export const cardDescriptions: Record<string, string> = {
  get ward() { return tr("ui.add_2_armor_to_your_contribution_in_the_current_raid_play_after_r"); },
  get roads() { return tr("ui.build_up_to_two_trade_routes_for_free_each_must_connect_to_your_n"); },
  get plenty() { return tr("ui.take_two_resources_of_your_choice_from_the_bank_matching_or_diffe"); },
  get monopoly() { return tr("ui.choose_a_resource_type_all_opponents_give_you_all_cards_of_that_t"); },
  get point() { return tr("ui.grants_1_victory_point_immediately_hidden_from_opponents_until_th"); },
};
