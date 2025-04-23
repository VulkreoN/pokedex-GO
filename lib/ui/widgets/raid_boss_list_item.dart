import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart';
import 'package:mydexpogo/data/models/pokemon.dart';
// ** Import PokedexDisplayItem **
import 'package:mydexpogo/data/models/pokedex_display_item.dart';
import 'package:mydexpogo/data/models/raid_boss.dart';
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';
import 'package:mydexpogo/utils/image_helper.dart';
import 'package:mydexpogo/utils/localization_helper.dart';
import 'package:mydexpogo/ui/screens/pokemon_detail_screen.dart';


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
    final l10n = context.l10n;
    final textTheme = Theme.of(context).textTheme;
    final int? dexNr = raidBoss.dexNr;

    String? imageUrl = raidBoss.iconUrl;
    if (imageUrl == null && dexNr != null) {
       imageUrl = ApiConfig.fallbackPokemonIconUrl(dexNr);
    }

    String displayName = raidBoss.localizedName(locale);
    if (raidBoss.form != null && !displayName.toLowerCase().contains(raidBoss.form!.toLowerCase())) {
       displayName += ' (${raidBoss.form})';
    }

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
           : fallbackPokemonImage(dexNr ?? 0, size: 40),
       title: Text(displayName),
       subtitle: localPokemonData != null ? Wrap(
           spacing: 4.0,
           children: [
               if (localPokemonData.primaryType != null)
                   Chip(label: Text(localPokemonData.primaryType!.localizedName(locale)), padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
               if (localPokemonData.secondaryType != null)
                   Chip(label: Text(localPokemonData.secondaryType!.localizedName(locale)), padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
           ],
       ) : null,
       onTap: () {
           // ** FIX: Create PokedexDisplayItem and pass it **
           if (localPokemonData != null) {
               // Create a display item representing this specific raid boss form
               // Note: We might not have the exact PokemonAssetForm here,
               // so we pass null for assetForm. The detail screen will show base info.
               // If the raid boss API provided more specific asset details, we could use those.
               final displayItem = PokedexDisplayItem(
                   basePokemon: localPokemonData,
                   // We don't have the specific assetForm for the raid boss form here,
                   // unless we add logic to find it based on raidBoss.form name.
                   // Passing null means detail screen shows base image/info primarily.
                   assetForm: localPokemonData.assetForms.firstWhere(
                       (f) => f.form == raidBoss.form, // Try to find matching form
                       orElse: () => localPokemonData.assetForms.firstWhere( // Fallback to base form asset
                           (f) => f.form == null && f.costume == null,
                           orElse: () => null!, // Should have a base form
                       ) ,
                   ),
               );

               Navigator.push(
                   context,
                   // Pass the created displayItem
                   MaterialPageRoute(builder: (context) => PokemonDetailScreen(displayItem: displayItem))
               );
           }
       },
    );
  }
}
