import 'package:mydexpogo/data/models/pokemon.dart';
import 'package:mydexpogo/data/models/pokemon_asset_form.dart';
import 'package:mydexpogo/config/api_config.dart'; // ** ADDED IMPORT **

// Helper class to represent a specific displayable variation in the Pokedex
class PokemonVariation {
  final Pokemon basePokemon;
  final PokemonAssetForm? assetForm; // Null for the base form/image
  final bool isShiny; // Is this variation representing the shiny version?

  PokemonVariation({
    required this.basePokemon,
    this.assetForm,
    this.isShiny = false,
  });

  // --- Getters to simplify access in UI ---

  int get dexNr => basePokemon.dexNr;
  Map<String, String> get names => basePokemon.names;
  String? get form => assetForm?.form;
  String? get costume => assetForm?.costume;
  bool? get isFemaleAsset => assetForm?.isFemale; // If asset specifically represents female

  String get variationKey {
     // Creates a unique key for this specific variation (normal or shiny)
     // Format: dexNr_form_costume_isFemaleAsset_isShiny
     // Note: isFemaleAsset refers to the specific asset, not collected status
     return '${basePokemon.dexNr}_${form ?? 'base'}_${costume ?? 'none'}_${isFemaleAsset ?? false}_$isShiny';
  }

  String displayName(String locale) { // Pass locale for accurate naming
      // Construct display name (e.g., "Bulbizarre (Party Hat)", "Bulbizarre (Shiny)")
      String name = basePokemon.localizedName(locale); // Use passed locale
      List<String> details = [];
      if (form != null) details.add(form!);
      if (costume != null) details.add(costume!);
      if (isFemaleAsset == true) details.add("Female"); // TODO: Localize "Female"
      if (isShiny) details.add("Shiny"); // TODO: Localize "Shiny"

      if (details.isNotEmpty) {
          name += ' (${details.join(' ')})';
      }
      return name;
  }

   String getImageUrl() {
       String? url;
       if (isShiny) {
           url = assetForm?.shinyImage ?? basePokemon.assets?.shinyImage;
       } else {
           url = assetForm?.image ?? basePokemon.assets?.image;
       }
       // Fallback logic
       url ??= isShiny
           ? basePokemon.getShinyImageUrl(form: form, costume: costume, isFemale: isFemaleAsset) // Use base helper as fallback
           : basePokemon.getImageUrl(form: form, costume: costume, isFemale: isFemaleAsset);

       // Final fallback to generic icon if everything else fails
       return url ?? ApiConfig.fallbackPokemonIconUrl(dexNr); // Use ApiConfig now
   }

   // Add other getters if needed (e.g., types from basePokemon)
}
