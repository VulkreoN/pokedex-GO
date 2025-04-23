import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/data/models/raid_boss.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/image_helper.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/pokemon_detail_screen.dart'; // Corrected import (for navigation)


class RaidBossListItem extends StatelessWidget {
  final RaidBoss raidBoss;
  final String locale;
  final Pokemon? pokemonData; // Optional: Pass looked-up Pokemon data

  const RaidBossListItem({
    required this.raidBoss,
    required this.locale,
    this.pokemonData,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    // Use AppLocalizations.of(context)! directly for testing if context.l10n fails
    // final l10n = AppLocalizations.of(context)!;
    final l10n = context.l10n; // Keep using helper for now
    final textTheme = Theme.of(context).textTheme;
    final int? dexNr = raidBoss.dexNr; // Use parsed dexNr

    // Determine image URL
    String? imageUrl = raidBoss.iconUrl; // Use iconUrl helper from model
    if (imageUrl == null && dexNr != null) {
       imageUrl = ApiConfig.fallbackPokemonIconUrl(dexNr); // Fallback
    }

    String displayName = raidBoss.localizedName(locale);
    // Add form if available and not already in name
    if (raidBoss.form != null && !displayName.toLowerCase().contains(raidBoss.form!.toLowerCase())) {
       displayName += ' (${raidBoss.form})';
    }

    // Create a local variable for pokemonData to help with null promotion
    final Pokemon? localPokemonData = pokemonData;

    return ListTile(
       leading: imageUrl != null
           ? Stack(
                alignment: Alignment.bottomRight,
                children: [
                    CachedNetworkImage(
                        imageUrl: imageUrl,
                        placeholder: (context, url) => const LoadingIndicator(size: 30),
                        errorWidget: (context, url, error) => fallbackPokemonImage(dexNr ?? 0, size: 40),
                        height: 40,
                        width: 40,
                        fit: BoxFit.contain,
                    ),
                     if (raidBoss.shiny)
                         Icon(Icons.star, color: Colors.amber.shade700, size: 16),
                ],
             )
           : fallbackPokemonImage(dexNr ?? 0, size: 40), // Fallback if no URL
       title: Text(displayName),
       // Explicitly check if localPokemonData is not null before building the subtitle Wrap
       subtitle: localPokemonData != null ? Wrap(
           spacing: 4.0,
           children: [
               // Access properties only if localPokemonData is not null
               if (localPokemonData.primaryType != null)
                   Chip(label: Text(localPokemonData.primaryType!.localizedName(locale)), padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
               if (localPokemonData.secondaryType != null)
                   Chip(label: Text(localPokemonData.secondaryType!.localizedName(locale)), padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
           ],
       ) : null, // Return null if localPokemonData is null
       onTap: () {
           // Navigate only if localPokemonData is not null
           if (localPokemonData != null) {
               Navigator.push(
                   context,
                   // Pass the non-nullable localPokemonData here
                   MaterialPageRoute(builder: (context) => PokemonDetailScreen(pokemon: localPokemonData))
               );
           }
       },
    );
  }
}
