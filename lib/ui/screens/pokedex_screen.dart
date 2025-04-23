import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/custom_list.dart';
import 'package:mydexpogo/data/models/list_entry.dart';
import 'package:mydexpogo/data/models/pokemon.dart';
import 'package:mydexpogo/providers/app_providers.dart';
import 'package:mydexpogo/ui/screens/pokemon_detail_screen.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/error_message.dart';
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';
import 'package:mydexpogo/ui/widgets/pokedex_list_item.dart'; // Use new list item
import 'package:mydexpogo/utils/localization_helper.dart';
import 'package:mydexpogo/data/models/pokedex_display_item.dart'; // Use display item

import 'package:collection/collection.dart';

// State for managing selected PokedexDisplayItem keys (String)
final selectedPokedexItemProvider = StateProvider<Set<String>>((ref) => {});

class PokedexScreen extends ConsumerStatefulWidget {
  const PokedexScreen({super.key});

  @override
  ConsumerState<PokedexScreen> createState() => _PokedexScreenState();
}

class _PokedexScreenState extends ConsumerState<PokedexScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleSelection(String displayKey) {
    final selected = ref.read(selectedPokedexItemProvider);
    final notifier = ref.read(selectedPokedexItemProvider.notifier);
    if (selected.contains(displayKey)) {
      notifier.state = Set.from(selected)..remove(displayKey);
    } else {
      notifier.state = Set.from(selected)..add(displayKey);
    }
  }

   void _clearSelection() {
       ref.read(selectedPokedexItemProvider.notifier).state = {};
   }

   void _selectAll(List<PokedexDisplayItem> currentlyVisibleList) {
       final allKeys = currentlyVisibleList.map((item) => item.displayKey).toSet();
       ref.read(selectedPokedexItemProvider.notifier).state = allKeys;
   }

   void _showAddToListDialog(BuildContext context, Set<String> selectedDisplayKeys) {
       final customLists = ref.read(customListsProvider);
       final l10n = context.l10n;
       final allDisplayItems = ref.read(pokedexDisplayItemsProvider);
       final selectedItems = allDisplayItems.where((item) => selectedDisplayKeys.contains(item.displayKey)).toList();

       if (customLists.isEmpty) {
           ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.noLists)));
           return;
       }

       showDialog(
           context: context,
           builder: (BuildContext context) {
               return AlertDialog(
                   title: Text(l10n.addSelectedTo(selectedItems.length)),
                   content: SizedBox(
                      width: double.maxFinite,
                      child: ListView.builder(
                           shrinkWrap: true,
                           itemCount: customLists.length,
                           itemBuilder: (context, index) {
                               final list = customLists[index];
                               return ListTile(
                                   title: Text(list.name),
                                   onTap: () {
                                       _addSelectedItemsToList(list.name, selectedItems);
                                       Navigator.of(context).pop();
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

   void _addSelectedItemsToList(String listName, List<PokedexDisplayItem> selectedItems) {
       final listNotifier = ref.read(customListsProvider.notifier);
       int addedCount = 0;
       int skippedCount = 0;

       final targetList = ref.read(customListsProvider).firstWhereOrNull((l) => l.name == listName);
       final existingKeysInList = targetList?.entries.map((e) => e.entryKey).toSet() ?? {};

       for (final item in selectedItems) {
           final newEntry = ListEntry(
              pokemonId: item.dexNr,
              form: item.form,
              costume: item.costume,
           );

           if (!existingKeysInList.contains(newEntry.entryKey)) {
                try {
                   listNotifier.addEntryToList(listName, newEntry);
                   addedCount++;
                } catch (e) {
                   print("Error adding ${item.displayName(ref.read(localeProvider).languageCode)} to $listName: $e");
                   skippedCount++;
                   ScaffoldMessenger.of(context).showSnackBar(
                       SnackBar(content: Text("Error adding ${item.displayName(ref.read(localeProvider).languageCode)}: ${e.toString().replaceFirst("Exception: ", "")}"))
                   );
                }
           } else {
               skippedCount++;
           }
       }

       _clearSelection();

       if (addedCount > 0 || skippedCount > 0) {
           ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(content: Text("Added $addedCount items. Skipped $skippedCount duplicates/errors."))
           );
       }
   }


  @override
  Widget build(BuildContext context) {
    final filteredDisplayItems = ref.watch(filteredPokedexProvider);
    final pokedexAsync = ref.watch(pokedexProvider);
    final selectedDisplayKeys = ref.watch(selectedPokedexItemProvider);
    final l10n = context.l10n;
    final locale = ref.watch(localeProvider).languageCode;
    final bool isSelectionMode = selectedDisplayKeys.isNotEmpty;

    return Scaffold(
       appBar: AppBar(
           title: isSelectionMode
               ? Text(l10n.numSelected(selectedDisplayKeys.length))
               : Text(l10n.pokedexTab),
           actions: isSelectionMode
               ? [
                    IconButton(
                       icon: const Icon(Icons.select_all),
                       tooltip: "Select All Visible",
                       onPressed: () => _selectAll(filteredDisplayItems),
                    ),
                   IconButton(
                       icon: const Icon(Icons.clear),
                       tooltip: l10n.clearSelection,
                       onPressed: _clearSelection,
                   ),
                   IconButton(
                       icon: const Icon(Icons.playlist_add),
                       tooltip: l10n.addToList,
                       onPressed: selectedDisplayKeys.isNotEmpty
                           ? () => _showAddToListDialog(context, selectedDisplayKeys)
                           : null,
                   ),
                 ]
               : [],
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
                suffixIcon: ref.watch(pokedexSearchQueryProvider).isNotEmpty
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
              data: (_) {
                if (filteredDisplayItems.isEmpty && ref.watch(pokedexSearchQueryProvider).isNotEmpty) {
                   return Center(child: Text(l10n.noResults));
                }
                if (filteredDisplayItems.isEmpty && ref.watch(pokedexSearchQueryProvider).isEmpty && !pokedexAsync.isLoading) {
                    return Center(child: Text(l10n.noResults));
                }

                return ListView.builder(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  itemCount: filteredDisplayItems.length,
                  itemBuilder: (context, index) {
                    final item = filteredDisplayItems[index];
                    final isSelected = selectedDisplayKeys.contains(item.displayKey);

                    return PokedexListItem(
                      displayItem: item,
                      locale: locale,
                      isSelected: isSelected,
                      onTap: () {
                        if (isSelectionMode) {
                          _toggleSelection(item.displayKey);
                        } else {
                          // ** Pass the specific PokedexDisplayItem **
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => PokemonDetailScreen(displayItem: item), // Pass displayItem
                            ),
                          );
                        }
                      },
                      onLongPress: () {
                         _toggleSelection(item.displayKey);
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
