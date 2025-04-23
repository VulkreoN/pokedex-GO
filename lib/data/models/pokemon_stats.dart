import 'package:json_annotation/json_annotation.dart';

part 'pokemon_stats.g.dart'; // REMEMBER TO GENERATE THIS FILE

@JsonSerializable()
class PokemonStats {
  @JsonKey(defaultValue: 0)
  final int stamina;
  @JsonKey(defaultValue: 0)
  final int attack;
  @JsonKey(defaultValue: 0)
  final int defense;

  PokemonStats({
    required this.stamina,
    required this.attack,
    required this.defense,
  });

  factory PokemonStats.fromJson(Map<String, dynamic> json) =>
      _$PokemonStatsFromJson(json);

  Map<String, dynamic> toJson() => _$PokemonStatsToJson(this);
}