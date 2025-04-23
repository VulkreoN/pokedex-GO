import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/pokemon_assets.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_stats.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon_type.dart'; // Corrected import


part 'mega_evolution.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable(explicitToJson: true) // Needed for nested objects
class MegaEvolution {
  @JsonKey(defaultValue: 'unknown_mega')
  final String id; // e.g., MEGA_X, MEGA_Y
  @JsonKey(defaultValue: {})
  final Map<String, String> names;
  final PokemonStats? stats;
  final PokemonType? primaryType;
  final PokemonType? secondaryType;
  final PokemonAssets? assets;

  MegaEvolution({
    required this.id,
    required this.names,
    this.stats,
    this.primaryType,
    this.secondaryType,
    this.assets,
  });

  factory MegaEvolution.fromJson(Map<String, dynamic> json) =>
      _$MegaEvolutionFromJson(json);

  Map<String, dynamic> toJson() => _$MegaEvolutionToJson(this);

  // Helper to get localized name
  String localizedName(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return names['French'] ?? names[locale] ?? names[fallbackLocale] ?? id;
  }
}