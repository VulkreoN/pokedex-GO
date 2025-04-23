// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mega_evolution.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MegaEvolution _$MegaEvolutionFromJson(Map<String, dynamic> json) =>
    MegaEvolution(
      id: json['id'] as String? ?? 'unknown_mega',
      names: (json['names'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, e as String),
          ) ??
          {},
      stats: json['stats'] == null
          ? null
          : PokemonStats.fromJson(json['stats'] as Map<String, dynamic>),
      primaryType: json['primaryType'] == null
          ? null
          : PokemonType.fromJson(json['primaryType'] as Map<String, dynamic>),
      secondaryType: json['secondaryType'] == null
          ? null
          : PokemonType.fromJson(json['secondaryType'] as Map<String, dynamic>),
      assets: json['assets'] == null
          ? null
          : PokemonAssets.fromJson(json['assets'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MegaEvolutionToJson(MegaEvolution instance) =>
    <String, dynamic>{
      'id': instance.id,
      'names': instance.names,
      'stats': instance.stats?.toJson(),
      'primaryType': instance.primaryType?.toJson(),
      'secondaryType': instance.secondaryType?.toJson(),
      'assets': instance.assets?.toJson(),
    };
