import 'package:json_annotation/json_annotation.dart';

part 'pokemon_asset_form.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable()
class PokemonAssetForm {
  final String? form;
  final String? costume;
  final String? image;
  final String? shinyImage;
  final bool? isFemale; // Important for gender tracking

  PokemonAssetForm({
    this.form,
    this.costume,
    this.image,
    this.shinyImage,
    this.isFemale,
  });

  factory PokemonAssetForm.fromJson(Map<String, dynamic> json) =>
      _$PokemonAssetFormFromJson(json);

  Map<String, dynamic> toJson() => _$PokemonAssetFormToJson(this);

  // Identifier for this specific visual form
  String get formKey => '${form ?? 'base'}_${costume ?? 'none'}_${isFemale ?? false}';
}