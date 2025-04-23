import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/mega_evolution.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_asset_form.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_assets.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_stats.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_type.dart'; // Corrected import


part 'pokemon.g.dart'; // REMEMBER TO RE-GENERATE THIS FILE

// Helper function to handle the megaEvolutions field which might be an empty list []
// instead of a map {} or null in the JSON.
Map<String, MegaEvolution>? _megaEvolutionsFromJson(dynamic json) {
  if (json is Map<String, dynamic>) {
    // If it's already a map, parse it normally
    return json.map(
      (k, e) => MapEntry(k, MegaEvolution.fromJson(e as Map<String, dynamic>)),
    );
  } else if (json is List && json.isEmpty) {
    // If it's an empty list, treat it as null (or an empty map if preferred)
    return null;
    // return {}; // Alternative: return empty map
  }
  // Handle other unexpected types or return null/empty
  return null;
}


@JsonSerializable(explicitToJson: true) // Needed for nested objects
class Pokemon {
  @JsonKey(defaultValue: 0)
  final int dexNr; // Use this as primary ID
  @JsonKey(defaultValue: 'unknown')
  final String id; // API internal ID
  final String? formId; // API internal form ID

  @JsonKey(defaultValue: {})
  final Map<String, String> names;
  final PokemonStats? stats;
  final PokemonType? primaryType;
  final PokemonType? secondaryType;
  final PokemonAssets? assets;

  @JsonKey(defaultValue: [])
  final List<PokemonAssetForm> assetForms;

  @JsonKey(defaultValue: false)
  final bool hasMegaEvolution;

  // Use the custom fromJson helper for megaEvolutions
  @JsonKey(fromJson: _megaEvolutionsFromJson)
  final Map<String, MegaEvolution>? megaEvolutions;

  // We ignore regionForms, moves, evolutions for now as per plan focus

  Pokemon({
    required this.dexNr,
    required this.id,
    this.formId,
    required this.names,
    this.stats,
    this.primaryType,
    this.secondaryType,
    this.assets,
    required this.assetForms,
    required this.hasMegaEvolution,
    this.megaEvolutions,
  });

  // Factory constructor remains the same, relying on generated code
  factory Pokemon.fromJson(Map<String, dynamic> json) =>
      _$PokemonFromJson(json);

  // toJson method remains the same
  Map<String, dynamic> toJson() => _$PokemonToJson(this);

  // --- Helpers ---

  String localizedName(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return names['French'] ?? names[locale] ?? names[fallbackLocale] ?? names.values.firstWhere((name) => name.isNotEmpty, orElse: () => 'No Name');
  }

  bool get hasShiny =>
      assets?.shinyImage != null ||
      assetForms.any((f) => f.shinyImage != null) ||
      (megaEvolutions?.values.any((m) => m.assets?.shinyImage != null) ?? false);

  // Basic check, might need refinement based on specific Pokémon knowledge
  bool get hasGenderDifferences =>
      assetForms.any((f) => f.isFemale != null) || _knownGenderDifferences.contains(dexNr);

  // Static list for Pokémon known to have visual differences
  // Keep this updated if needed!
  static const Set<int> _knownGenderDifferences = {
    3, 12, 19, 20, 25, 26, 41, 42, 44, 45, 84, 85, 97, 111, 112, 118, 119, 123,
    129, 130, 154, 165, 166, 178, 185, 186, 190, 194, 195, 198, 202, 203, 207, 208,
    212, 214, 215, 217, 221, 224, 229, 232, 255, 256, 257, 267, 269, 272, 274, 275,
    307, 308, 315, 316, 317, 322, 323, 332, 350, 369, 396, 397, 398, 399, 400, 401,
    402, 403, 404, 405, 407, 415, 417, 418, 419, 424, 443, 444, 445, 449, 450, 453,
    454, 456, 457, 459, 460, 461, 464, 465, 473, 521, 592, 593, 668, 678, 876, 902
  };

  List<String> get allLocalizedNamesForSearch => [
        ...names.values.map((n) => n.toLowerCase()),
        dexNr.toString() // Include dex number in searchable terms
      ];

  // Helper to get specific form/costume asset
   PokemonAssetForm? getAssetFor(String? form, String? costume, bool? isFemale) {
     try {
       // Find matching form/costume, prioritizing gender match if specified
       return assetForms.firstWhere((f) =>
           f.form == form &&
           f.costume == costume &&
           (isFemale == null || f.isFemale == isFemale)); // Match gender if provided
     } catch (e) {
       // Fallback if exact match not found (e.g., genderless form)
        try {
             return assetForms.firstWhere((f) => f.form == form && f.costume == costume);
        } catch (e2) {
             return null; // Not found
        }
     }
  }

  // Get the primary image URL, considering form/costume
  String? getImageUrl({String? form, String? costume, bool? isFemale}) {
      final specificAsset = getAssetFor(form, costume, isFemale);
      return specificAsset?.image ?? assets?.image; // Fallback to base image
  }
   // Get the shiny image URL, considering form/costume
  String? getShinyImageUrl({String? form, String? costume, bool? isFemale}) {
      final specificAsset = getAssetFor(form, costume, isFemale);
      return specificAsset?.shinyImage ?? assets?.shinyImage; // Fallback to base shiny
  }

   // Get the icon URL (smaller image, often needs separate logic or fallback)
   // For simplicity, using the main image URL for now. Replace with actual icon logic if needed.
   String? getIconUrl({String? form, String? costume, bool? isFemale}) {
       // Ideally, use a dedicated icon source or smaller sprites.
       // Using main image as placeholder:
       return getImageUrl(form: form, costume: costume, isFemale: isFemale);
   }

}
