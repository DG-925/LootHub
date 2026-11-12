// Subscription prices. No public API exists for these, so they're maintained by hand.
// Standard US prices; they vary by region. Update CHECKED when you re-verify.
export const SUBS_CHECKED = '2026-11';

export const SUBS = [
  { id: 'nitro', name: 'Discord Nitro', logo: 'discord', color: '#5865F2', cat: 'discord', price: 9.99, yearly: 99.99, url: 'https://discord.com/nitro', perks: ['HD screen share & bigger uploads', 'Custom emoji & stickers everywhere', '2 Server Boosts included'], promo: 'Free trials appear often — check the Nitro page and Epic\'s promos' },
  { id: 'nitro-basic', name: 'Discord Nitro Basic', logo: 'discord', color: '#5865F2', cat: 'discord', price: 2.99, yearly: 29.99, url: 'https://discord.com/nitro', perks: ['Custom emoji everywhere', 'Bigger uploads', 'Nitro badge'] },
  { id: 'boost', name: 'Discord Server Boost', logo: 'discord', color: '#ff73fa', cat: 'discord', price: 4.99, url: 'https://discord.com/nitro', perks: ['Boost a server\'s perks', '30% off with Nitro', 'Better audio & emoji slots'] },
  { id: 'gpu', name: 'Xbox Game Pass Ultimate', logo: 'xbox', color: '#107c10', cat: 'library', price: 29.99, url: 'https://www.xbox.com/xbox-game-pass', perks: ['Day-one games on PC & console', 'EA Play & Ubisoft+ Classics', 'Cloud gaming'] },
  { id: 'pcgp', name: 'PC Game Pass', logo: 'xbox', color: '#107c10', cat: 'library', price: 16.49, url: 'https://www.xbox.com/xbox-game-pass/pc-game-pass', perks: ['Hundreds of PC games', 'Day-one releases', 'EA Play included'] },
  { id: 'eaplay', name: 'EA Play', logo: 'ea', color: '#ff4747', cat: 'library', price: 5.99, yearly: 39.99, url: 'https://www.ea.com/ea-play', perks: ['Vault of EA games', '10-hour trials of new games', '10% off EA purchases'] },
  { id: 'ubiplus', name: 'Ubisoft+ Premium', logo: 'ubi', color: '#0070ff', cat: 'library', price: 17.99, url: 'https://www.ubisoft.com/ubisoft-plus', perks: ['New releases on day one', 'Premium editions & DLC', '100+ PC games'] },
  { id: 'ubiclassics', name: 'Ubisoft+ Classics', logo: 'ubi', color: '#0070ff', cat: 'library', price: 7.99, url: 'https://www.ubisoft.com/ubisoft-plus', perks: ['Catalog of Ubisoft classics', 'Monthly rewards', '20% off Ubisoft Store'] },
  { id: 'humble', name: 'Humble Choice', logo: 'humble', color: '#cb272c', cat: 'library', price: 11.99, url: 'https://www.humblebundle.com/membership', perks: ['A set of games every month', 'Keep them forever', 'Up to 20% off Humble Store'] },
  { id: 'prime', name: 'Amazon Prime (Prime Gaming)', logo: 'amz', color: '#ff9900', fg: '#1a1a1a', cat: 'streaming', price: 14.99, yearly: 139, url: 'https://gaming.amazon.com', perks: ['Free games every month', 'In-game loot drops', 'Free Twitch channel sub'] },
  { id: 'turbo', name: 'Twitch Turbo', logo: 'twitch', color: '#9146FF', cat: 'streaming', price: 11.99, url: 'https://www.twitch.tv/turbo', perks: ['Ad-free Twitch', 'Extra emote sets', 'Turbo chat badge'] },
  { id: 'psplus', name: 'PlayStation Plus Essential', logo: 'playstation', color: '#0070d1', cat: 'library', price: 9.99, yearly: 79.99, url: 'https://www.playstation.com/ps-plus/', perks: ['Monthly games to keep', 'Online multiplayer', 'Member discounts'] },
];
