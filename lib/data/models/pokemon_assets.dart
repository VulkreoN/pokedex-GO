import 'package:json_annotation/json_annotation.dart';

part 'pokemon_assets.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable()
class PokemonAssets {
  final String? image;
  final String? shinyImage;

  PokemonAssets({
    this.image,
    this.shinyImage,
  });

  factory PokemonAssets.fromJson(Map<String, dynamic> json) =>
      _$PokemonAssetsFromJson(json);

  Map<String, dynamic> toJson() => _$PokemonAssetsToJson(this);
}