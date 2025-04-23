class ApiConfig {
  // Base URL seems correct for the overall structure
  static const String baseApiUrl = 'https://pokemon-go-api.github.io/pokemon-go-api/api';

  // Construct URLs directly from the base API URL, removing the extra 'v1'
  static const String pokedexUrl = '$baseApiUrl/pokedex.json';
  static const String raidBossUrl = '$baseApiUrl/raidboss.json';
  static const String questsUrl = '$baseApiUrl/quests.json';

  // Fallback Image URLs (Example using official artwork)
  static String fallbackPokemonImageUrl(int dexNr) =>
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/$dexNr.png';

  // You might need a different source for icons if the official artwork is too large
  static String fallbackPokemonIconUrl(int dexNr) =>
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/$dexNr.png'; // Smaller sprite
}
