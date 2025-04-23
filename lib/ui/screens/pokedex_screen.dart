import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/pokemon_detail_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/error_message.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/pokemon_list_item.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

// State for managing selected Pokémon IDs
final selectedPokemonProvider = StateProvider<Set<int>>((ref) => {});

class PokedexScreen extends ConsumerStatefulWidget {
  const PokedexScreen({super.key});

  @override
  ConsumerState<PokedexScreen> createState() => _PokedexScreenState();
}

class _PokedexScreenState extends ConsumerState<PokedexScreen> {
  final TextEditingController _searchController = TextEditingController();
  // Remove _isSelectionMode, derive it directly from selectedPokemonProvider
  // bool _isSelectionMode = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleSelection(int dexNr) {
    final selected = ref.read(selectedPokemonProvider);
    final notifier = ref.read(selectedPokemonProvider.notifier);
    // No need for setState here as Riverpod handles rebuilds
    if (selected.contains(dexNr)) {
      notifier.state = Set.from(selected)..remove(dexNr);
    } else {
      notifier.state = Set.from(selected)..add(dexNr);
    }
    // _isSelectionMode = notifier.state.isNotEmpty; // Derived from provider now
  }

   void _clearSelection() {
       ref.read(selectedPokemonProvider.notifier).state = {};
       // _isSelectionMode = false; // Derived from provider now
   }

   void _selectAll(List<Pokemon> currentlyVisibleList) {
       final allIds = currentlyVisibleList.map((p) => p.dexNr).toSet();
       ref.read(selectedPokemonProvider.notifier).state = allIds;
       // _isSelectionMode = true; // Derived from provider now
   }

   void _showAddToListDialog(BuildContext context, Set<int> selectedIds) {
       final customLists = ref.read(customListsProvider); // Read current lists
       final l10n = context.l10n;

       if (customLists.isEmpty) {
           ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(content: Text(l10n.noLists))
           );
           return;
       }

       showDialog(
           context: context,
           builder: (BuildContext context) {
               return AlertDialog(
                   title: Text(l10n.addSelectedTo(selectedIds.length)),
                   content: SizedBox( // Constrain height if list is long
                      width: double.maxFinite,
                      child: ListView.builder(
                           shrinkWrap: true,
                           itemCount: customLists.length,
                           itemBuilder: (context, index) {
                               final list = customLists[index];
                               return ListTile(
                                   title: Text(list.name),
                                   onTap: () {
                                       // !! IMPORTANT !!
                                       // This currently only adds BASE Pokemon.
                                       // Implementing variation selection requires
                                       // navigating to a new screen here instead.
                                       _addSelectedPokemonToList(list.name, selectedIds);
                                       Navigator.of(context).pop(); // Close dialog
                                   },
                               );
                           },
                       ),
                   ),
                   actions: [
                       TextButton(
                           child: Text(l10n.cancelButton),
                           onPressed: () => Navigator.of(context).pop(),
                       ),
                   ],
               );
           },
       );
   }

   // !! This function still only adds BASE Pokemon entries !!
   void _addSelectedPokemonToList(String listName, Set<int> selectedIds) {
       final listNotifier = ref.read(customListsProvider.notifier);
       int addedCount = 0;
       int skippedCount = 0;

       final targetList = ref.read(customListsProvider).firstWhereOrNull((l) => l.name == listName);
       final existingKeys = targetList?.entries.map((e) => e.entryKey).toSet() ?? {};

       for (final dexNr in selectedIds) {
           // Create a basic entry (non-shiny, non-mega, base form)
           final newEntry = ListEntry(pokemonId: dexNr);

           if (!existingKeys.contains(newEntry.entryKey)) {
                try {
                   listNotifier.addEntryToList(listName, newEntry);
                   addedCount++;
                } catch (e) {
                   print("Error adding Pokémon $dexNr to $listName: $e");
                   skippedCount++;
                   ScaffoldMessenger.of(context).showSnackBar(
                       SnackBar(content: Text("Error adding $dexNr: ${e.toString().replaceFirst("Exception: ", "")}"))
                   );
                }
           } else {
               skippedCount++;
           }
       }

       _clearSelection();

       if (addedCount > 0 || skippedCount > 0) {
           ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(content: Text("Added $addedCount Pokémon. Skipped $skippedCount duplicates.")) // TODO: Localize
           );
       }
   }


  @override
  Widget build(BuildContext context) {
    final pokedexAsync = ref.watch(pokedexProvider);
    final searchQuery = ref.watch(pokedexSearchQueryProvider);
    final selectedIds = ref.watch(selectedPokemonProvider);
    final l10n = context.l10n;
    final locale = ref.watch(localeProvider).languageCode;
    final bool isSelectionMode = selectedIds.isNotEmpty; // Derive selection mode

    return Scaffold(
       appBar: AppBar(
           title: isSelectionMode
               ? Text(l10n.numSelected(selectedIds.length))
               : Text(l10n.pokedexTab),
           actions: isSelectionMode
               ? [
                    // Add Select All Button
                    IconButton(
                       icon: const Icon(Icons.select_all),
                       tooltip: "Select All Visible", // TODO: Localize
                       // Pass the currently visible list to select all from it
                       onPressed: () {
                            pokedexAsync.whenData((fullList) {
                                final filteredList = fullList.where((pokemon) {
                                   final query = searchQuery.toLowerCase();
                                   if (query.isEmpty) return true;
                                   return pokemon.allLocalizedNamesForSearch.any((name) => name.contains(query));
                                }).toList();
                                _selectAll(filteredList);
                            });
                       }
                    ),
                   IconButton(
                       icon: const Icon(Icons.clear),
                       tooltip: l10n.clearSelection,
                       onPressed: _clearSelection,
                   ),
                   IconButton(
                       icon: const Icon(Icons.playlist_add),
                       tooltip: l10n.addToList,
                       onPressed: selectedIds.isNotEmpty
                           ? () => _showAddToListDialog(context, selectedIds)
                           : null,
                   ),
                 ]
               : [
                   // Add filter button here if needed
               ],
       ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchHint,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12.0),
                ),
                suffixIcon: searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          ref.read(pokedexSearchQueryProvider.notifier).state = '';
                        },
                      )
                    : null,
              ),
              onChanged: (value) {
                ref.read(pokedexSearchQueryProvider.notifier).state = value;
              },
            ),
          ),
          Expanded(
            child: pokedexAsync.when(
              data: (fullPokedexList) {
                // Apply filtering
                final filteredList = fullPokedexList.where((pokemon) {
                   final query = searchQuery.toLowerCase();
                   if (query.isEmpty) return true;
                   return pokemon.allLocalizedNamesForSearch.any((name) => name.contains(query));
                }).toList();

                if (filteredList.isEmpty) {
                  return Center(child: Text(l10n.noResults));
                }
                // Use ListView.builder
                return ListView.builder(
                  padding: const EdgeInsets.only(bottom: 8.0), // Add padding if needed
                  itemCount: filteredList.length,
                  itemBuilder: (context, index) {
                    final pokemon = filteredList[index];
                    final isSelected = selectedIds.contains(pokemon.dexNr);

                    return PokemonListItem(
                      pokemon: pokemon,
                      locale: locale,
                      isSelected: isSelected,
                      onTap: () {
                        if (isSelectionMode) {
                          _toggleSelection(pokemon.dexNr);
                        } else {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => PokemonDetailScreen(pokemon: pokemon),
                            ),
                          );
                        }
                      },
                      onLongPress: () {
                         _toggleSelection(pokemon.dexNr);
                      },
                    );
                  },
                );
              },
              loading: () => const LoadingIndicator(),
              error: (error, stackTrace) => ErrorMessage(
                  message: error.toString(),
                  onRetry: () => ref.invalidate(pokedexProvider),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
