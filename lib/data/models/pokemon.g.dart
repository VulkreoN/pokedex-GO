// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pokemon.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Pokemon _$PokemonFromJson(Map<String, dynamic> json) => Pokemon(
      dexNr: (json['dexNr'] as num?)?.toInt() ?? 0,
      id: json['id'] as String? ?? 'unknown',
      formId: json['formId'] as String?,
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
      assetForms: (json['assetForms'] as List<dynamic>?)
              ?.map((e) => PokemonAssetForm.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      hasMegaEvolution: json['hasMegaEvolution'] as bool? ?? false,
      megaEvolutions: _megaEvolutionsFromJson(json['megaEvolutions']),
    );

Map<String, dynamic> _$PokemonToJson(Pokemon instance) => <String, dynamic>{
      'dexNr': instance.dexNr,
      'id': instance.id,
      'formId': instance.formId,
      'names': instance.names,
      'stats': instance.stats?.toJson(),
      'primaryType': instance.primaryType?.toJson(),
      'secondaryType': instance.secondaryType?.toJson(),
      'assets': instance.assets?.toJson(),
      'assetForms': instance.assetForms.map((e) => e.toJson()).toList(),
      'hasMegaEvolution': instance.hasMegaEvolution,
      'megaEvolutions':
          instance.megaEvolutions?.map((k, e) => MapEntry(k, e.toJson())),
    };
