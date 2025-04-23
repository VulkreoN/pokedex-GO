import 'package:flutter/material.dart';
import 'package:flutter/services.dart'; // For Clipboard
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/error_message.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/list_entry_item.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

class ListDetailScreen extends ConsumerWidget {
  final String listName;

  const ListDetailScreen({required this.listName, super.key});

  void _copyIdsToClipboard(BuildContext context, WidgetRef ref, List<ListEntry> entries) {
      final l10n = context.l10n;
      if (entries.isEmpty) return;

      // Get unique Pokémon IDs from the list entries
      final ids = entries.map((e) => e.pokemonId).toSet().join(',');
      Clipboard.setData(ClipboardData(text: ids));
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.idsCopied))
      );
  }

   void _showAddEntryDialog(BuildContext context, WidgetRef ref) {
       // TODO: Implement a dialog to search/select a Pokémon and its variations (form, costume, shiny, mega)
       // This is complex and requires a searchable Pokémon selector.
       // For now, adding is done via the Pokédex screen.
       ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text("Add Pokémon from the Pokédex screen."))
       );
   }

    void _showRemoveConfirmDialog(BuildContext context, WidgetRef ref, ListEntry entry) {
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
                               await ref.read(customListsProvider.notifier).removeEntryFromList(listName, entry);
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
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch the specific list from the provider
    final list = ref.watch(customListsProvider.select((lists) => lists.firstWhereOrNull((l) => l.name == listName)));
    final pokedexMap = ref.watch(pokedexMapProvider); // Get map for lookups
    final locale = ref.watch(localeProvider).languageCode;
    final l10n = context.l10n;

    if (list == null) {
      // Handle case where list might have been deleted while navigating
      return Scaffold(
        // Pass argument positionally
        appBar: AppBar(title: Text(l10n.error("List not found"))),
        // Pass argument positionally
        body: Center(child: Text(l10n.error("List '$listName' no longer exists."))),
      );
    }

    // Sort entries maybe? By dexNr?
    list.entries.sort((a, b) => a.pokemonId.compareTo(b.pokemonId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.listDetailsTitle(list.name)),
        actions: [
          IconButton(
            icon: const Icon(Icons.copy),
            tooltip: l10n.copyIds,
            onPressed: () => _copyIdsToClipboard(context, ref, list.entries),
          ),
          // IconButton( // Re-enable if implementing direct add dialog
          //   icon: const Icon(Icons.add),
          //   tooltip: l10n.addEntryToList,
          //   onPressed: () => _showAddEntryDialog(context, ref),
          // ),
        ],
      ),
      body: pokedexMap.isEmpty // Check if pokedex data is loaded for lookups
          ? const LoadingIndicator() // Show loading if pokedex isn't ready
          : list.entries.isEmpty
              ? Center(child: Text(l10n.noEntries, textAlign: TextAlign.center))
              : ListView.builder(
                  itemCount: list.entries.length,
                  itemBuilder: (context, index) {
                    final entry = list.entries[index];
                    final pokemon = pokedexMap[entry.pokemonId]; // Lookup Pokémon data

                    if (pokemon == null) {
                       // Handle case where pokemon data might be missing
                       // Pass argument positionally
                       return ListTile(title: Text(l10n.error("Data missing for ID ${entry.pokemonId}")));
                    }

                    return ListEntryItem(
                        entry: entry,
                        pokemon: pokemon,
                        locale: locale,
                        onToggleMale: (value) {
                             entry.toggleMale(pokemon.hasGenderDifferences);
                             ref.read(customListsProvider.notifier).updateEntryInList(listName, entry);
                        },
                        onToggleFemale: (value) {
                             entry.toggleFemale(pokemon.hasGenderDifferences);
                             ref.read(customListsProvider.notifier).updateEntryInList(listName, entry);
                        },
                        onToggleNormal: (value) {
                             entry.toggleNormal(pokemon.hasGenderDifferences);
                             ref.read(customListsProvider.notifier).updateEntryInList(listName, entry);
                        },
                        onRemove: () => _showRemoveConfirmDialog(context, ref, entry),
                        // TODO: Add onTap/onLongPress for editing notes?
                    );
                  },
                ),
    );
  }
}
