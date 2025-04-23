import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/pokemon_assets.dart'; // Corrected import


part 'raid_boss.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable(explicitToJson: true)
class RaidBoss {
  @JsonKey(defaultValue: '0') // Map to dexNr later if needed
  final String id;
  @JsonKey(defaultValue: {})
  final Map<String, String> names;
  final String? form;
  @JsonKey(defaultValue: 'unknown')
  final String level; // Raid tier/level (e.g., "lvl5", "mega")
  @JsonKey(defaultValue: false)
  final bool shiny; // Available as shiny in this rotation
  final PokemonAssets? assets;

  // Ignore types, counter, weather, cpRange, battleResult for now

  RaidBoss({
    required this.id,
    required this.names,
    this.form,
    required this.level,
    required this.shiny,
    this.assets,
  });

  factory RaidBoss.fromJson(Map<String, dynamic> json) =>
      _$RaidBossFromJson(json);

  Map<String, dynamic> toJson() => _$RaidBossToJson(this);

  String localizedName(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return names['French'] ?? names[locale] ?? names[fallbackLocale] ?? names.values.firstWhere((name) => name.isNotEmpty, orElse: () => 'No Name');
  }

  // Attempt to parse ID as dexNr. Handle potential errors.
  int? get dexNr {
    // Handle cases like "KYOGRE_PRIMAL" - extract base name if needed
    // For now, simple parsing:
    return int.tryParse(id);
  }

  String? get imageUrl => assets?.image;
  String? get shinyImageUrl => assets?.shinyImage;
  // Use imageUrl as icon placeholder
  String? get iconUrl => assets?.image;
}