import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart';
import 'package:mydexpogo/data/models/pokedex_display_item.dart'; // Use the new model
import 'package:mydexpogo/ui/widgets/loading_indicator.dart';
import 'package:mydexpogo/utils/image_helper.dart';
import 'package:mydexpogo/utils/localization_helper.dart';

class PokedexListItem extends StatelessWidget {
  final PokedexDisplayItem displayItem; // Use PokedexDisplayItem
  final String locale;
  final bool isSelected;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const PokedexListItem({
    required this.displayItem, // Updated parameter
    required this.locale,
    this.isSelected = false,
    this.onTap,
    this.onLongPress,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final iconUrl = displayItem.getImageUrl(); // Use getter from display item
    final formCostumeCount = displayItem.formCostumeCount; // Use getter

    return Card(
      color: isSelected ? theme.colorScheme.primaryContainer.withOpacity(0.6) : theme.cardColor,
      elevation: isSelected ? 3 : 1,
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            children: [
              // Image
              Hero(
                // Use displayKey for unique Hero tag across variations
                tag: 'pokemon_image_${displayItem.displayKey}',
                child: CachedNetworkImage(
                    imageUrl: iconUrl,
                    placeholder: (context, url) => const LoadingIndicator(size: 40),
                    errorWidget: (context, url, error) => fallbackPokemonImage(displayItem.dexNr, size: 50),
                    fit: BoxFit.contain,
                    height: 50,
                    width: 50,
                ),
              ),
              const SizedBox(width: 12),
              // Name and Dex Nr / Variation Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      // Use the display name which includes variations
                      displayItem.displayName(locale),
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                       maxLines: 2, // Allow wrapping
                    ),
                    Text(
                      '#${displayItem.dexNr.toString().padLeft(3, '0')}',
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
                         displayItem.hasShiny ? Icons.star : Icons.star_border,
                         color: displayItem.hasShiny ? Colors.amber.shade700 : Colors.grey,
                         size: 18,
                       ),
                       const SizedBox(width: 4),
                     ],
                   ),
                   const SizedBox(height: 4),
                   if (formCostumeCount > 0)
                      Text(
                        // TODO: Localize "Forms: {count}"
                        "Forms: $formCostumeCount",
                        style: theme.textTheme.bodySmall,
                      )
                   else
                      const SizedBox(height: 14),
                ],
              ),
              // Selection indicator
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
