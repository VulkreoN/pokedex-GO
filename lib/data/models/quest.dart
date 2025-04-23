import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/quest_reward.dart'; // Corrected import


part 'quest.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable(explicitToJson: true)
class Quest {
  @JsonKey(defaultValue: {})
  final Map<String, String> quest; // Task description map
  @JsonKey(defaultValue: [])
  final List<QuestReward> rewards;

  Quest({
    required this.quest,
    required this.rewards,
  });

  factory Quest.fromJson(Map<String, dynamic> json) => _$QuestFromJson(json);

  Map<String, dynamic> toJson() => _$QuestToJson(this);

  String localizedQuest(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return quest['French'] ?? quest[locale] ?? quest[fallbackLocale] ?? quest.values.firstWhere((q) => q.isNotEmpty, orElse: () => 'Unknown Quest');
  }
}