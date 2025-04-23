// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pokemon_asset_form.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PokemonAssetForm _$PokemonAssetFormFromJson(Map<String, dynamic> json) =>
    PokemonAssetForm(
      form: json['form'] as String?,
      costume: json['costume'] as String?,
      image: json['image'] as String?,
      shinyImage: json['shinyImage'] as String?,
      isFemale: json['isFemale'] as bool?,
    );

Map<String, dynamic> _$PokemonAssetFormToJson(PokemonAssetForm instance) =>
    <String, dynamic>{
      'form': instance.form,
      'costume': instance.costume,
      'image': instance.image,
      'shinyImage': instance.shinyImage,
      'isFemale': instance.isFemale,
    };
