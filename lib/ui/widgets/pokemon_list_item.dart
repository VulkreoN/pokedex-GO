import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import
import 'package:mydexpogo/utils/image_helper.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import


class PokemonListItem extends StatelessWidget {
  final Pokemon pokemon;
  final String locale;
  final bool isSelected;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const PokemonListItem({
    required this.pokemon,
    required this.locale,
    this.isSelected = false,
    this.onTap,
    this.onLongPress,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n; // Get localizations
    // Use icon URL logic (adapt as needed)
    final iconUrl = pokemon.getIconUrl() ?? ApiConfig.fallbackPokemonIconUrl(pokemon.dexNr);
    // Calculate number of unique forms/costumes (excluding the base form)
    final uniqueFormsCostumes = pokemon.assetForms
        .where((f) => f.form != null || f.costume != null) // Filter out base/default entries if they lack form/costume name
        .map((f) => '${f.form}_${f.costume}') // Create a unique key for form/costume combo
        .toSet(); // Use a Set to count unique combinations
    final formCostumeCount = uniqueFormsCostumes.length;

    return Card(
      color: isSelected ? theme.colorScheme.primaryContainer.withOpacity(0.6) : theme.cardColor,
      elevation: isSelected ? 3 : 1,
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: InkWell( // InkWell provides ripple effect
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            children: [
              // Image
              Hero( // Optional: Add Hero animation
                tag: 'pokemon_image_${pokemon.dexNr}', // Match tag in detail screen
                child: CachedNetworkImage(
                    imageUrl: iconUrl,
                    placeholder: (context, url) => const LoadingIndicator(size: 40),
                    errorWidget: (context, url, error) => fallbackPokemonImage(pokemon.dexNr, size: 50), // Use fallback helper
                    fit: BoxFit.contain,
                    height: 50,
                    width: 50,
                ),
              ),
              const SizedBox(width: 12),
              // Name and Dex Nr
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      pokemon.localizedName(locale),
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '#${pokemon.dexNr.toString().padLeft(3, '0')}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Shiny and Form/Costume Info
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                   Row(
                     mainAxisSize: MainAxisSize.min,
                     children: [
                       Icon(
                         pokemon.hasShiny ? Icons.star : Icons.star_border,
                         color: pokemon.hasShiny ? Colors.amber.shade700 : Colors.grey,
                         size: 18,
                       ),
                       const SizedBox(width: 4),
                       // Optional: Text("Shiny")
                     ],
                   ),
                   const SizedBox(height: 4),
                   if (formCostumeCount > 0)
                      Text(
                        // TODO: Localize "Forms: {count}"
                        "Forms: $formCostumeCount",
                        style: theme.textTheme.bodySmall,
                      )
                   else // Provide some space even if count is 0
                      const SizedBox(height: 14), // Adjust height to match text style roughly
                ],
              ),
              // Selection indicator (optional, could use card color as primary indicator)
              if (isSelected)
                const Padding(
                  padding: EdgeInsets.only(left: 8.0),
                  child: Icon(Icons.check_circle, size: 18),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
