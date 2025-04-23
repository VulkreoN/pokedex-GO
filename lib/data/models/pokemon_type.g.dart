// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pokemon_type.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PokemonType _$PokemonTypeFromJson(Map<String, dynamic> json) => PokemonType(
      type: json['type'] as String? ?? 'unknown',
      names: (json['names'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, e as String),
          ) ??
          {},
    );

Map<String, dynamic> _$PokemonTypeToJson(PokemonType instance) =>
    <String, dynamic>{
      'type': instance.type,
      'names': instance.names,
    };
