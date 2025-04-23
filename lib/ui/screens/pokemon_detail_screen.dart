import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import
import 'package:mydexpogo/utils/image_helper.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import

import 'package:collection/collection.dart'; // For firstWhereOrNull

class PokemonDetailScreen extends ConsumerWidget {
  final Pokemon pokemon;

  const PokemonDetailScreen({required this.pokemon, super.key});

  void _showAddToListDialog(BuildContext context, WidgetRef ref) {
    final customLists = ref.read(customListsProvider);
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
          title: Text(l10n.addToList), // Add base Pokémon
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
                    _addPokemonToList(context, ref, list.name);
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

  void _addPokemonToList(BuildContext context, WidgetRef ref, String listName) {
    final listNotifier = ref.read(customListsProvider.notifier);
    final l10n = context.l10n;

    // Create a basic entry for the base form
    final newEntry = ListEntry(pokemonId: pokemon.dexNr);

    try {
      listNotifier.addEntryToList(listName, newEntry);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("${pokemon.localizedName(l10n.localeName)} added to $listName")) // TODO: Localize
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Error: ${e.toString()}")) // Show specific error like duplicate
      );
    }
  }


  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider).languageCode;
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    // Determine image URL (base non-shiny for now)
    final imageUrl = pokemon.getImageUrl() ?? ApiConfig.fallbackPokemonImageUrl(pokemon.dexNr);

    return Scaffold(
      appBar: AppBar(
        title: Text(pokemon.localizedName(locale)),
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
              child: Hero( // Add Hero animation if coming from list item
                tag: 'pokemon_image_${pokemon.dexNr}',
                child: CachedNetworkImage(
                  imageUrl: imageUrl,
                  placeholder: (context, url) => const LoadingIndicator(size: 100),
                  errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 200),
                  height: 200,
                  fit: BoxFit.contain,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Basic Info
            Text('#${pokemon.dexNr.toString().padLeft(3, '0')} - ${pokemon.localizedName(locale)}', style: textTheme.headlineMedium),
            const SizedBox(height: 10),

            // Types
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

            // Stats
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

            // Shiny Availability
            Row(
              children: [
                Icon(pokemon.hasShiny ? Icons.star : Icons.star_border, color: pokemon.hasShiny ? Colors.amber : Colors.grey),
                const SizedBox(width: 8),
                Text(pokemon.hasShiny ? l10n.shinyAvailable : l10n.shinyUnavailable),
              ],
            ),
            const SizedBox(height: 8),

            // Mega Availability
            Row(
              children: [
                Icon(pokemon.hasMegaEvolution ? Icons.flash_on : Icons.flash_off, color: pokemon.hasMegaEvolution ? Colors.purpleAccent : Colors.grey),
                const SizedBox(width: 8),
                Text(pokemon.hasMegaEvolution ? l10n.megaAvailable : l10n.megaUnavailable),
              ],
            ),
            const SizedBox(height: 16),


            // Forms / Costumes
            if (pokemon.assetForms.isNotEmpty) ...[
              Text(l10n.formsLabel, style: textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8.0,
                runSpacing: 4.0,
                children: pokemon.assetForms.map((formAsset) {
                  final formImageUrl = formAsset.image ?? pokemon.assets?.image ?? ApiConfig.fallbackPokemonImageUrl(pokemon.dexNr);
                  // Construct a display name for the form/costume
                  String formDisplayName = formAsset.form ?? '';
                  if (formAsset.costume != null) {
                    formDisplayName += (formDisplayName.isNotEmpty ? ' ' : '') + formAsset.costume!;
                  }
                  if (formAsset.isFemale == true) {
                    formDisplayName += ' (${l10n.femaleLabel})';
                  }
                  if (formDisplayName.isEmpty) formDisplayName = "Default"; // Or base

                  return Column(
                    children: [
                      CachedNetworkImage(
                        imageUrl: formImageUrl,
                        placeholder: (context, url) => const LoadingIndicator(size: 40),
                        errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 50),
                        height: 50,
                        width: 50,
                        fit: BoxFit.contain,
                      ),
                      Text(formDisplayName, style: textTheme.bodySmall),
                      // Add shiny toggle/indicator if needed
                    ],
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
            ],

            // Mega Evolutions
            if (pokemon.megaEvolutions != null && pokemon.megaEvolutions!.isNotEmpty) ...[
              Text(l10n.megaEvolutionsLabel, style: textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8.0,
                runSpacing: 4.0,
                children: pokemon.megaEvolutions!.entries.map((entry) {
                  final mega = entry.value;
                  final megaImageUrl = mega.assets?.image ?? ApiConfig.fallbackPokemonImageUrl(pokemon.dexNr); // Fallback needed
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
                      // Add types, stats if desired
                    ],
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
            ],


            // TODO: Add sections for Evolutions, Moves if desired

          ],
        ),
      ),
    );
  }
}