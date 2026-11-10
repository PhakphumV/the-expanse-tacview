// Generated from the scenario store (data/scenarios/*.json). Do not edit by hand.
// Scenario manifest only — the payloads live in js/scenario-<id>.js
window.TacviewManifest = {
  "scenarios": [
    {
      "id": "leo",
      "name": "Low Earth Orbit",
      "description": "ISS and Tiangong (CSS) in low Earth orbit, with the Moon orbiting Earth (celestial track, one revolution per replay).",
      "menu_order": 1,
      "tracks": 3,
      "events": 0,
      "samples": 2549,
      "bytes": 433903
    },
    {
      "id": "apollo11",
      "name": "Apollo 11 — Lunar Landing",
      "description": "Apollo 11, 16-24 July 1969: launch through splashdown, with the Moon on its real geocentric ephemeris. Through the surface stay: launch, ascent, parking orbit, TLI, the trans-lunar coast, lunar orbit insertion, the LM undocking and powered descent to touchdown, and the EVA on the surface.",
      "epoch": "1969-07-16T13:32:00Z",
      "duration_s": 703115,
      "default_speed": 512,
      "default_target": "earth",
      "view_distance_m": 14000000,
      "menu_order": 2,
      "tracks": 3,
      "events": 25,
      "samples": 12605,
      "bytes": 1993526
    },
    {
      "id": "apollo13",
      "name": "Apollo 13 — Abort Mission",
      "description": "Apollo 13, 11-17 April 1970: launch through splashdown after the oxygen-tank explosion. The launch, the hybrid translunar coast, the accident at 55:54 GET, the two LM descent-engine burns that turn the trajectory back to Earth, the lunar flyby, and the return and entry of Odyssey and Aquarius.",
      "epoch": "1970-04-11T19:13:00Z",
      "duration_s": 514481,
      "default_speed": 512,
      "default_target": "earth",
      "view_distance_m": 14000000,
      "menu_order": 3,
      "tracks": 4,
      "events": 15,
      "samples": 8302,
      "bytes": 1326102
    },
    {
      "id": "artemis1",
      "name": "Artemis I — Distant Retrograde Orbit",
      "description": "Artemis I, 16 Nov – 11 Dec 2022: SLS/Orion launch, trans-lunar injection, the outbound powered flyby, a six-day distant retrograde orbit about the Moon, the return flyby, and Pacific splashdown.",
      "epoch": "2022-11-16T06:47:44Z",
      "duration_s": 2203247,
      "default_speed": 512,
      "default_target": "earth",
      "view_distance_m": 24000000,
      "menu_order": 4,
      "tracks": 2,
      "events": 6,
      "samples": 3024,
      "bytes": 476466
    }
  ]
};
