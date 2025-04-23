import 'package:mydexpogo/data/models/pokemon.dart';
import 'package:mydexpogo/data/models/pokemon_asset_form.dart';
import 'package:mydexpogo/config/api_config.dart';

// Represents a unique item displayed in the Pokedex list (Base form or specific costume/form)
class PokedexDisplayItem {
  final Pokemon basePokemon;
  final PokemonAssetForm? assetForm; // Null for the base form

  PokedexDisplayItem({
    required this.basePokemon,
    this.assetForm,
  });

  // --- Getters ---
  int get dexNr => basePokemon.dexNr;
  String? get form => assetForm?.form;
  String? get costume => assetForm?.costume;
  bool get hasShiny => basePokemon.hasShiny; // Shiny availability is based on the Pokemon

  // Unique key for selection purposes
  String get displayKey => '${basePokemon.dexNr}_${form ?? 'base'}_${costume ?? 'none'}';

  String displayName(String locale) {
      String name = basePokemon.localizedName(locale);
      List<String> details = [];
      if (form != null) details.add(form!);
      if (costume != null) details.add(costume!);
      // Don't add shiny/gender here, as this item represents the form/costume
      if (details.isNotEmpty) {
          name += ' (${details.join(' ')})';
      }
      return name;
  }

  String getImageUrl() {
      // Always show the non-shiny image for this form/costume in the Pokedex list
      String? url = assetForm?.image ?? basePokemon.assets?.image;
      // Fallback
      url ??= basePokemon.getImageUrl(form: form, costume: costume); // Use base helper
      return url ?? ApiConfig.fallbackPokemonIconUrl(dexNr); // Final fallback
  }

  int get formCostumeCount {
      // Calculate unique forms/costumes for display in the list item
      final uniqueFormsCostumes = basePokemon.assetForms
          .where((f) => f.form != null || f.costume != null)
          .map((f) => '${f.form}_${f.costume}')
          .toSet();
      return uniqueFormsCostumes.length;
  }

   @override
   bool operator ==(Object other) =>
       identical(this, other) ||
       other is PokedexDisplayItem &&
           runtimeType == other.runtimeType &&
           displayKey == other.displayKey;

   @override
   int get hashCode => displayKey.hashCode;
}
