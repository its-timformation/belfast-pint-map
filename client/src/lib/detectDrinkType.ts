export type DrinkType = 'draft_beer' | 'bottled_beer' | 'canned_beer' | 'wine' |
  'cocktail' | 'shot' | 'spirit' | 'vin_chaud' | 'other';

const DRAFT_PATTERNS = [
  /draught|draft|pression|\bpint\b/i,
  /kronenbourg|1664|heineken|carlsberg|stella|leffe|hoegaarden|murphy/i,
  /guinness|kilkenny|mahou|tiger|san miguel/i,
  // Northern Irish & UK draught names
  /tennent|harp\b|smithwick|bass\b|caffreys|magners|strongbow|bulmers/i,
  // NI / Irish craft breweries
  /whitewater|boundary brewing|hilden|bullhouse|farmageddon|lacada|knockout brewing/i,
];
const BOTTLED_PATTERNS = [
  /\bbottle\b|bouteille|corona|peroni|desperados|brooklyn/i,
  /ipa|pale ale|lager|bière artisanale|blonde du/i,
  /magners bottle/i,
];
const CANNED_PATTERNS = [/\bcan\b|\bcanned\b/i];
const WINE_PATTERNS = [
  /wine|vin\b|vino|rouge|blanc|rosé|rose|champagne|prosecco|cava|moët|chandon|kir\b/i,
  /pinot|chardonnay|sauvignon|merlot|cabernet|bordeaux|bourgogne/i,
  /spritz|hugo|aperol spritz|saint germain|limoncello spritz/i,
];
const COCKTAIL_PATTERNS = [
  /mojito|cosmopolitan|margarita|daiquiri|negroni|manhattan|old fashioned/i,
  /long island|pina colada|bellini|aperol|spritz|moscow mule/i,
  /sex on the|gin tonic|vodka|rum|tequila sunrise/i,
  /cocktail|virgin|sans alcool|without alcohol/i,
];
const SHOT_PATTERNS = [
  /shot|shooter|jager|jäger|sambuca|tequila\b|genepi|génépi/i,
  /baby guinness|bomb|jagerbomb|b52/i,
  /shooters d'alcool/i,
];
const SPIRIT_PATTERNS = [
  /whisky|whiskey|bourbon|scotch|jameson|jack daniel|glenfiddich/i,
  /\bbushmills\b|\bpowers\b|\bredbreast\b/i,
  /gin\b|vodka\b|rum\b|bacardi|smirnoff|absolut|tanqueray|hendricks/i,
  /cognac|brandy|armagnac|calvados|marc\b|eau de vie/i,
  /ricard|pastis|pernod|suze|campari|martini\b/i,
];
const VIN_CHAUD_PATTERNS = [/vin chaud|mulled wine|glühwein|grog|jägertee|hot wine/i];
const PICON_PATTERNS = [/picon|bière sirop|bierre sirop/i];

/**
 * Craft beer detection — style names + NI/Belfast brewery names.
 * Does not change the DrinkType enum; use alongside detectDrinkType().
 * A craft beer is still typed as draft_beer/bottled_beer/canned_beer.
 */
const CRAFT_STYLE_PATTERNS = [
  // IPA family
  /\bipa\b|\bdipa\b|\bneipa\b|\bwcipa\b/i,
  /session ipa|west coast ipa|east coast ipa|hazy ipa|juicy ipa/i,
  // Pale ales
  /\bpale ale\b|\bapa\b|\bxpa\b/i,
  // Stouts & porters (non-macro)
  /\bporter\b|milk stout|oatmeal stout|imperial stout|baltic porter/i,
  /dry stout|export stout|cream stout/i,
  // Sours & wild
  /\bgose\b|\bsour\b|berliner weisse|kettle sour|lambic|gueuze/i,
  // Wheat & Belgian
  /\bwitbier\b|\bhefeweizen\b|wheat beer|\bsaison\b|belgian/i,
  // Amber & red ales
  /amber ale|red ale|irish red|\bcream ale\b/i,
  // Session
  /session ale|session beer/i,
  // Craft lager
  /craft lager|craft pilsner|unfiltered lager/i,
  // Named Belfast / NI craft breweries
  /\bwhitewater\b|belfast ale|maggie'?s leap|clotworthy dobbin/i,
  /\bboundary\b|\bhilden\b|\bbullhouse\b|\bfarmageddon\b/i,
  /\blacada\b|knockout brew/i,
  // Generic craft markers
  /small batch|local brew|rotating tap|tap room special|craft beer/i,
];

export function isCraftBeer(name: string): boolean {
  return CRAFT_STYLE_PATTERNS.some(p => p.test(name));
}

export function detectDrinkType(name: string): DrinkType {
  if (VIN_CHAUD_PATTERNS.some(p => p.test(name))) return 'vin_chaud';
  if (PICON_PATTERNS.some(p => p.test(name))) return 'draft_beer';
  if (SHOT_PATTERNS.some(p => p.test(name))) return 'shot';
  if (WINE_PATTERNS.some(p => p.test(name))) return 'wine';
  if (COCKTAIL_PATTERNS.some(p => p.test(name))) return 'cocktail';
  if (SPIRIT_PATTERNS.some(p => p.test(name))) return 'spirit';
  if (CANNED_PATTERNS.some(p => p.test(name))) return 'canned_beer';
  if (BOTTLED_PATTERNS.some(p => p.test(name))) return 'bottled_beer';
  if (DRAFT_PATTERNS.some(p => p.test(name))) return 'draft_beer';
  return 'other';
}

export const DRINK_TYPE_LABELS: Record<DrinkType, string> = {
  draft_beer: 'DRAFT BEER',
  bottled_beer: 'BOTTLED BEER',
  canned_beer: 'CANNED BEER',
  wine: 'WINE & CHAMPAGNE',
  cocktail: 'COCKTAILS',
  shot: 'SHOTS & SHOOTERS',
  spirit: 'SPIRITS',
  vin_chaud: 'VIN CHAUD & HOT',
  other: 'OTHER',
};

export function parseSizeValue(size: string | null): number {
  if (!size) return 9999;
  const clMatch = size.match(/^(\d+(?:\.\d+)?)\s*CL$/i);
  if (clMatch) return parseFloat(clMatch[1]);
  const lMatch = size.match(/^(\d+(?:\.\d+)?)\s*L$/i);
  if (lMatch) return parseFloat(lMatch[1]) * 100;
  const named: Record<string, number> = {
    'pint': 56.8, 'half': 28.4, 'third': 18.9, 'glass': 20, 'bottle': 33,
    'can': 33, 'shot': 2.5, 'cup': 15, 'mug': 25, 'jug': 200, 'pichet': 200,
  };
  const lower = size.toLowerCase();
  if (lower in named) return named[lower];
  return 9998;
}

export const DRINK_TYPE_ORDER: DrinkType[] = [
  'draft_beer', 'bottled_beer', 'canned_beer', 'wine',
  'cocktail', 'shot', 'spirit', 'vin_chaud', 'other',
];
