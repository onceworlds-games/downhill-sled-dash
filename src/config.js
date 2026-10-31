// Shared numbers, names and content. Pure.

export const SLUG = 'downhill-sled-dash';

// Track space: d is the distance down the slope in metres, x the lateral offset from the track centre.
export const HALF = 12; // the sled stays within +-HALF
export const PLAYER_R = 0.7;
export const SIM_DT = 1 / 120;

export const G = 24; // gravity for hops and big air (m/s^2)
export const HOP_V = 8.2;
export const SPIN_RATE = 7.4; // rad/s
export const START_V = 6;
export const BOOST_MULT = 1.38;
export const BOOST_TIME = 4;
export const MAGNET_TIME = 8;
export const X2_TIME = 10;
export const MAGNET_RADIUS = 11;
export const CLEAN_LANDING = 0.8; // radians of crookedness that still counts as clean
export const CAM_DAY_LENGTH = 7000; // metres in one day

/** Lowest speed target (m/s) at a distance. Starts at 14, ~37 at 3 km, soft cap near 39. */
export function speedAt(d) {
  return 14 + 25 * (1 - Math.exp(-Math.max(0, d) / 1100));
}

/** How fast the sled can shift sideways at full steer. */
export function vmaxLat(v) {
  return 8.5 + 0.09 * v;
}

/** Longest hop-to-hop gap a log row needs (metres) at speed v: a hop's air time plus a little. */
export function hopSpacing(v) {
  return 0.75 * v + 6;
}

/** Distance covered by a ramp launch at speed v. */
export function launchVy(v) {
  return 0.22 * v + 4.5;
}
export function airDistance(v) {
  return v * ((2 * launchVy(v)) / G);
}

export const SLEDS = [
  { id: 'wood', name: 'Pinewood', price: 0, blurb: 'Classic runners' },
  { id: 'redline', name: 'Redline', price: 180, blurb: 'Racing toboggan' },
  { id: 'ring', name: 'Big Ring', price: 400, blurb: 'Snow tube' },
  { id: 'steel', name: 'Steel Arrow', price: 800, blurb: 'Bobsled' },
  { id: 'skimmer', name: 'Skimmer', price: 1400, blurb: 'Board' },
  { id: 'aurum', name: 'Aurum', price: 3000, blurb: 'Gilded' },
];

// [jacket, scarf, helmet]
export const OUTFITS = [
  { id: 'signal', name: 'Signal', jacket: 0xff5b1f, scarf: 0xf3f8ff, helmet: 0x0e1a2b },
  { id: 'glacier', name: 'Glacier', jacket: 0x2d7fe0, scarf: 0xffc43d, helmet: 0xf3f8ff },
  { id: 'pine', name: 'Pine', jacket: 0x1d7a55, scarf: 0xff5b1f, helmet: 0xf3f8ff },
  { id: 'berry', name: 'Berry', jacket: 0xc2255c, scarf: 0xf3f8ff, helmet: 0x0e1a2b },
  { id: 'sun', name: 'Sun', jacket: 0xffc43d, scarf: 0x0e1a2b, helmet: 0x2d7fe0 },
  { id: 'slate', name: 'Slate', jacket: 0x39465e, scarf: 0xff5b1f, helmet: 0xff5b1f },
];

export const BADGES = [
  { id: 'first-km', name: 'First Kilometre', description: 'Reach 1,000 m.' },
  { id: 'night-rider', name: 'Night Rider', description: 'Reach the night (4,500 m).' },
  { id: 'double-spin', name: 'Double Spin', description: 'Land a 720 in one jump.' },
  { id: 'gate-master', name: 'Gate Master', description: 'Pass 10 gates in a row.' },
  { id: 'collector', name: 'Collector', description: 'Own every sled.' },
  { id: 'untouchable', name: 'Untouchable', description: 'Reach 2,000 m without using a shield.' },
];

export const POWERS = {
  magnet: { name: 'Magnet', color: 0xe0283c, time: MAGNET_TIME },
  shield: { name: 'Shield', color: 0x2d9bf0, time: 0 },
  boost: { name: 'Boost', color: 0xff5b1f, time: BOOST_TIME },
  x2: { name: 'x2', color: 0xffc43d, time: X2_TIME },
};
export const POWER_TYPES = ['magnet', 'shield', 'boost', 'x2'];
