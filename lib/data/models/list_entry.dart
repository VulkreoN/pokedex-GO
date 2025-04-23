import 'package:hive/hive.dart';
import 'package:json_annotation/json_annotation.dart';

part 'list_entry.g.dart'; // REMEMBER TO GENERATE THIS FILE (for both json and hive)

@HiveType(typeId: 1) // Unique Hive ID for this model
@JsonSerializable()
class ListEntry extends HiveObject{ // Extend HiveObject for direct box operations

  @HiveField(0)
  @JsonKey(required: true)
  final int pokemonId; // Links to Pokemon.dexNr

  @HiveField(1)
  final String? form;

  @HiveField(2)
  final String? costume;

  @HiveField(3)
  @JsonKey(defaultValue: false)
  final bool isShinyTarget; // Is this entry specifically for the shiny?

  @HiveField(4)
  @JsonKey(defaultValue: false)
  final bool isMegaTarget; // Is this entry specifically for a mega?

  @HiveField(5)
  @JsonKey(defaultValue: false)
  bool collectedMale; // Collection status for male

  @HiveField(6)
  @JsonKey(defaultValue: false)
  bool collectedFemale; // Collection status for female

  @HiveField(7)
  @JsonKey(defaultValue: false)
  bool collectedNormal; // Status for genderless / single-check needed

  @HiveField(8)
  String? notes;

  ListEntry({
    required this.pokemonId,
    this.form,
    this.costume,
    this.isShinyTarget = false,
    this.isMegaTarget = false,
    this.collectedMale = false,
    this.collectedFemale = false,
    this.collectedNormal = false,
    this.notes,
  });

  // Determine overall collected status based on relevant fields
  // Requires Pokemon.hasGenderDifferences info passed from outside
  bool isConsideredCollected(bool hasGenderDiff) {
    if (hasGenderDiff) {
      // Considered collected if EITHER male or female is checked
      return collectedMale || collectedFemale;
    } else {
      return collectedNormal;
    }
  }

  // Methods for easy toggling (call save() after modifying if needed)
  void toggleMale(bool hasGenderDiff) {
    collectedMale = !collectedMale;
    if (!hasGenderDiff) collectedNormal = collectedMale; // Sync if no gender diff
    // save(); // Call save() from the provider/service after modification
  }
  void toggleFemale(bool hasGenderDiff) {
    if(hasGenderDiff) {
      collectedFemale = !collectedFemale;
      // save();
    }
  }
  void toggleNormal(bool hasGenderDiff) {
    collectedNormal = !collectedNormal;
    if(!hasGenderDiff) collectedMale = collectedNormal; // Sync if no gender diff
    // save();
  }

  factory ListEntry.fromJson(Map<String, dynamic> json) =>
      _$ListEntryFromJson(json);

  Map<String, dynamic> toJson() => _$ListEntryToJson(this);

  // Unique identifier for an entry within a list for comparisons/updates
  String get entryKey => '${pokemonId}_${form ?? 'base'}_${costume ?? 'none'}_${isShinyTarget}_${isMegaTarget}';

  // Copy constructor for editing
  ListEntry copyWith({
    int? pokemonId,
    String? form,
    String? costume,
    bool? isShinyTarget,
    bool? isMegaTarget,
    bool? collectedMale,
    bool? collectedFemale,
    bool? collectedNormal,
    String? notes,
  }) {
    return ListEntry(
      pokemonId: pokemonId ?? this.pokemonId,
      form: form ?? this.form,
      costume: costume ?? this.costume,
      isShinyTarget: isShinyTarget ?? this.isShinyTarget,
      isMegaTarget: isMegaTarget ?? this.isMegaTarget,
      collectedMale: collectedMale ?? this.collectedMale,
      collectedFemale: collectedFemale ?? this.collectedFemale,
      collectedNormal: collectedNormal ?? this.collectedNormal,
      notes: notes ?? this.notes,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is ListEntry &&
              runtimeType == other.runtimeType &&
              entryKey == other.entryKey;

  @override
  int get hashCode => entryKey.hashCode;
}