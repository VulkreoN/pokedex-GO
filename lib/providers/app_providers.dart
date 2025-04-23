import 'dart:async';
import 'dart:convert'; // For jsonEncode/Decode in import/export
import 'package:flutter/material.dart'; // For Locale
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart'; // For BoxEvent
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/data/models/quest.dart'; // Corrected import
import 'package:mydexpogo/data/models/raid_boss.dart'; // Corrected import
import 'package:mydexpogo/data/services/api_service.dart'; // Corrected import
import 'package:mydexpogo/data/services/file_service.dart'; // Corrected import
import 'package:mydexpogo/data/services/list_persistence_service.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

// --- Service Providers ---

final apiServiceProvider = Provider<ApiService>((ref) {
  final service = ApiService();
  ref.onDispose(() => service.dispose()); // Close http client
  return service;
});

final listPersistenceServiceProvider = Provider<ListPersistenceService>((ref) {
  return ListPersistenceService();
});

final fileServiceProvider = Provider<FileService>((ref) {
  return FileService();
});

// --- Locale Provider ---

final localeProvider = StateProvider<Locale>((ref) {
  // TODO: Load initial locale from SharedPreferences or Hive 'settings' box
  return const Locale('fr'); // Default to French
});

// --- API Data Providers ---

// Pokédex Data (fetches once, caches result)
final pokedexProvider = FutureProvider<List<Pokemon>>((ref) async {
  final apiService = ref.watch(apiServiceProvider);
  return await apiService.fetchPokedex();
});

// Helper to get Pokemon map by DexNr for quick lookups
final pokedexMapProvider = Provider<Map<int, Pokemon>>((ref) {
  final pokedexAsyncValue = ref.watch(pokedexProvider);
  return pokedexAsyncValue.maybeWhen(
    data: (pokedex) => { for (var p in pokedex) p.dexNr : p },
    orElse: () => {}, // Return empty map while loading or on error
  );
});


// Raid Boss Data
final raidBossProvider = FutureProvider<Map<String, List<RaidBoss>>>((ref) async {
  final apiService = ref.watch(apiServiceProvider);
  return await apiService.fetchRaidBosses();
});

// Quest Data
final questProvider = FutureProvider<List<Quest>>((ref) async {
  final apiService = ref.watch(apiServiceProvider);
  return await apiService.fetchQuests();
});

// --- Custom List State Notifier ---

final customListsProvider = StateNotifierProvider<CustomListsNotifier, List<CustomList>>((ref) {
  final persistenceService = ref.watch(listPersistenceServiceProvider);
  return CustomListsNotifier(persistenceService, ref); // Pass ref
});

class CustomListsNotifier extends StateNotifier<List<CustomList>> {
  final ListPersistenceService _persistenceService;
  final Ref _ref; // Store ref
  StreamSubscription<BoxEvent>? _listSubscription;

  CustomListsNotifier(this._persistenceService, this._ref) // Accept ref
      : super(_persistenceService.getAllLists()) { // Load initial state
    _watchDb();
  }

  // Watch for database changes and update state
  void _watchDb() {
    _listSubscription?.cancel(); // Cancel previous subscription if any
    _listSubscription = _persistenceService.watchLists().listen((event) {
      // Could be more granular, but reloading all is simplest for now
      state = _persistenceService.getAllLists();
    });
  }

  Future<void> addList(String name, String? description) async {
    if (state.any((list) => list.name == name)) {
      throw Exception('List with name "$name" already exists.');
    }
    final newList = CustomList(name: name, description: description);
    await _persistenceService.saveList(newList);
    // State update will happen via the watcher (_watchDb)
    // state = [...state, newList]; // Manual update if watcher is disabled
  }

  Future<void> deleteList(String name) async {
    await _persistenceService.deleteList(name);
    // State update will happen via the watcher
    // state = state.where((list) => list.name != name).toList();
  }

  Future<void> updateList(CustomList list) async {
    await _persistenceService.saveList(list);
    // State update will happen via the watcher
  }

  Future<void> addEntryToList(String listName, ListEntry entry) async {
    final list = state.firstWhereOrNull((l) => l.name == listName);
    if (list != null) {
      // Check for duplicates before calling persistence
      if (list.entries.any((e) => e.entryKey == entry.entryKey)) {
        throw Exception('Entry already exists in this list.');
      }
      await _persistenceService.addListEntry(listName, entry);
      // Watcher will update state
    } else {
      throw Exception('List not found: $listName');
    }
  }

  Future<void> removeEntryFromList(String listName, ListEntry entry) async {
    await _persistenceService.removeListEntry(listName, entry);
    // Watcher will update state
  }

  Future<void> updateEntryInList(String listName, ListEntry entry) async {
    await _persistenceService.updateListEntry(listName, entry);
    // Watcher will update state
  }


  // --- Import / Export ---
  Future<String> importList() async {
    final fileService = _ref.read(fileServiceProvider); // Read file service
    try {
      final importedList = await fileService.importList();
      if (importedList != null) {
        // Check for name collision
        if (state.any((l) => l.name == importedList.name)) {
          // Handle collision: e.g., rename, overwrite confirmation, or throw
          throw Exception('A list named "${importedList.name}" already exists.');
        }
        await _persistenceService.saveList(importedList);
        // Watcher updates state
        return importedList.name; // Return name of imported list
      } else {
        throw Exception('No file selected or file read error.');
      }
    } catch (e) {
      print("Import Error in Notifier: $e");
      rethrow; // Rethrow for UI to handle
    }
  }

  Future<String> exportList(String listName) async {
    final fileService = _ref.read(fileServiceProvider);
    final list = state.firstWhereOrNull((l) => l.name == listName);
    if (list == null) {
      throw Exception('List "$listName" not found for export.');
    }
    try {
      final success = await fileService.exportList(list);
      if (success) {
        return list.name;
      } else {
        throw Exception('Export failed or was cancelled.');
      }
    } catch (e) {
      print("Export Error in Notifier: $e");
      rethrow;
    }
  }


  @override
  void dispose() {
    _listSubscription?.cancel(); // Clean up the subscription
    super.dispose();
  }
}

// --- Filter/Search Providers (Example for Pokédex) ---

// Holds the current search term
final pokedexSearchQueryProvider = StateProvider<String>((ref) => '');

// Holds the currently selected filters (e.g., by type, generation, shiny)
// Define a Filter class or use a Map<FilterType, dynamic>
// final pokedexFilterProvider = StateProvider<Map<String, dynamic>>((ref) => {});

// Provides the filtered Pokédex list based on search and filters
final filteredPokedexProvider = Provider<List<Pokemon>>((ref) {
  final pokedexAsync = ref.watch(pokedexProvider);
  final query = ref.watch(pokedexSearchQueryProvider).toLowerCase();
  // final filters = ref.watch(pokedexFilterProvider); // Get filters

  return pokedexAsync.maybeWhen(
    data: (pokedex) {
      if (query.isEmpty /* && filters.isEmpty */) {
        return pokedex; // No filter applied
      }
      return pokedex.where((pokemon) {
        final nameMatch = pokemon.allLocalizedNamesForSearch.any((name) => name.contains(query));
        // DexNr match is handled by allLocalizedNamesForSearch now

        // Add filter logic here, e.g.:
        // final typeFilter = filters['type'];
        // final typeMatch = typeFilter == null ||
        //     (pokemon.primaryType?.type == typeFilter || pokemon.secondaryType?.type == typeFilter);
        // final shinyFilter = filters['shiny']; // bool?
        // final shinyMatch = shinyFilter == null || pokemon.hasShiny == shinyFilter;
        // ... other filters

        return nameMatch; // && typeMatch && shinyMatch ...;
      }).toList();
    },
    orElse: () => [], // Return empty list while loading or on error
  );
});