import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart';
import 'package:mydexpogo/data/models/custom_list.dart';
import 'package:mydexpogo/data/models/list_entry.dart';
import 'package:mydexpogo/data/models/pokemon.dart';
// ** Import the new display item model **
import 'package:mydexpogo/data/models/pokedex_display_item.dart';
import 'package:mydexpogo/providers/app_providers.dart';
import 'package:mydexpogo/utils/localization_helper.dart';
import 'package:mydexpogo/utils/image_helper.dart';
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';

import 'package:collection/collection.dart';

class PokemonDetailScreen extends ConsumerWidget {
  // ** Accept PokedexDisplayItem instead of Pokemon **
  final PokedexDisplayItem displayItem;

  const PokemonDetailScreen({required this.displayItem, super.key});

   void _showAddToListDialog(BuildContext context, WidgetRef ref) {
       final customLists = ref.read(customListsProvider);
       final l10n = context.l10n;

       if (customLists.isEmpty) {
           ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.noLists)));
           return;
       }

       showDialog(
           context: context,
           builder: (BuildContext context) {
               return AlertDialog(
                   // ** Update title to reflect adding specific item **
                   title: Text("Add ${displayItem.displayName(l10n.localeName)} to:"), // TODO: Localize
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
                                       _addDisplayItemToList(context, ref, list.name);
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

    // ** Updated function to add the specific display item **
    void _addDisplayItemToList(BuildContext context, WidgetRef ref, String listName) {
       final listNotifier = ref.read(customListsProvider.notifier);
       final l10n = context.l10n;

       // Create ListEntry based on the displayItem
       final newEntry = ListEntry(
           pokemonId: displayItem.dexNr,
           form: displayItem.form,
           costume: displayItem.costume,
           // Defaults to false for collected status
       );

       try {
           listNotifier.addEntryToList(listName, newEntry);
            ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(content: Text("${displayItem.displayName(l10n.localeName)} added to $listName")) // TODO: Localize
           );
       } catch (e) {
            ScaffoldMessenger.of(context).showSnackBar(
               SnackBar(content: Text("Error: ${e.toString()}"))
           );
       }
   }


  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider).languageCode;
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    // Get base pokemon data from the display item
    final Pokemon pokemon = displayItem.basePokemon;

    // ** Use the displayItem's specific image URL **
    final imageUrl = displayItem.getImageUrl();
    // ** Use the displayItem's specific name **
    final titleName = displayItem.displayName(locale);

    return Scaffold(
      appBar: AppBar(
        // ** Use specific display name **
        title: Text(titleName),
        actions: [
             IconButton(
                icon: const Icon(Icons.playlist_add),
                tooltip: l10n.addToList,
                onPressed: () => _showAddToListDialog(context, ref),
            )
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Hero(
                // ** Use displayItem's unique key for Hero tag **
                tag: 'pokemon_image_${displayItem.displayKey}',
                child: CachedNetworkImage(
                  imageUrl: imageUrl, // Use specific image URL
                  placeholder: (context, url) => const LoadingIndicator(size: 150), // Larger placeholder
                  errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 200),
                  height: 200, // Make image larger
                  fit: BoxFit.contain,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Basic Info (using base pokemon data)
            Text('#${pokemon.dexNr.toString().padLeft(3, '0')} - ${pokemon.localizedName(locale)}', style: textTheme.headlineMedium),
             // Show form/costume if applicable for this display item
             if (displayItem.form != null || displayItem.costume != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4.0),
                  child: Text(
                    "(${ (displayItem.form ?? '') + (displayItem.form != null && displayItem.costume != null ? ' / ' : '') + (displayItem.costume ?? '') })",
                    style: textTheme.headlineSmall?.copyWith(fontStyle: FontStyle.italic),
                  ),
                ),
            const SizedBox(height: 10),

            // Types (from base pokemon)
            Text(l10n.typesLabel, style: textTheme.titleMedium),
            Wrap(
              spacing: 8.0,
              children: [
                if (pokemon.primaryType != null)
                  Chip(label: Text(pokemon.primaryType!.localizedName(locale))),
                if (pokemon.secondaryType != null)
                  Chip(label: Text(pokemon.secondaryType!.localizedName(locale))),
              ],
            ),
            const SizedBox(height: 16),

            // Stats (from base pokemon)
            if (pokemon.stats != null) ...[
              Text(l10n.statsLabel, style: textTheme.titleMedium),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                   Text('${l10n.attackLabel}: ${pokemon.stats!.attack}'),
                   Text('${l10n.defenseLabel}: ${pokemon.stats!.defense}'),
                   Text('${l10n.staminaLabel}: ${pokemon.stats!.stamina}'),
                ],
              ),
              const SizedBox(height: 16),
            ],

            // Shiny Availability (from base pokemon)
            Row(
              children: [
                Icon(pokemon.hasShiny ? Icons.star : Icons.star_border, color: pokemon.hasShiny ? Colors.amber : Colors.grey),
                const SizedBox(width: 8),
                Text(pokemon.hasShiny ? l10n.shinyAvailable : l10n.shinyUnavailable),
              ],
            ),
            const SizedBox(height: 8),

            // Mega Availability (from base pokemon)
             Row(
              children: [
                Icon(pokemon.hasMegaEvolution ? Icons.flash_on : Icons.flash_off, color: pokemon.hasMegaEvolution ? Colors.purpleAccent : Colors.grey),
                 const SizedBox(width: 8),
                Text(pokemon.hasMegaEvolution ? l10n.megaAvailable : l10n.megaUnavailable),
              ],
            ),
            const SizedBox(height: 16),


            // Forms / Costumes (Show all, maybe highlight current one?)
            // Keep showing all forms/costumes of the base Pokemon for context
            if (pokemon.assetForms.isNotEmpty) ...[
               Text(l10n.formsLabel, style: textTheme.titleMedium),
               const SizedBox(height: 8),
               Wrap(
                   spacing: 8.0,
                   runSpacing: 4.0,
                   children: pokemon.assetForms.map((formAsset) {
                       final formImageUrl = formAsset.image ?? pokemon.assets?.image ?? ApiConfig.fallbackPokemonImageUrl(pokemon.dexNr);
                       String formDisplayName = formAsset.form ?? '';
                       if (formAsset.costume != null) {
                           formDisplayName += (formDisplayName.isNotEmpty ? ' ' : '') + formAsset.costume!;
                       }
                       if (formAsset.isFemale == true) {
                            formDisplayName += ' (${l10n.femaleLabel})';
                       }
                       if (formDisplayName.isEmpty) formDisplayName = "Default";

                       // ** Highlight the currently viewed form/costume **
                       bool isCurrent = displayItem.assetForm == formAsset;
                       // Handle base form highlighting
                       if (displayItem.assetForm == null && formAsset.form == null && formAsset.costume == null) {
                           isCurrent = true;
                       }

                       return Opacity( // Dim non-selected forms slightly
                         opacity: isCurrent ? 1.0 : 0.6,
                         child: Column(
                             children: [
                                 Container( // Add border if current
                                    padding: const EdgeInsets.all(2),
                                    decoration: BoxDecoration(
                                        border: isCurrent
                                            ? Border.all(color: colorScheme.primary, width: 2)
                                            : null,
                                        borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: CachedNetworkImage(
                                        imageUrl: formImageUrl,
                                        placeholder: (context, url) => const LoadingIndicator(size: 40),
                                        errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 50),
                                        height: 50,
                                        width: 50,
                                        fit: BoxFit.contain,
                                    ),
                                 ),
                                 Text(formDisplayName, style: textTheme.bodySmall),
                             ],
                         ),
                       );
                   }).toList(),
               ),
               const SizedBox(height: 16),
            ],

            // Mega Evolutions (from base pokemon)
            if (pokemon.megaEvolutions != null && pokemon.megaEvolutions!.isNotEmpty) ...[
                Text(l10n.megaEvolutionsLabel, style: textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                    spacing: 8.0,
                    runSpacing: 4.0,
                    children: pokemon.megaEvolutions!.entries.map((entry) {
                        final mega = entry.value;
                        final megaImageUrl = mega.assets?.image ?? ApiConfig.fallbackPokemonImageUrl(pokemon.dexNr);
                        return Column(
                            children: [
                                CachedNetworkImage(
                                    imageUrl: megaImageUrl,
                                    placeholder: (context, url) => const LoadingIndicator(size: 40),
                                    errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 50),
                                    height: 50,
                                    width: 50,
                                    fit: BoxFit.contain,
                                ),
                                Text(mega.localizedName(locale), style: textTheme.bodySmall),
                            ],
                        );
                    }).toList(),
                ),
                 const SizedBox(height: 16),
            ],
          ],
        ),
      ),
    );
  }
}
