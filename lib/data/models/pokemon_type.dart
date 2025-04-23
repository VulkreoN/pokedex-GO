import 'package:json_annotation/json_annotation.dart';

part 'pokemon_type.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable()
class PokemonType {
  @JsonKey(defaultValue: 'unknown')
  final String type;
  @JsonKey(defaultValue: {})
  final Map<String, String> names;

  PokemonType({
    required this.type,
    required this.names,
  });

  factory PokemonType.fromJson(Map<String, dynamic> json) =>
      _$PokemonTypeFromJson(json);

  Map<String, dynamic> toJson() => _$PokemonTypeToJson(this);

  // Helper to get localized name
  String localizedName(String locale, {String fallbackLocale = 'en'}) {
    // Prioritize French, then selected locale, then English fallback
    return names['French'] ?? names[locale] ?? names[fallbackLocale] ?? type;
  }
}