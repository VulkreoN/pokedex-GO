// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quest.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Quest _$QuestFromJson(Map<String, dynamic> json) => Quest(
      quest: (json['quest'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, e as String),
          ) ??
          {},
      rewards: (json['rewards'] as List<dynamic>?)
              ?.map((e) => QuestReward.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );

Map<String, dynamic> _$QuestToJson(Quest instance) => <String, dynamic>{
      'quest': instance.quest,
      'rewards': instance.rewards.map((e) => e.toJson()).toList(),
    };
