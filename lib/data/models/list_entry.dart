import 'package:hive/hive.dart';
import 'package:json_annotation/json_annotation.dart';

part 'list_entry.g.dart'; // REMEMBER TO REGENERATE

@HiveType(typeId: 1) // Keep typeId if no conflicts, otherwise change
@JsonSerializable()
class ListEntry extends HiveObject{

  @HiveField(0) // Index 0
  @JsonKey(required: true)
  final int pokemonId; // Links to Pokemon.dexNr

  @HiveField(1) // Index 1
  final String? form;

  @HiveField(2) // Index 2
  final String? costume;

  // --- Detailed Collection Status ---
  @HiveField(3) // Index 3
  @JsonKey(defaultValue: false)
  bool collectedNormalMale;

  @HiveField(4) // Index 4
  @JsonKey(defaultValue: false)
  bool collectedNormalFemale;

  @HiveField(5) // Index 5
  @JsonKey(defaultValue: false)
  bool collectedShinyMale;

  @HiveField(6) // Index 6
  @JsonKey(defaultValue: false)
  bool collectedShinyFemale;
  // --- End Detailed Status ---

  @HiveField(7) // Index 7 - Renumbered
  String? notes;

  // Removed isShinyTarget, isMegaTarget, collectedNormal

  ListEntry({
    required this.pokemonId,
    this.form,
    this.costume,
    this.collectedNormalMale = false,
    this.collectedNormalFemale = false,
    this.collectedShinyMale = false,
    this.collectedShinyFemale = false,
    this.notes,
  });

   // Determine overall collected status (at least one variant collected)
   // Requires Pokemon.hasGenderDifferences and Pokemon.hasShiny info passed from outside
   bool isConsideredCollected(bool hasGenderDiff, bool hasShiny) {
       if (hasGenderDiff) {
           bool normalCollected = collectedNormalMale || collectedNormalFemale;
           bool shinyCollected = hasShiny && (collectedShinyMale || collectedShinyFemale);
           return normalCollected || shinyCollected;
       } else {
           // No gender diff: check normal male and shiny male (if shiny exists)
           return collectedNormalMale || (hasShiny && collectedShinyMale);
       }
   }

  factory ListEntry.fromJson(Map<String, dynamic> json) =>
      _$ListEntryFromJson(json);

  Map<String, dynamic> toJson() => _$ListEntryToJson(this);

  // Unique identifier for this specific form/costume entry within a list
  String get entryKey => '${pokemonId}_${form ?? 'base'}_${costume ?? 'none'}';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListEntry &&
          runtimeType == other.runtimeType &&
          entryKey == other.entryKey;

  @override
  int get hashCode => entryKey.hashCode;
}
