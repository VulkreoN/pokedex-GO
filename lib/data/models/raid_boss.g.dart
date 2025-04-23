// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'raid_boss.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RaidBoss _$RaidBossFromJson(Map<String, dynamic> json) => RaidBoss(
      id: json['id'] as String? ?? '0',
      names: (json['names'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, e as String),
          ) ??
          {},
      form: json['form'] as String?,
      level: json['level'] as String? ?? 'unknown',
      shiny: json['shiny'] as bool? ?? false,
      assets: json['assets'] == null
          ? null
          : PokemonAssets.fromJson(json['assets'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$RaidBossToJson(RaidBoss instance) => <String, dynamic>{
      'id': instance.id,
      'names': instance.names,
      'form': instance.form,
      'level': instance.level,
      'shiny': instance.shiny,
      'assets': instance.assets?.toJson(),
    };
