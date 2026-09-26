# Zmeya Engagement Telemetry Plan

This document is a planning reference for updating `data/engagement.json` with a synthetic telemetry replay inspired by the Rocinante–Zmeya pursuit in *The Expanse* Season 5, Episode 7, "Oyedeng".

## Canonical sequence to preserve

1. Rocinante tracks and pursues Zmeya.
2. Zmeya attempts to escape under high acceleration.
3. Zmeya launches a large torpedo/missile barrage toward the pursuing Rocinante.
4. Rocinante launches two torpedoes first, intending to use their intercept explosions against the incoming barrage.
5. Only two incoming missiles are removed by the opening torpedo intercepts.
6. Rocinante switches to PDC defense.
7. Rocinante performs a rolling/spinning defensive maneuver while PDCs are on auto-track.
8. The rolling maneuver changes which PDCs can bear on incoming threats and distributes the defensive engagement around the ship.
9. One PDC jams during the defense; another PDC is brought to bear and the remaining missiles are destroyed.
10. After the missile defense, Rocinante uses its railgun against Zmeya's drive cone.

## Modeling principles

- The telemetry is **synthetic reconstruction**, not a frame-accurate measurement of the episode.
- Preserve the narrative order and tactical cause/effect rather than inventing false precision.
- Use a longer pursuit phase than the current 90-second prototype so the engagement reads as a chase rather than a head-on encounter.
- Model the Roci and Zmeya on approximately parallel pursuit trajectories with the Roci progressively closing range.
- Represent the defensive roll explicitly through ship orientation/angular velocity keyframes.
- Model the incoming barrage as a spread/helical threat field rather than a single straight-line missile.
- Model the Roci's two opening torpedoes as interceptors that destroy two incoming threats.
- Model the remaining incoming missiles as PDC targets.
- Include a PDC jam event and reallocation of defensive coverage to another PDC.
- Do not encode exact canon distances, accelerations, or timestamps unless supported by an explicit source.

## Suggested event phases

| Phase | Approx. replay window | Event intent |
|---|---:|---|
| Pursuit | 0–30% | Roci closes on Zmeya during sustained/high-G chase |
| Missile launch | 30–40% | Zmeya launches the defensive barrage |
| Torpedo intercept | 40–48% | Roci launches two torpedoes; two incoming missiles are destroyed |
| PDC defense | 48–75% | PDC auto-track + Roci rolling maneuver |
| PDC jam | 60–70% | One PDC becomes unavailable while missiles remain inbound |
| Final intercept | 70–80% | Remaining PDCs destroy the remaining incoming missiles |
| Railgun attack | 80–90% | Roci disables Zmeya's drive cone |
| Resolution | 90–100% | Boarding/self-destruct sequence represented as optional replay events |

## Telemetry entities

### Ships
- `roci`
- `zmeya`

Each ship should have keyframes for position, velocity, and orientation. Roci should show the pursuit/closure profile and a visible roll during the PDC defense phase. Zmeya should show sustained escape acceleration followed by the missile launch sequence and drive-cone damage.

### Roci torpedoes
- `roci_torp_01`
- `roci_torp_02`

These should launch immediately before the PDC phase and terminate at two separate intercept points in the incoming barrage.

### Zmeya torpedoes/missiles
Use unique IDs, e.g. `zmeya_torp_01` through `zmeya_torp_22`, if the implementation can support the full barrage cleanly.

The TV sequence is commonly documented as a 22-missile barrage, while other secondary references describe 23 launched missiles depending on whether the separate protomolecule-carrying escape torpedo is counted. For this visualization, keep the combat barrage at 22 and model the separate protomolecule escape object only if the product owner wants that narrative detail represented.

Threats should have varied launch offsets and trajectories forming a broad/helical screen around the Roci's pursuit vector.

### PDC rounds
PDC rounds should be represented as short-lived tracer entities only where visually useful. Avoid creating thousands of individual rounds. The data should instead identify PDC engagement windows/intercepts and let the renderer synthesize a controlled stream of rounds.

## Required tactical events

Recommended event records:

- `pursuit_start`
- `high_g_burn`
- `missile_lock`
- `zmeya_barrage_launch`
- `roci_torpedo_launch`
- `torpedo_intercept`
- `pdc_auto_track`
- `defensive_roll_start`
- `pdc_engagement`
- `pdc_jammed`
- `pdc_coverage_shift`
- `missile_intercept`
- `all_missiles_destroyed`
- `railgun_fire`
- `zmeya_drive_disabled`
- `engagement_resolution`

## Important implementation constraint

Do not hard-code the story into rendering logic. The engagement JSON should contain the event/telemetry data; the application should derive visual effects, labels, and playback behavior from that data.
