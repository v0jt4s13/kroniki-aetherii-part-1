import { tr } from './i18n';
import type { ReactNode } from 'react';
import { CubeIcon, ExternalLinkIcon, LayersIcon, LightningBoltIcon, MagicWandIcon, ReaderIcon, StarIcon, TargetIcon, TimerIcon } from '@radix-ui/react-icons';
import { appPath } from './app-path';
import { cardDescriptions, cardNames, costs, factions, labels, resources, watchtowerImage, type Faction } from './game-types';


const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) =>
  <section className="rules-section"><h3><span className="rules-icon" aria-hidden="true">{icon}</span>{title}</h3>{children}</section>;
const Chips = ({ items }: { items: string[] }) => <ul className="rules-chips">{items.map(t => <li key={t}>{t}</li>)}</ul>;

// Same rules text as before, laid out as cards: goal, turn flow, costs with resource icons, faction crests.
export default function RulesPanel() {
  const buildNames: Record<string, string> = { road: tr("ui.trade_route"), settlement: tr("ui.watchtower"), city: tr("ui.citadel"), development: tr("ui.magic_card") };
  const buildPoints: Record<string, string> = { settlement: tr("ui.1_vp"), city: tr("ui.2_vp") };
  const turnSteps = [tr("ui.roll_2d6"), tr("ui.trade_and_mobilization"), tr("ui.building_and_magic"), tr("ui.battle_and_end_of_turn")];
  return <div className="rules">
    <section className="rules-hero">
      <img src={appPath('/game/aetherii/dragon.webp')} alt="" draggable={false}/>
      <div>
        <strong className="rules-goal">{tr("ui.10_vp")}</strong>
        <p>{tr("ui.chronicles_of_aetheria_crown_and_shadow_2_4_players_goal_10_vp_on")}</p>
      </div>
    </section>

    <Section icon={<LayersIcon/>} title={tr("ui.preparation")}>
      <Chips items={[tr("ui.board_19_23_25"), tr("ui.1_wasteland"), tr("ui.2_watchtowers_2_trade_routes")]}/>
      <p>{tr("ui.choose_a_board_of_19_23_or_25_hexes_in_a_friends_room_ai_can_repl")}</p>
    </Section>

    <Section icon={<TimerIcon/>} title={tr("ui.turn")}>
      <ol className="rules-steps">{turnSteps.map((t, i) => <li key={t}><b>{i + 1}</b><span>{t}</span></li>)}</ol>
      <p className="rules-callout"><strong>{tr("ui.doubles")}</strong> {' '}{tr("ui.every_double_grants_a_mandatory_extra_roll_keep_rolling_until_the")}</p>
      <p>{tr("ui.a_watchtower_produces_1_a_citadel_2_if_the_bank_cannot_meet_the_t")}</p>
      <div className="rules-odds"><span className="rules-token hot">6</span><span className="rules-token hot">8</span><p>{tr("ui.red_6_and_8_mark_the_most_likely_resource_producing_rolls_each_ha")}</p></div>
    </Section>

    <Section icon={<LightningBoltIcon/>} title={tr("ui.raid")}>
      <Chips items={[tr("ui.threat_20"), tr("ui.resource_1_armor"), tr("ui.dwarven_mithril_2")]}/>
      <p>{tr("ui.a_seven_produces_nothing_with_more_than_7_cards_return_half_round")}</p>
    </Section>

    <Section icon={<StarIcon/>} title={tr("ui.factions")}>
      <div className="rules-factions">{(Object.entries(factions) as [Faction, typeof factions[Faction]][]).map(([id, f]) =>
        <div key={id} className="rules-faction" data-faction={id}>
          <span className="faction-art"><img src={watchtowerImage(id)} alt="" draggable={false}/></span>
          <span className="faction-text"><strong>{f.name}</strong><small>{f.description}</small></span>
        </div>)}
      </div>
    </Section>

    <Section icon={<TargetIcon/>} title={tr("ui.battle")}>
      <Chips items={[tr("ui.armor_players_3")]}/>
      <p>{tr("ui.required_armor_equals_the_number_of_players_3_victory_resets_thre")}</p>
      <p>{tr("ui.defeat_at_100_threat_after_at_least_one_consecutive_defeat_trigge")}</p>
    </Section>

    <Section icon={<CubeIcon/>} title={tr("ui.building_and_trading")}>
      <ul className="rules-costs">{Object.entries(costs).map(([k, v]) => <li key={k}>
        <strong>{buildNames[k]}</strong>
        <span className="rules-price">{resources.filter(r => v[r]).map(r => <span key={r} className="rules-res" title={labels[r]}><img src={appPath(`/game/aetherii/icon-${r}.webp`)} alt={labels[r]} draggable={false}/><b>{v[r]}</b></span>)}</span>
        {buildPoints[k] && <em>{buildPoints[k]}</em>}
      </li>)}</ul>
      <p>{tr("ui.bank_4_1_ports_3_1_2_1_watchtower_1_vp_citadel_2_vp_limits_15_tra")}</p>
    </Section>

    <Section icon={<MagicWandIcon/>} title={tr("ui.magic_cards")}>
      <div className="rules-cards">{Object.entries(cardDescriptions).map(([k, v]) => <div key={k} className="rules-card"><strong>{cardNames[k]}</strong><span>{v}</span></div>)}</div>
      <p>{tr("ui.one_action_card_per_turn_after_rolling_never_on_the_turn_it_was_b")}</p>
    </Section>

    <a className="rules-link" href="https://docs.google.com/document/d/1p6f3Cdwg4lqFfnI_wwpzwNWJxTPqIQF3SADTpmbqkEA/edit" target="_blank" rel="noreferrer"><ReaderIcon aria-hidden="true"/>{tr("ui.open_the_chronicles_of_aetheria_rules")}<ExternalLinkIcon aria-hidden="true"/></a>
  </div>;
}
