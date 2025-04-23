import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/pokemon_assets.dart'; // Corrected import


part 'quest_reward.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable(explicitToJson: true)
class QuestReward {
  @JsonKey(defaultValue: 'UNKNOWN')
  final String type; // e.g., POKEMON, ITEM, STARDUST, ENERGY
  final String? id; // Pokemon dexNr (as String), Item ID, etc.
  @JsonKey(defaultValue: {})
  final Map<String, String> name; // Provided name map
  @JsonKey(defaultValue: false)
  final bool shiny; // Pokemon shiny possibility
  final PokemonAssets? assets; // Pokemon/Item assets
  // Add amount field if needed for ITEM/STARDUST/ENERGY later
  final int? amount; // API might provide amount for items/stardust

  QuestReward({
    required this.type,
    this.id,
    required this.name,
    required this.shiny,
    this.assets,
    this.amount,
  });

  factory QuestReward.fromJson(Map<String, dynamic> json) =>
      _$QuestRewardFromJson(json);

  Map<String, dynamic> toJson() => _$QuestRewardToJson(this);

  String localizedName(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return name['French'] ?? name[locale] ?? name[fallbackLocale] ?? name.values.firstWhere((n) => n.isNotEmpty, orElse: () => 'Unknown Reward');
  }

  // Attempt to parse ID as dexNr. Handle potential errors.
  int? get dexNr {
    if (type == 'POKEMON' && id != null) {
      return int.tryParse(id!);
    }
    return null;
  }

  String? get imageUrl => assets?.image;
  String? get shinyImageUrl => assets?.shinyImage;
  // Use imageUrl as icon placeholder
  String? get iconUrl => assets?.image;
}