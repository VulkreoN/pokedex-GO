import 'dart:async';
import 'dart:convert'; // For jsonEncode/Decode in import/export
import 'package:flutter/material.dart'; // For Locale
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart'; // For BoxEvent
import 'package:mydexpogo/data/models/custom_list.dart';
import 'package:mydexpogo/data/models/list_entry.dart';
import 'package:mydexpogo/data/models/pokemon.dart';
import 'package:mydexpogo/data/models/quest.dart';
import 'package:mydexpogo/data/models/raid_boss.dart';
import 'package:mydexpogo/data/services/api_service.dart';
import 'package:mydexpogo/data/services/file_service.dart';
import 'package:mydexpogo/data/services/list_persistence_service.dart';
// ** Import the new display item **
import 'package:mydexpogo/data/models/pokedex_display_item.dart';

import 'package:collection/collection.dart'; // For firstWhereOrNull

// --- Service Providers ---

final apiServiceProvider = Provider<ApiService>((ref) {
  final service = ApiService();
  ref.onDispose(() => service.dispose());
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
  return const Locale('fr'); // Default to French
});

// --- API Data Providers ---

final pokedexProvider = FutureProvider<List<Pokemon>>((ref) async {
  final apiService = ref.watch(apiServiceProvider);
  return await apiService.fetchPokedex();
});

// ** UPDATED: Provider for Pokedex Display Items (Base + Forms/Costumes) **
final pokedexDisplayItemsProvider = Provider<List<PokedexDisplayItem>>((ref) {
  final pokedexAsync = ref.watch(pokedexProvider);

  return pokedexAsync.maybeWhen(
    data: (pokedex) {
      final List<PokedexDisplayItem> displayItems = [];
      for (final pokemon in pokedex) {
        // 1. Add the base item
        displayItems.add(PokedexDisplayItem(basePokemon: pokemon));

        // 2. Add unique forms/costumes from assetForms
        final uniqueAssetForms = <String>{}; // Track unique form/costume combos
        for (final assetForm in pokemon.assetForms) {
           // Only add if it has a distinct form or costume name
           if (assetForm.form != null || assetForm.costume != null) {
                final formKey = '${assetForm.form}_${assetForm.costume}';
                if (uniqueAssetForms.add(formKey)) {
                    displayItems.add(PokedexDisplayItem(
                        basePokemon: pokemon,
                        assetForm: assetForm, // Link to the specific asset form
                    ));
                }
           }
        }
      }
      // Sort display items
      displayItems.sort((a, b) {
          int comp = a.dexNr.compareTo(b.dexNr);
          if (comp != 0) return comp;
          // Sort base form first
          comp = (a.form == null && a.costume == null ? 0 : 1)
                 .compareTo(b.form == null && b.costume == null ? 0 : 1);
          if (comp != 0) return comp;
          comp = (a.form ?? '').compareTo(b.form ?? '');
           if (comp != 0) return comp;
          return (a.costume ?? '').compareTo(b.costume ?? '');
      });
      return displayItems;
    },
    orElse: () => [],
  );
});

// Helper to get Pokemon map by DexNr for quick lookups (still useful)
final pokedexMapProvider = Provider<Map<int, Pokemon>>((ref) {
   final pokedexAsyncValue = ref.watch(pokedexProvider);
   return pokedexAsyncValue.maybeWhen(
       data: (pokedex) => { for (var p in pokedex) p.dexNr : p },
       orElse: () => {},
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
// (No changes needed in the Notifier itself for this step)
final customListsProvider = StateNotifierProvider<CustomListsNotifier, List<CustomList>>((ref) {
  final persistenceService = ref.watch(listPersistenceServiceProvider);
  return CustomListsNotifier(persistenceService, ref);
});

class CustomListsNotifier extends StateNotifier<List<CustomList>> {
  final ListPersistenceService _persistenceService;
  final Ref _ref;
  StreamSubscription<BoxEvent>? _listSubscription;

  CustomListsNotifier(this._persistenceService, this._ref)
      : super(_persistenceService.getAllLists()) {
    _watchDb();
  }

  void _watchDb() {
    _listSubscription?.cancel();
    _listSubscription = _persistenceService.watchLists().listen((event) {
      state = _persistenceService.getAllLists();
    });
  }

  Future<void> addList(String name, String? description) async {
    if (state.any((list) => list.name == name)) {
      throw Exception('List with name "$name" already exists.');
    }
    final newList = CustomList(name: name, description: description);
    await _persistenceService.saveList(newList);
  }

  Future<void> deleteList(String name) async {
    await _persistenceService.deleteList(name);
  }

  Future<void> updateList(CustomList list) async {
     await _persistenceService.saveList(list);
  }

  Future<void> addEntryToList(String listName, ListEntry entry) async {
      final list = state.firstWhereOrNull((l) => l.name == listName);
      if (list != null) {
          if (list.entries.any((e) => e.entryKey == entry.entryKey)) {
              throw Exception('Entry already exists in this list.');
          }
          await _persistenceService.addListEntry(listName, entry);
      } else {
          throw Exception('List not found: $listName');
      }
  }

   Future<void> removeEntryFromList(String listName, ListEntry entry) async {
       await _persistenceService.removeListEntry(listName, entry);
   }

   Future<void> updateEntryInList(String listName, ListEntry entry) async {
       await _persistenceService.updateListEntry(listName, entry);
   }

  Future<String> importList() async {
      final fileService = _ref.read(fileServiceProvider);
      try {
          final importedList = await fileService.importList();
          if (importedList != null) {
              if (state.any((l) => l.name == importedList.name)) {
                  throw Exception('A list named "${importedList.name}" already exists.');
              }
              await _persistenceService.saveList(importedList);
              return importedList.name;
          } else {
              throw Exception('No file selected or file read error.');
          }
      } catch (e) {
          print("Import Error in Notifier: $e");
          rethrow;
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
              throw Exception('Export failed or was cancelled/not supported on this platform.');
           }
       } catch (e) {
           print("Export Error in Notifier: $e");
           rethrow;
       }
   }

  @override
  void dispose() {
    _listSubscription?.cancel();
    super.dispose();
  }
}

// --- Filter/Search Providers ---

// Pokedex Search
final pokedexSearchQueryProvider = StateProvider<String>((ref) => '');

// List Detail Search Query Provider
final listDetailSearchQueryProvider = StateProvider.family<String, String>((ref, listName) => '');

// ** UPDATED: Pokedex Filtered List (uses PokedexDisplayItem) **
final filteredPokedexProvider = Provider<List<PokedexDisplayItem>>((ref) {
  final displayItems = ref.watch(pokedexDisplayItemsProvider); // Watch the new provider
  final query = ref.watch(pokedexSearchQueryProvider).toLowerCase();
  final locale = ref.watch(localeProvider).languageCode;

  if (query.isEmpty) {
    return displayItems;
  }

  return displayItems.where((item) {
    // Search base name, dex number, form name, costume name
    final nameMatch = item.basePokemon.names.values.any((name) => name.toLowerCase().contains(query));
    final dexNrMatch = item.dexNr.toString() == query;
    final formMatch = item.form?.toLowerCase().contains(query) ?? false;
    final costumeMatch = item.costume?.toLowerCase().contains(query) ?? false;

    return nameMatch || dexNrMatch || formMatch || costumeMatch;
  }).toList();
});

// Filtered List Entries Provider (no changes needed here)
final filteredListEntriesProvider = Provider.family<List<ListEntry>, String>((ref, listName) {
    final list = ref.watch(customListsProvider.select(
        (lists) => lists.firstWhereOrNull((l) => l.name == listName)
    ));
    final query = ref.watch(listDetailSearchQueryProvider(listName)).toLowerCase();
    final pokedexMap = ref.watch(pokedexMapProvider);
    final locale = ref.watch(localeProvider).languageCode;

    if (list == null) return [];

    final entries = list.entries;
    if (query.isEmpty) return entries;

    return entries.where((entry) {
        final pokemon = pokedexMap[entry.pokemonId];
        if (pokemon == null) return false;

        final nameMatch = pokemon.names.values.any((name) => name.toLowerCase().contains(query));
        final formMatch = entry.form?.toLowerCase().contains(query) ?? false;
        final costumeMatch = entry.costume?.toLowerCase().contains(query) ?? false;
        final dexNrMatch = entry.pokemonId.toString() == query;

        return nameMatch || formMatch || costumeMatch || dexNrMatch;
    }).toList();
});
