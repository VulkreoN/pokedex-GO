// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pokemon_stats.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PokemonStats _$PokemonStatsFromJson(Map<String, dynamic> json) => PokemonStats(
      stamina: (json['stamina'] as num?)?.toInt() ?? 0,
      attack: (json['attack'] as num?)?.toInt() ?? 0,
      defense: (json['defense'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$PokemonStatsToJson(PokemonStats instance) =>
    <String, dynamic>{
      'stamina': instance.stamina,
      'attack': instance.attack,
      'defense': instance.defense,
    };
