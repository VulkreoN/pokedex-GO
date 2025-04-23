import 'package:hive/hive.dart';
import 'package:json_annotation/json_annotation.dart';
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import


part 'custom_list.g.dart'; // REMEMBER TO GENERATE THIS FILE (for both json and hive)

@HiveType(typeId: 0) // Unique Hive ID for this model
@JsonSerializable(explicitToJson: true)
class CustomList extends HiveObject{ // Extend HiveObject

  @HiveField(0)
  @JsonKey(required: true)
  String name; // Use name as the key in the Hive box

  @HiveField(1)
  String? description;

  @HiveField(2)
  @JsonKey(defaultValue: [])
  List<ListEntry> entries;

  @HiveField(3)
  @JsonKey(defaultValue: 1) // Current version of the list format
  final int version;

  CustomList({
    required this.name,
    this.description,
    List<ListEntry>? entries,
    this.version = 1,
  }) : entries = entries ?? []; // Ensure entries list is initialized

  factory CustomList.fromJson(Map<String, dynamic> json) =>
      _$CustomListFromJson(json);

  Map<String, dynamic> toJson() => _$CustomListToJson(this);

  // --- Helpers ---

  // Note: Accurate collectedCount requires the full Pokemon data map
  // to check hasGenderDifferences for each entry.
  // This calculation should ideally happen in the provider/UI layer.
  int get totalEntries => entries.length;

  // Add/Remove entries (Best handled by state management to ensure updates)
  void addEntry(ListEntry entry) {
    // Prevent duplicates based on the unique key
    if (!entries.any((e) => e.entryKey == entry.entryKey)) {
      entries.add(entry);
      // save(); // Call save() from the provider/service
    }
  }

  void removeEntry(ListEntry entry) {
    entries.removeWhere((e) => e.entryKey == entry.entryKey);
    // save(); // Call save() from the provider/service
  }

  void updateEntry(ListEntry updatedEntry) {
    final index = entries.indexWhere((e) => e.entryKey == updatedEntry.entryKey);
    if (index != -1) {
      entries[index] = updatedEntry;
      // save(); // Call save() from the provider/service
    }
  }
}