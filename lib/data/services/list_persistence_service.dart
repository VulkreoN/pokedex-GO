import 'package:hive_flutter/hive_flutter.dart';
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import


class ListPersistenceService {
  static const String listBoxName = 'customLists';

  Box<CustomList> get _listBox => Hive.box<CustomList>(listBoxName);

  // Get all lists
  List<CustomList> getAllLists() {
    return _listBox.values.toList();
  }

  // Watch for changes in the list box
  Stream<BoxEvent> watchLists() {
    return _listBox.watch();
  }

  // Get a specific list by name (key)
  CustomList? getList(String name) {
    return _listBox.get(name);
  }

  // Add or update a list
  Future<void> saveList(CustomList list) async {
    // Use the list name as the key
    await _listBox.put(list.name, list);
  }

  // Delete a list
  Future<void> deleteList(String name) async {
    await _listBox.delete(name);
  }

  // Update a specific entry within a list
  // Note: This requires getting the list, modifying it, and saving it back
  Future<void> updateListEntry(String listName, ListEntry updatedEntry) async {
    final list = getList(listName);
    if (list != null) {
      final index = list.entries.indexWhere((e) => e.entryKey == updatedEntry.entryKey);
      if (index != -1) {
        list.entries[index] = updatedEntry;
        await saveList(list); // Save the entire list back
      }
    }
  }

  // Add an entry to a list
  Future<void> addListEntry(String listName, ListEntry newEntry) async {
    final list = getList(listName);
    if (list != null) {
      // Prevent duplicates
      if (!list.entries.any((e) => e.entryKey == newEntry.entryKey)) {
        list.entries.add(newEntry);
        await saveList(list);
      } else {
        // Optional: throw an exception or return a status indicating duplicate
        print("Entry already exists in list $listName");
        // Throwing exception to be caught by notifier/UI
        throw Exception('Entry already exists in this list.');
      }
    }
  }

  // Remove an entry from a list
  Future<void> removeListEntry(String listName, ListEntry entryToRemove) async {
    final list = getList(listName);
    if (list != null) {
      list.entries.removeWhere((e) => e.entryKey == entryToRemove.entryKey);
      await saveList(list);
    }
  }

  // Clear all lists (use with caution!)
  Future<void> clearAllLists() async {
    await _listBox.clear();
  }
}