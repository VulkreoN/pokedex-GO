import 'package:flutter/material.dart';
import 'package:flutter/services.dart'; // For Clipboard
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/custom_list.dart';
import 'package:mydexpogo/data/models/list_entry.dart';
import 'package:mydexpogo/data/models/pokemon.dart';
import 'package:mydexpogo/providers/app_providers.dart';
import 'package:mydexpogo/ui/widgets/error_message.dart';
// ** Use the updated ListEntryItem **
import 'package:mydexpogo/ui/widgets/list_entry_item.dart'; // ** Ensure this is correct **
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';
import 'package:mydexpogo/utils/localization_helper.dart';

import 'package:collection/collection.dart'; // For firstWhereOrNull

class ListDetailScreen extends ConsumerStatefulWidget {
  final String listName;

  const ListDetailScreen({required this.listName, super.key});

  @override
  ConsumerState<ListDetailScreen> createState() => _ListDetailScreenState();
}

class _ListDetailScreenState extends ConsumerState<ListDetailScreen> {
   final TextEditingController _searchController = TextEditingController();

   @override
   void dispose() {
       _searchController.dispose();
       super.dispose();
   }

  void _copyIdsToClipboard(BuildContext context, List<ListEntry> entries) {
      final l10n = context.l10n;
      if (entries.isEmpty) return;

      final ids = entries.map((e) => e.pokemonId).toSet().join(',');
      Clipboard.setData(ClipboardData(text: ids));
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.idsCopied))
      );
  }

   void _showAddEntryDialog(BuildContext context) {
       ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text("Add Pokémon from the Pokédex screen."))
       );
   }

    void _showRemoveConfirmDialog(BuildContext context, ListEntry entry) {
       final l10n = context.l10n;
       showDialog(
           context: context,
           builder: (context) => AlertDialog(
               title: Text(l10n.confirmRemoveTitle),
               content: Text(l10n.confirmRemoveContent),
               actions: [
                   TextButton(
                       child: Text(l10n.cancelButton),
                       onPressed: () => Navigator.of(context).pop(),
                   ),
                   TextButton(
                       style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                       child: Text(l10n.removeEntry),
                       onPressed: () async {
                           try {
                               await ref.read(customListsProvider.notifier).removeEntryFromList(widget.listName, entry);
                               Navigator.of(context).pop(); // Close confirm dialog
                           } catch (e) {
                               Navigator.of(context).pop(); // Close confirm dialog
                               ScaffoldMessenger.of(context).showSnackBar(
                                   SnackBar(content: Text("Error removing entry: $e"))
                               );
                           }
                       },
                   ),
               ],
           ),
       );
   }


  @override
  Widget build(BuildContext context) {
    final list = ref.watch(customListsProvider.select((lists) => lists.firstWhereOrNull((l) => l.name == widget.listName)));
    final filteredEntries = ref.watch(filteredListEntriesProvider(widget.listName));
    final pokedexMap = ref.watch(pokedexMapProvider);
    final locale = ref.watch(localeProvider).languageCode;
    final l10n = context.l10n;
    final currentSearchQuery = ref.watch(listDetailSearchQueryProvider(widget.listName));

    if (list == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.error("List not found"))),
        body: Center(child: Text(l10n.error("List '${widget.listName}' no longer exists."))),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.listDetailsTitle(list.name)),
        actions: [
          IconButton(
            icon: const Icon(Icons.copy),
            tooltip: l10n.copyIds,
            onPressed: () => _copyIdsToClipboard(context, list.entries),
          ),
        ],
         bottom: PreferredSize(
            preferredSize: const Size.fromHeight(kToolbarHeight),
            child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                        hintText: "Search in list...", // TODO: Localize
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12.0),
                            borderSide: BorderSide.none,
                        ),
                        filled: true,
                        isDense: true,
                         suffixIcon: currentSearchQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _searchController.clear();
                                  ref.read(listDetailSearchQueryProvider(widget.listName).notifier).state = '';
                                },
                              )
                            : null,
                    ),
                     onChanged: (value) {
                        ref.read(listDetailSearchQueryProvider(widget.listName).notifier).state = value;
                     },
                ),
            ),
         ),
      ),
      body: pokedexMap.isEmpty
          ? const LoadingIndicator()
          : filteredEntries.isEmpty
              ? Center(child: Text(
                  currentSearchQuery.isEmpty ? l10n.noEntries : l10n.noResults,
                  textAlign: TextAlign.center
                 ))
              : ListView.builder(
                  itemCount: filteredEntries.length,
                  itemBuilder: (context, index) {
                    final entry = filteredEntries[index];
                    final pokemon = pokedexMap[entry.pokemonId];

                    if (pokemon == null) {
                       return ListTile(title: Text(l10n.error("Data missing for ID ${entry.pokemonId}")));
                    }

                    // Use the updated ListEntryItem widget
                    return ListEntryItem(
                        entry: entry,
                        pokemon: pokemon, // Pass base pokemon data for context
                        locale: locale,
                        // ** UPDATED Callbacks to modify entry and call provider **
                        onToggleNormalMale: () {
                            entry.collectedNormalMale = !entry.collectedNormalMale;
                            ref.read(customListsProvider.notifier).updateEntryInList(widget.listName, entry);
                        },
                        onToggleNormalFemale: () {
                            entry.collectedNormalFemale = !entry.collectedNormalFemale;
                            ref.read(customListsProvider.notifier).updateEntryInList(widget.listName, entry);
                        },
                         onToggleShinyMale: () {
                            entry.collectedShinyMale = !entry.collectedShinyMale;
                            ref.read(customListsProvider.notifier).updateEntryInList(widget.listName, entry);
                        },
                         onToggleShinyFemale: () {
                            entry.collectedShinyFemale = !entry.collectedShinyFemale;
                            ref.read(customListsProvider.notifier).updateEntryInList(widget.listName, entry);
                        },
                        onRemove: () => _showRemoveConfirmDialog(context, entry),
                    );
                  },
                ),
    );
  }
}
