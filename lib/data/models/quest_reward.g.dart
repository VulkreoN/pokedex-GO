// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quest_reward.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuestReward _$QuestRewardFromJson(Map<String, dynamic> json) => QuestReward(
      type: json['type'] as String? ?? 'UNKNOWN',
      id: json['id'] as String?,
      name: (json['name'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, e as String),
          ) ??
          {},
      shiny: json['shiny'] as bool? ?? false,
      assets: json['assets'] == null
          ? null
          : PokemonAssets.fromJson(json['assets'] as Map<String, dynamic>),
      amount: (json['amount'] as num?)?.toInt(),
    );

Map<String, dynamic> _$QuestRewardToJson(QuestReward instance) =>
    <String, dynamic>{
      'type': instance.type,
      'id': instance.id,
      'name': instance.name,
      'shiny': instance.shiny,
      'assets': instance.assets?.toJson(),
      'amount': instance.amount,
    };
